import type {
  CategoryRecord,
  CategoryType,
  CurrencyFxRateRecord,
  NewTransactionRecord,
  TransactionRecord,
  TransactionType,
} from '../database';

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
 * a rate the file stated outright, parity because native and base match, a rate
 * implied by a base amount the file supplied, a rate the user confirmed during
 * review, or the cached rate for the pair.
 *
 * `column`, `parity` and `derived` are authoritative — a rate confirmed for the
 * whole import must not overwrite one the file stated or implied per row.
 * `parity` rows have no currency pair to key a rate against; a `derived` rate
 * reproduces the conversion the source recorded when the transaction happened,
 * which a single present-day rate would destroy.
 */
export type FxRateSource =
  | 'column'
  | 'parity'
  | 'derived'
  | 'manual'
  | 'cached';

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
  /** When `suggestedRate` was last saved, so its age is visible beside it. */
  suggestedRateUpdatedAt: string | null;
  rowCount: number;
};

/**
 * A pair whose rate was derived from a base amount the file supplied but does
 * not survive a sanity check. The usual cause is a base-amount column holding
 * the file's own currency rather than the base currency: every row then derives
 * a rate of 1 and stores its native amount unconverted. `rowCount` is how many
 * rows the pair would import that way.
 */
export type SuspectDerivedRate = {
  baseCurrencyCode: string;
  currencyCode: string;
  rate: number;
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

/**
 * A source column carrying values that no target field claims, so its content is
 * discarded on import. `sampleValue` is the first non-empty cell, which names
 * what is being lost far better than a column number does.
 */
export type UnmappedColumn = {
  index: number;
  header: string;
  sampleValue: string;
};

/**
 * An incoming category name close enough to an existing one to be the same
 * category spelled differently. Offered for the user to accept or ignore;
 * nothing is merged without an explicit choice. `rowCount` is how many rows
 * carry the incoming name, so the weight of a merge is visible before it is made.
 */
export type CategorySuggestion = {
  sourceName: string;
  existingName: string;
  existingId: number;
  rowCount: number;
};

/**
 * An existing category the import would widen to `both`, because it files rows
 * against it in a direction its current type excludes.
 */
export type CategoryTypeWidening = {
  name: string;
  from: CategoryType;
};

/**
 * Choices collected during review that change what `commitImport` writes.
 * `categoryAliases` maps a lower-cased incoming category name to the existing
 * category name the user chose to file it under.
 */
export type CommitImportOptions = {
  skipDuplicates?: boolean;
  categoryAliases?: Record<string, string>;
};

export type ImportContext = {
  baseCurrency: string | null;
  /**
   * Applied when the source has no currency column, or the column is blank.
   * Without it such rows cannot be imported at all.
   */
  defaultCurrency: string | null;
  /**
   * Chosen ISO code per raw currency cell that maps to more than one currency,
   * keyed by the lower-cased raw value (e.g. `$` → `AUD`).
   */
  currencyChoices: Record<string, string>;
  negativeMeans: NegativeAmountMeaning;
  numberFormat: NumberFormat;
  delimiter?: CsvDelimiter;
  /**
   * Rates the user confirmed during review, keyed by `fxPairKey`. Consulted
   * after a rate the file supplied and before the cache, so confirming a rate
   * corrects a stale cached one rather than being shadowed by it.
   */
  manualFxRates?: Record<string, number>;
  /**
   * Whether a saved rate may stand in for one the user has not confirmed.
   * Defaults to true. Set false once a saved rate has been rejected, so the
   * rows it covered are held in `needsFxRate` rather than resolving from it.
   * A confirmed rate still wins either way.
   */
  useCachedRates?: boolean;
  fxRateCache: readonly CurrencyFxRateRecord[];
  existingTransactions: readonly TransactionRecord[];
  existingCategories: readonly CategoryRecord[];
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
  /**
   * Pairs whose derived rate contradicts what the pair is known to be worth.
   * Advisory rather than a rejection: the rows sit in `valid` and import as they
   * stand, so a caller that ignores this imports them at the suspect rate.
   */
  suspectDerivedRates: SuspectDerivedRate[];
  /** Ambiguous currency cells blocking rows until the user picks a code. */
  currencyReview: AmbiguousCurrency[];
  duplicates: DuplicateFlag[];
  newCategoryNames: string[];
  /**
   * Populated source columns no target field claims. Reported so a column cannot
   * be discarded without the user seeing it; empty columns are omitted, since
   * dropping them loses nothing.
   */
  unmappedColumns: UnmappedColumn[];
  /**
   * True when rows of more than one currency would be stored with no base
   * currency to convert them to. Such rows land in the ledger at face value
   * alongside amounts of other currencies, with nothing to mark them apart, so
   * the import is held until a base currency is set.
   */
  mixedCurrencyWithoutBase: boolean;
  /** Existing categories an incoming name may be a respelling of. */
  categorySuggestions: CategorySuggestion[];
  /**
   * Categories this import would widen to `both`. Disclosed before the commit
   * because widening edits a category the user configured by hand.
   */
  categoryTypeWidenings: CategoryTypeWidening[];
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

/** A rate an import saved as the current one for its pair. */
export type SeededRate = {
  baseCurrencyCode: string;
  currencyCode: string;
  fxRateToBase: number;
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
  /**
   * Rows left behind because they duplicate a stored transaction or an earlier
   * row and duplicate skipping was on. Disjoint from the other two counts: these
   * rows are importable, and would have been imported with skipping off.
   */
  skippedDuplicates: number;
  createdCategories: number;
  /**
   * Rates this import saved as the current rate for their pair, in the order
   * they were written. Reported so a rate taken from historical rows cannot
   * become the default for new entry unnoticed.
   */
  seededRates: SeededRate[];
};
