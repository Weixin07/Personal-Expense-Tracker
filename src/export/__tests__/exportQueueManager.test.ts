import { writeExportFile } from '../exportQueueManager';
import { createCsvFileInDirectory } from '../../security/storageAccess';
import type { ExpenseRecord, CategoryRecord } from '../../database';

jest.mock('../../security/storageAccess');

const mockCreate = createCsvFileInDirectory as jest.Mock;

const expenses: ExpenseRecord[] = [
  {
    id: 1,
    description: 'Weekly groceries',
    payee: 'Tesco',
    amountNative: 45.5,
    currencyCode: 'GBP',
    fxRateToBase: 1.0,
    baseAmount: 45.5,
    baseCurrencyCode: 'GBP',
    date: '2025-01-15',
    categoryId: 1,
    notes: null,
    createdAt: '2025-01-15T10:00:00.000Z',
    updatedAt: '2025-01-15T10:00:00.000Z',
  },
];

const categories: CategoryRecord[] = [
  {
    id: 1,
    name: 'Groceries',
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  },
];

beforeEach(() => {
  jest.clearAllMocks();
  mockCreate.mockResolvedValue('content://mock/file');
});

describe('writeExportFile', () => {
  it('builds the CSV and writes it to the chosen directory', async () => {
    const result = await writeExportFile({
      directoryUri: 'content://mock/tree',
      expenses,
      categories,
    });

    const [directoryUri, filename, content] = mockCreate.mock.calls[0];
    expect(directoryUri).toBe('content://mock/tree');
    expect(filename).toMatch(/^expenses_backup_\d{8}_\d{6}\.csv$/);
    expect(content).toContain('Groceries');

    expect(result).toEqual({
      filename,
      fileUri: 'content://mock/file',
      filePath: 'content://mock/file',
      contentSize: content.length,
    });
  });

  it('defaults categories to an empty list when omitted', async () => {
    const result = await writeExportFile({
      directoryUri: 'content://mock/tree',
      expenses,
    });

    expect(mockCreate).toHaveBeenCalledTimes(1);
    const [, , content] = mockCreate.mock.calls[0];
    expect(result.contentSize).toBe(content.length);
  });

  it('aliases filePath to the returned fileUri', async () => {
    mockCreate.mockResolvedValue('content://mock/other');

    const result = await writeExportFile({
      directoryUri: 'content://mock/tree',
      expenses,
      categories,
    });

    expect(result.fileUri).toBe('content://mock/other');
    expect(result.filePath).toBe('content://mock/other');
  });
});
