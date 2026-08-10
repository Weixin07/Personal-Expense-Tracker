/** Direction a transaction moves money. */
export type TransactionType = 'expense' | 'income';

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
  startDate?: string;
  endDate?: string;
  limit?: number;
  offset?: number;
};

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
