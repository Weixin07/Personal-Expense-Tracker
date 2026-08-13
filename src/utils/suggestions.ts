import { localIsoDate } from './date';
import type { TransactionRecord, TransactionType } from '../database';

export type SuggestionField = 'description' | 'payee';

/**
 * How far back a value counts as recently used. The window is measured against
 * a transaction's own `date`, not when its row was written: a database rebuilt
 * from a CSV backup carries today's `created_at` on every restored row, which
 * would make an entire history look recent.
 */
export const SUGGESTION_WINDOW_MONTHS = 12;

export const MAX_SUGGESTIONS = 6;

export const MIN_QUERY_LENGTH = 1;

export type FrequencyOptions = {
  now?: Date;
  windowMonths?: number;
  /** Limits counting to one direction. Omit to count every transaction. */
  type?: TransactionType;
  excludeTransactionId?: number;
};

/**
 * Uses split either side of the recency window. Ranking reads `inWindow` first
 * and `older` second, so a value used recently outranks one used more often
 * long ago.
 */
export type CategoryUsage = {
  inWindow: number;
  older: number;
};

export type CategoryUsageCounts = {
  all: ReadonlyMap<number, CategoryUsage>;
  expense: ReadonlyMap<number, CategoryUsage>;
  income: ReadonlyMap<number, CategoryUsage>;
};

export type SuggestionEntry = {
  /** The spelling shown to the user: the most recently used one of its group. */
  value: string;
  matchKey: string;
  inWindow: number;
  older: number;
};

export type SuggestionIndex = readonly SuggestionEntry[];

export const EMPTY_CATEGORY_USAGE: CategoryUsage = { inWindow: 0, older: 0 };

const EMPTY_USAGE_MAP: ReadonlyMap<number, CategoryUsage> = new Map();

export const EMPTY_CATEGORY_USAGE_COUNTS: CategoryUsageCounts = {
  all: EMPTY_USAGE_MAP,
  expense: EMPTY_USAGE_MAP,
  income: EMPTY_USAGE_MAP,
};

/**
 * Spellings that differ only by casing or by runs of whitespace name the same
 * thing; punctuation is left alone, since `AT&T` and `ATT` may not.
 */
const collapseWhitespace = (value: string): string =>
  value.trim().replace(/\s+/g, ' ');

const groupKey = (value: string): string =>
  collapseWhitespace(value).toLowerCase();

const windowStartDate = (now: Date, windowMonths: number): string =>
  localIsoDate(
    new Date(now.getFullYear(), now.getMonth() - windowMonths, now.getDate()),
  );

type Occurrence = {
  date: string;
  time: string | null;
  id: number;
};

/**
 * When two occurrences fall on the same day. A record with no time is treated
 * as the earliest point in its day, matching how SQLite orders the null the
 * column is allowed to hold.
 */
const compareTimestamps = (a: Occurrence, b: Occurrence): number => {
  if (a.date !== b.date) {
    return a.date < b.date ? -1 : 1;
  }
  const timeA = a.time ?? '';
  const timeB = b.time ?? '';
  if (timeA === timeB) {
    return 0;
  }
  return timeA < timeB ? -1 : 1;
};

/**
 * Which of two occurrences supplies the spelling to display. Falls back to the
 * id so the choice cannot depend on the order rows arrived in.
 */
const isMoreRecent = (candidate: Occurrence, current: Occurrence): boolean => {
  const byTimestamp = compareTimestamps(candidate, current);
  return byTimestamp === 0 ? candidate.id > current.id : byTimestamp > 0;
};

type Group = SuggestionEntry & { latest: Occurrence };

const compareGroups = (a: Group, b: Group): number => {
  if (a.inWindow !== b.inWindow) {
    return b.inWindow - a.inWindow;
  }
  if (a.older !== b.older) {
    return b.older - a.older;
  }
  const byRecency = compareTimestamps(b.latest, a.latest);
  return byRecency === 0 ? a.value.localeCompare(b.value) : byRecency;
};

const isEligible = (
  transaction: TransactionRecord,
  type: TransactionType | undefined,
  excludeTransactionId: number | undefined,
): boolean => {
  if (excludeTransactionId != null && transaction.id === excludeTransactionId) {
    return false;
  }
  return !type || transaction.type === type;
};

