import { buildExpensesCsv } from './csvBuilder';
import type { ExpenseRecord, CategoryRecord } from '../database';
import { createCsvFileInDirectory } from '../security/storageAccess';

export type QueueExportPayload = {
  directoryUri: string;
  expenses: readonly ExpenseRecord[];
  categories?: readonly CategoryRecord[];
};

export type QueueExportResult = {
  filename: string;
  fileUri: string;
  filePath?: string | null;
  contentSize: number;
};

export const writeExportFile = async ({
  directoryUri,
  expenses,
  categories = [],
}: QueueExportPayload): Promise<QueueExportResult> => {
  const { filename, content } = buildExpensesCsv({ expenses, categories });
  const fileUri = await createCsvFileInDirectory(directoryUri, filename, content);

  return {
    filename,
    fileUri,
    filePath: fileUri,
    contentSize: content.length,
  };
};
