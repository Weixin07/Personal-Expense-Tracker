/**
 * Direction a transaction moves money. Narrower than `TransactionType`: a value
 * of this type can never be a transfer, so code that is only meaningful per
 * direction cannot be reached with one.
 */
export type TransactionDirection = 'expense' | 'income';

/**
 * What a transaction is: money entering or leaving the ledger, or money moving
 * between two funds. A transfer is neither spending nor income and is excluded
 * from every summary figure.
 */
export type TransactionType = TransactionDirection | 'transfer';

/**
 * Directions a category may be used for. `both` is the default, and is what a
 * category carries unless someone chooses otherwise.
 */
export type CategoryType = 'expense' | 'income' | 'both';

export type TransactionRecord = {
  id: number;
  type: TransactionType;
  description: string;
  payee: string;
  amountNative: number;
  currencyCode: string;
  fxRateToBase: number;
  baseAmount: number;
  baseCurrencyCode: string | null;
  date: string;
  /**
   * Naive local wall-clock `HH:MM` as the user entered it — no timezone, no
   * offset, never converted. `null` means no time was recorded, which is
   * distinct from `'00:00'` (midnight).
   */
  time: string | null;
  categoryId: number | null;
  /** Fund this transaction belongs to. For a transfer, the source. */
  fundId: number;
  /**
   * Destination fund of a transfer, and null for every other type. The database
   * enforces that this, `counterpartAmount` and `counterpartCurrencyCode` are
   * present together and only on a transfer.
   */
  counterpartFundId: number | null;
  /**
   * Positive magnitude that arrived in the destination fund, in
   * `counterpartCurrencyCode`. The rate a cross-currency transfer used is
   * implied by this against `amountNative` rather than stored, so the two
   * cannot disagree. When the two currencies differ the figure is one the user
   * entered or a conversion of `baseAmount`, never a copy of `amountNative`:
   * copying it would assert a rate of 1 between two different currencies.
   *
   * Records what was observed rather than what a balance is built from: a
   * fund's balance credits the destination the source's `baseAmount` instead.
   */
  counterpartAmount: number | null;
  /**
   * Currency the counterpart amount was recorded in. Stored per row rather than
   * read from the destination fund, which can be re-denominated later.
   */
  counterpartCurrencyCode: string | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type NewTransactionRecord = Omit<
  TransactionRecord,
  'id' | 'createdAt' | 'updatedAt'
>;

export type UpdateTransactionRecord = Omit<
  TransactionRecord,
  'createdAt' | 'updatedAt'
>;

export type TransactionQueryFilters = {
  type?: TransactionType;
  categoryId?: number;
  /** Matches either side of a transfer, so money moved into a fund counts. */
  fundId?: number;
  startDate?: string;
  endDate?: string;
  /**
   * Free text matched anywhere in `description`, `payee` or `notes`, compared
   * case-insensitively across ASCII letters only. Matched literally, whitespace
   * included: the caller supplies an already-trimmed value.
   */
  query?: string;
  limit?: number;
  offset?: number;
};

/**
 * A named pot money is held in and drawn down from. `openingBalance` is the
 * starting figure the running balance builds on, denominated in
 * `currencyCode`.
 */
export type FundRecord = {
  id: number;
  name: string;
  /** Null means the fund follows whatever base currency is configured. */
  currencyCode: string | null;
  openingBalance: number;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type NewFundRecord = Omit<FundRecord, 'id' | 'createdAt' | 'updatedAt'>;

export type UpdateFundRecord = Omit<FundRecord, 'createdAt' | 'updatedAt'>;

export type CategoryRecord = {
  id: number;
  name: string;
  type: CategoryType;
  createdAt: string;
  updatedAt: string;
};

export type NewCategoryRecord = Omit<
  CategoryRecord,
  'id' | 'createdAt' | 'updatedAt'
>;

export type UpdateCategoryRecord = Omit<
  CategoryRecord,
  'createdAt' | 'updatedAt'
>;

export type AppSettingRecord = {
  key: string;
  value: string | null;
};

export type CurrencyFxRateRecord = {
  baseCurrencyCode: string;
  currencyCode: string;
  fxRateToBase: number;
  updatedAt: string;
};
export type ExportQueueRecord = {
  id: string;
  filename: string;
  filePath: string;
  fileUri: string | null;
  status: 'pending' | 'uploading' | 'completed' | 'failed';
  createdAt: string;
  updatedAt: string;
  uploadedAt: string | null;
  driveFileId: string | null;
  lastError: string | null;
};
