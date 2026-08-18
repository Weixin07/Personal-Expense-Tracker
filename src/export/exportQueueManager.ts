import { buildTransactionsCsv } from './csvBuilder';
import type {
  TransactionRecord,
  CategoryRecord,
  FundRecord,
} from '../database';
import { createCsvFileInDirectory } from '../security/storageAccess';

export type QueueExportPayload = {
  directoryUri: string;
  transactions: readonly TransactionRecord[];
  categories?: readonly CategoryRecord[];
  funds?: readonly FundRecord[];
};

export type QueueExportResult = {
  filename: string;
  fileUri: string;
  filePath?: string | null;
  contentSize: number;
};

export const writeExportFile = async ({
  directoryUri,
  transactions,
  categories = [],
  funds = [],
}: QueueExportPayload): Promise<QueueExportResult> => {
  const { filename, content } = buildTransactionsCsv({
    transactions,
    categories,
    funds,
  });
  const fileUri = await createCsvFileInDirectory(
    directoryUri,
    filename,
    content,
  );

  return {
    filename,
    fileUri,
    filePath: fileUri,
    contentSize: content.length,
  };
};