/**
 * Rank the distinct values a field has held, most useful first, as a structure
 * `filterSuggestions` can query without re-sorting. Blank values are omitted:
 * a transaction identified by its category alone stores an empty description
 * and payee, which would otherwise rank as the most-used value of all.
 */
export const buildSuggestionIndex = (
  transactions: readonly TransactionRecord[],
  field: SuggestionField,
  options: FrequencyOptions = {},
): SuggestionIndex => {
  const {
    now = new Date(),
    windowMonths = SUGGESTION_WINDOW_MONTHS,
    type,
    excludeTransactionId,
  } = options;
  const cutoff = windowStartDate(now, windowMonths);
  const groups = new Map<string, Group>();

  transactions.forEach(transaction => {
    if (!isEligible(transaction, type, excludeTransactionId)) {
      return;
    }

    const value = collapseWhitespace(transaction[field]);
    if (!value) {
      return;
    }

    const key = value.toLowerCase();
    const inWindow = transaction.date >= cutoff;
    const occurrence: Occurrence = {
      date: transaction.date,
      time: transaction.time,
      id: transaction.id,
    };
    const existing = groups.get(key);

    if (!existing) {
      groups.set(key, {
        value,
        matchKey: key,
        inWindow: inWindow ? 1 : 0,
        older: inWindow ? 0 : 1,
        latest: occurrence,
      });
      return;
    }

    if (inWindow) {
      existing.inWindow += 1;
    } else {
      existing.older += 1;
    }
    if (isMoreRecent(occurrence, existing.latest)) {
      existing.latest = occurrence;
      existing.value = value;
    }
  });

  return Array.from(groups.values())
    .sort(compareGroups)
    .map(({ value, matchKey, inWindow, older }) => ({
      value,
      matchKey,
      inWindow,
      older,
    }));
};

/**
 * The best `limit` suggestions for what has been typed so far, in the index's
 * own order. Returns nothing below `MIN_QUERY_LENGTH` characters.
 */
export const filterSuggestions = (
  index: SuggestionIndex,
  query: string,
  limit: number = MAX_SUGGESTIONS,
): string[] => {
  const needle = groupKey(query);
  if (needle.length < MIN_QUERY_LENGTH) {
    return [];
  }

  const matches: string[] = [];
  for (const entry of index) {
    if (entry.matchKey.includes(needle)) {
      matches.push(entry.value);
      if (matches.length === limit) {
        break;
      }
    }
  }
  return matches;
};

/**
 * Usage per category id. Categories never used are absent rather than zeroed,
 * so a caller ordering by usage must supply its own default for the ones it
 * knows about.
 */
export const rankCategoryIdsByFrequency = (
  transactions: readonly TransactionRecord[],
  options: Omit<FrequencyOptions, 'excludeTransactionId'> = {},
): ReadonlyMap<number, CategoryUsage> => {
  const {
    now = new Date(),
    windowMonths = SUGGESTION_WINDOW_MONTHS,
    type,
  } = options;
  const cutoff = windowStartDate(now, windowMonths);
  const counts = new Map<number, CategoryUsage>();

  transactions.forEach(transaction => {
    if (transaction.categoryId == null) {
      return;
    }
    if (type && transaction.type !== type) {
      return;
    }

    const current = counts.get(transaction.categoryId) ?? {
      inWindow: 0,
      older: 0,
    };
    if (transaction.date >= cutoff) {
      current.inWindow += 1;
    } else {
      current.older += 1;
    }
    counts.set(transaction.categoryId, current);
  });

  return counts;
};

/**
 * Category usage in all three scopes a picker can be opened in: from a form
 * that knows its direction, or from a filter that does not.
 */
export const buildCategoryUsageCounts = (
  transactions: readonly TransactionRecord[],
  options: Omit<FrequencyOptions, 'excludeTransactionId' | 'type'> = {},
): CategoryUsageCounts => ({
  all: rankCategoryIdsByFrequency(transactions, options),
  expense: rankCategoryIdsByFrequency(transactions, {
    ...options,
    type: 'expense',
  }),
  income: rankCategoryIdsByFrequency(transactions, {
    ...options,
    type: 'income',
  }),
});
