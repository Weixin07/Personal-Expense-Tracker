import type { NewTransactionRecord, TransactionType } from '../database';

export type ImportTargetField =
  | 'description'
  | 'payee'
  | 'amountNative'
  | 'currencyCode'
  | 'fxRateToBase'
  | 'baseAmount'
  | 'baseCurrencyCode'
  | 'date'
  | 'time'
  | 'categoryName'
  | 'notes'
  | 'transactionType';

export type FieldMapping = Partial<Record<ImportTargetField, number>>;

export type CsvDelimiter = ',' | ';' | '\t';

/** Resolved day/month order of a numeric date column. */
export type DateOrder = 'dmy' | 'mdy';

/**
 * Under `auto` the order is inferred from the date column as a whole: when any
 * row proves the order (a component above 12) that order applies to every row.
 * A column with no such evidence, or with rows proving both orders, falls back
 * to per-value resolution, where a genuinely ambiguous `01/02/2024` is rejected
 * so the caller's explicit day/month choice stays the tiebreaker.
 */
export type DateFormat = 'auto' | 'iso' | 'dmy' | 'mdy';

/**
 * `auto` treats the last `.` or `,` as the decimal separator and any earlier one
 * as grouping. `us`/`eu` force that choice for values a reader cannot resolve,
 * such as a bare `1.234`.
 */
export type NumberFormat = 'auto' | 'us' | 'eu';

/**
 * Which direction a negative amount denotes in the source file. Expense
 * trackers export income as the negative side; bank statements use negative for
 * money leaving the account.
 *
 * Consulted only when the row carries no usable transaction-type value: a
 * mapped type column is authoritative over the sign. It is also bypassed when
 * the file contains no negative amount at all — a sign convention cannot
 * classify rows in a file that carries no signs, so those rows are read as
 * expenses whatever this is set to.
 */
export type NegativeAmountMeaning = 'income' | 'expense';

/** Direction a row moves money, read from an explicit transaction-type column. */
export type TransactionDirection = TransactionType;

/**
 * Where a prepared row's FX rate came from, in the order the resolver prefers:
 * a rate the file itself supplied, a rate the user confirmed during review, the
 * cached rate for the pair, or parity because native and base match.
 *
 * `column` is authoritative — a rate confirmed for the whole import must not
 * overwrite one the file stated per row. `parity` rows have no currency pair to
 * key a rate against and are likewise never overridden.
 */
export type FxRateSource = 'column' | 'manual' | 'cached' | 'parity';

/**
 * Address a rate by the pair it converts, since one native currency can appear
 * under several base currencies in the same file. Used for `ImportContext`
 * manual rates and for `commitImport` overrides, which must agree.
 */
export const fxPairKey = (
  baseCurrencyCode: string,
  currencyCode: string,
): string => `${baseCurrencyCode}|${currencyCode}`;

export type ParsedRow = {
  line: number;
  cells: string[];
};

export type ParsedCsv = {
  header: string[];
  delimiter: CsvDelimiter;
  rows: ParsedRow[];
};

export type ImportRowError = {
  line: number;
  reason: string;
};

/**
 * A distinct (base, native) currency pair that had no explicit rate in the file.
 * `suggestedRate` is the latest cached rate, or null when none is known and the
 * user must supply one. `rowCount` is how many rows of the import depend on this
 * pair, so a confirmation can state what a rate is about to affect.
 */
export type FxSuggestion = {
  baseCurrencyCode: string;
  currencyCode: string;
  suggestedRate: number | null;
  rowCount: number;
};

/**
 * A raw currency cell that maps to more than one ISO code, such as `$` or `kr`.
 * Carries every candidate so the user can pick one; the choice is fed back
 * through `ImportContext.currencyChoices`.
 */
export type AmbiguousCurrency = {
  raw: string;
  candidates: string[];
};

export type DuplicateFlag = {
  line: number;
  /**
   * Existing transaction this row matches, or null when the match is an earlier row
   * in the same file rather than something already stored.
   */
  matchesTransactionId: number | null;
  /**
   * Earlier line in the same file carrying the same date, amount, currency,
   * payee and description.
   */
  matchesLine?: number;
};

export type PreparedTransaction = {
  line: number;
  record: Omit<NewTransactionRecord, 'categoryId'>;
  categoryName: string | null;
  fxRateSource: FxRateSource;
};

export type ImportPreview = {
  valid: PreparedTransaction[];
  invalid: ImportRowError[];
  /**
   * Rows held back only because the rate for their currency pair is unknown.
   * Reported separately from `invalid` because the file is not at fault, and
   * supplying the rate makes the row importable.
   */
  needsFxRate: ImportRowError[];
  /**
   * Rows imported with no time because their time cell could not be read.
   * Advisory, not a rejection: time is not a required field, so an unreadable
   * one must not discard a row whose amount, currency and date are all valid.
   */
  unreadableTimes: ImportRowError[];
  fxReview: FxSuggestion[];
  /** Ambiguous currency cells blocking rows until the user picks a code. */
  currencyReview: AmbiguousCurrency[];
  duplicates: DuplicateFlag[];
  newCategoryNames: string[];
  totalRows: number;
  /**
   * Day/month order inferred from the date column, or null when the caller
   * chose an explicit format or the column offered no conclusive evidence.
   */
  inferredDateOrder: DateOrder | null;
  /**
   * True when the file carried no negative amount anywhere, so rows without a
   * declared type were read as expenses rather than through the sign
   * convention.
   */
  signConventionBypassed: boolean;
};

export type ImportSummary = {
  insertedExpenses: number;
  insertedIncome: number;
  skippedInvalid: number;
  /**
   * Rows left behind because their pair still had no rate when the import ran.
   * Disjoint from `skippedInvalid`: these rows are well-formed and become
   * importable once a rate is supplied.
   */
  skippedNeedsFxRate: number;
  createdCategories: number;
};
