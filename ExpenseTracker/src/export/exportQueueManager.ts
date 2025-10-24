import RNFS from 'react-native-fs';
import { buildExpensesCsv } from './csvBuilder';
import type { ExpenseRecord, CategoryRecord } from '../database';

const EXPORT_DIRECTORY = `${RNFS.DocumentDirectoryPath}/exports`;

const ensureExportDirectory = async (): Promise<string> => {
  const exists = await RNFS.exists(EXPORT_DIRECTORY);
  if (!exists) {
    await RNFS.mkdir(EXPORT_DIRECTORY);
  }
  return EXPORT_DIRECTORY;
};

export type QueueExportPayload = {
  expenses: readonly ExpenseRecord[];
  categories?: readonly CategoryRecord[];
};

export type QueueExportResult = {
  filename: string;
  filePath: string;
  contentSize: number;
};

export const writeExportFile = async ({
  expenses,
  categories = [],
}: QueueExportPayload): Promise<QueueExportResult> => {
  await ensureExportDirectory();

  const { filename, content } = buildExpensesCsv({ expenses, categories });
  const filePath = `${EXPORT_DIRECTORY}/${filename}`;

  await RNFS.writeFile(filePath, content, 'utf8');

  return { filename, filePath, contentSize: content.length };
};