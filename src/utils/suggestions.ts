import { localIsoDateOffset } from './date';
import type {
  TransactionDirection,
  TransactionRecord,
  TransactionType,
} from '../database';

export type SuggestionField = 'description' | 'payee';

/**
 * How far back a value counts as recently used. The window is measured against
 * a transaction's own `date`, not when its row was written: a database rebuilt
 * from a CSV backup carries today's `created_at` on every restored row, which
 * would make an entire history look recent.
 */
export const SUGGESTION_WINDOW_MONTHS = 12;

/**
 * The recency window to read a transfer's history with, passed as
 * `windowMonths` by a caller scoping to `type: 'transfer'`. Transfers are far
 * rarer than expenses, so the ordinary window leaves too thin a history in the
 * recent tier for ranking to discriminate between values.
 */
export const TRANSFER_SUGGESTION_WINDOW_MONTHS = 24;

export const MAX_SUGGESTIONS = 6;

export type FrequencyOptions = {
  now?: Date;
  windowMonths?: number;
  /**
   * Limits counting to one transaction type. Omit to count every transaction
   * of every type, transfers included.
   */
  type?: TransactionType;
  excludeTransactionId?: number;
};

/**
 * Category usage is only ever counted per direction, so this cannot be scoped
 * to a transfer — transfers carry no category to count.
 */
export type CategoryUsageOptions = Omit<
  FrequencyOptions,
  'excludeTransactionId' | 'type'
> & {
  type?: TransactionDirection;
};

/**
 * Fund usage, unlike category usage, is countable for a transfer, so this
 * widens the scope back to the full transaction type.
 */
export type FundUsageOptions = Omit<CategoryUsageOptions, 'type'> & {
  type?: TransactionType;
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
  localIsoDateOffset(now, { months: -windowMonths });

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
 * The best `limit` values for a query, in the index's own order. An empty
 * query matches every entry and so yields the top of the ranking, which is
 * what a field that has been focused but not yet typed into should offer.
 */
export const filterSuggestions = (
  index: SuggestionIndex,
  query: string,
  limit: number = MAX_SUGGESTIONS,
): string[] => {
  const needle = groupKey(query);
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
  options: CategoryUsageOptions = {},
): ReadonlyMap<number, CategoryUsage> => {
  const {
    now = new Date(),
    windowMonths = SUGGESTION_WINDOW_MONTHS,
    type,
  } = options;
  const cutoff = windowStartDate(now, windowMonths);
  const counts = new Map<number, CategoryUsage>();

  transactions.forEach(transaction => {
    // A transfer carries no category by design, enforced when a form is
    // validated. This skip must survive: unlike the type scope in
    // `buildSuggestionIndex`, it is not a scoping rule but the invariant, and
    // dropping it would count categories that cannot exist.
    if (transaction.categoryId == null || transaction.type === 'transfer') {
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
 * Usage per fund id, counting both sides of a transfer: money moved into a fund
 * is use of that fund. `type` limits which rows are considered, and both-sides
 * counting applies within that scope. Funds never used are absent rather than
 * zeroed.
 */
export const rankFundIdsByFrequency = (
  transactions: readonly TransactionRecord[],
  options: FundUsageOptions = {},
): ReadonlyMap<number, CategoryUsage> => {
  const {
    now = new Date(),
    windowMonths = SUGGESTION_WINDOW_MONTHS,
    type,
  } = options;
  const cutoff = windowStartDate(now, windowMonths);
  const counts = new Map<number, CategoryUsage>();

  const count = (fundId: number, inWindow: boolean): void => {
    const current = counts.get(fundId) ?? { inWindow: 0, older: 0 };
    if (inWindow) {
      current.inWindow += 1;
    } else {
      current.older += 1;
    }
    counts.set(fundId, current);
  };

  transactions.forEach(transaction => {
    if (type && transaction.type !== type) {
      return;
    }
    const inWindow = transaction.date >= cutoff;
    count(transaction.fundId, inWindow);
    if (transaction.counterpartFundId != null) {
      count(transaction.counterpartFundId, inWindow);
    }
  });

  return counts;
};

/**
 * Category usage in all three scopes a picker can be opened in: from a form
 * that knows its direction, or from a filter that does not.
 */
export const buildCategoryUsageCounts = (
  transactions: readonly TransactionRecord[],
  options: Omit<CategoryUsageOptions, 'type'> = {},
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
