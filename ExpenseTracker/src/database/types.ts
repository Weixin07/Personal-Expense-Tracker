export type ExpenseRecord = {
  id: number;
  description: string;
  amountNative: number;
  currencyCode: string;
  fxRateToBase: number;
  baseAmount: number;
  date: string;
  categoryId: number | null;
  notes: string | null;
  createdAt: string;
  updatedAt: string;
};

export type NewExpenseRecord = Omit<ExpenseRecord, "id" | "createdAt" | "updatedAt">;

export type UpdateExpenseRecord = Omit<ExpenseRecord, "createdAt" | "updatedAt">;

export type ExpenseQueryFilters = {
  categoryId?: number;
  startDate?: string;
  endDate?: string;
  limit?: number;
  offset?: number;
};

export type CategoryRecord = {
  id: number;
  name: string;
  createdAt: string;
  updatedAt: string;
};

export type NewCategoryRecord = Omit<CategoryRecord, "id" | "createdAt" | "updatedAt">;

export type UpdateCategoryRecord = Omit<CategoryRecord, "createdAt" | "updatedAt">;

export type AppSettingRecord = {
  key: string;
  value: string | null;
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
