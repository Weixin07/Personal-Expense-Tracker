import React, { useEffect } from 'react';
import { AppState } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import * as Keychain from 'react-native-keychain';
import {
  renderWithProviders,
  act,
  screen,
  waitFor,
} from '../../__tests__/test-utils/renderWithProviders';
import {
  TransactionDataProvider,
  useTransactionData,
  type TransactionDataContextValue,
} from '../AppContext';
import * as db from '../../database';
import * as exportModule from '../../export';
import * as importModule from '../../import';
import * as storageAccess from '../../security/storageAccess';
import type { TransactionRecord, CategoryRecord } from '../../database';
import type { ImportPreview } from '../../import';

jest.mock('../../database', () => ({
  withDatabase: jest.fn(),
  listTransactions: jest.fn(),
  createTransaction: jest.fn(),
  updateTransaction: jest.fn(),
  deleteTransaction: jest.fn(),
  listCategories: jest.fn(),
  createCategory: jest.fn(),
  updateCategory: jest.fn(),
  deleteCategory: jest.fn(),
  getAllSettings: jest.fn(),
  setSetting: jest.fn(),
  listExportQueue: jest.fn(),
  listCurrencyFxRates: jest.fn(),
  upsertCurrencyFxRate: jest.fn(),
  insertExportQueueItem: jest.fn(),
  updateExportQueueStatus: jest.fn(),
  removeExportQueueItem: jest.fn(),
  clearCompletedExportQueueItems: jest.fn(),
}));

jest.mock('../../export', () => ({
  writeExportFile: jest.fn(),
  uploadPendingExports: jest.fn(),
}));

jest.mock('../../import', () => ({
  commitImport: jest.fn(),
}));

jest.mock('../../security/storageAccess', () => ({
  requestDirectorySelection: jest.fn(),
  deleteFileUri: jest.fn(),
}));

const mockDb = db as jest.Mocked<typeof db>;
const mockExport = exportModule as jest.Mocked<typeof exportModule>;
const mockImport = importModule as jest.Mocked<typeof importModule>;
const mockStorage = storageAccess as jest.Mocked<typeof storageAccess>;

const emptyPreview: ImportPreview = {
  valid: [],
  invalid: [],
  needsFxRate: [],
  fxReview: [],
  currencyReview: [],
  duplicates: [],
  inferredDateOrder: null,
  signConventionBypassed: false,
  newCategoryNames: [],
  totalRows: 0,
};

const transaction: TransactionRecord = {
  type: 'expense',
  id: 1,
  description: 'Coffee',
  payee: 'Corner Cafe',
  amountNative: 3.5,
  currencyCode: 'USD',
  fxRateToBase: 1,
  baseAmount: 3.5,
  baseCurrencyCode: 'USD',
  date: '2025-01-10',
  categoryId: null,
  notes: null,
  createdAt: '2025-01-10T00:00:00.000Z',
  updatedAt: '2025-01-10T00:00:00.000Z',
};

const category: CategoryRecord = {
  type: 'both',
  id: 1,
  name: 'Food',
  createdAt: '2025-01-10T00:00:00.000Z',
  updatedAt: '2025-01-10T00:00:00.000Z',
};

let ctx: TransactionDataContextValue;
const Capture: React.FC = () => {
  const value = useTransactionData();
  useEffect(() => {
    ctx = value;
  });
  return null;
};

const renderProvider = async () => {
  renderWithProviders(
    <TransactionDataProvider>
      <Capture />
    </TransactionDataProvider>,
  );
  await waitFor(() => expect(ctx.state.isInitialised).toBe(true));
};

beforeEach(() => {
  jest.clearAllMocks();
  (mockDb.withDatabase as jest.Mock).mockImplementation(
    (cb: (database: unknown) => unknown) => Promise.resolve(cb({})),
  );
  mockDb.listTransactions.mockResolvedValue([]);
  mockDb.listCategories.mockResolvedValue([]);
  mockDb.getAllSettings.mockResolvedValue([]);
  mockDb.listExportQueue.mockResolvedValue([]);
  mockDb.listCurrencyFxRates.mockResolvedValue([]);
  mockDb.upsertCurrencyFxRate.mockResolvedValue(undefined as never);
  mockDb.setSetting.mockResolvedValue(undefined as never);
  mockDb.insertExportQueueItem.mockResolvedValue(undefined as never);
  mockDb.updateExportQueueStatus.mockResolvedValue(undefined as never);
  mockDb.removeExportQueueItem.mockResolvedValue(undefined as never);
  mockDb.clearCompletedExportQueueItems.mockResolvedValue(undefined as never);
  mockExport.uploadPendingExports.mockResolvedValue({
    requiresAuth: false,
    attempted: 0,
    uploaded: 0,
    failed: 0,
    skipped: 0,
    errors: [],
  });
  mockStorage.requestDirectorySelection.mockResolvedValue({
    ok: true,
    uri: 'content://dir',
  });
  mockStorage.deleteFileUri.mockResolvedValue(undefined);
  mockImport.commitImport.mockResolvedValue({
    insertedExpenses: 2,
    insertedIncome: 0,
    skippedInvalid: 0,
    skippedNeedsFxRate: 0,
    createdCategories: 1,
  });
});

describe('TransactionDataProvider effects', () => {
  it('loads data from the database on mount', async () => {
    mockDb.listTransactions.mockResolvedValue([transaction]);
    mockDb.listCategories.mockResolvedValue([category]);
    await renderProvider();
    expect(ctx.state.transactions).toHaveLength(1);
    expect(ctx.state.categories).toHaveLength(1);
  });

  it('records an error when the initial load fails', async () => {
    mockDb.listTransactions.mockRejectedValueOnce(new Error('load failed'));
    await renderProvider();
    expect(ctx.state.error).toBe('load failed');
  });

  it('creates an expense and prepends it to state', async () => {
    await renderProvider();
    mockDb.createTransaction.mockResolvedValue(transaction);
    await act(async () => {
      await ctx.actions.createTransaction({
        type: 'expense',
        description: 'Coffee',
        payee: 'Corner Cafe',
        amountNative: 3.5,
        currencyCode: 'USD',
        fxRateToBase: 1,
        baseAmount: 3.5,
        baseCurrencyCode: 'USD',
        date: '2025-01-10',
        categoryId: null,
        notes: null,
      });
    });
    expect(mockDb.createTransaction).toHaveBeenCalled();
    expect(ctx.state.transactions).toContainEqual(transaction);
  });

  it('surfaces an error when creating an expense fails', async () => {
    await renderProvider();
    mockDb.createTransaction.mockRejectedValueOnce(new Error('insert failed'));
    await act(async () => {
      await expect(
        ctx.actions.createTransaction({
          type: 'expense',
          description: 'x',
          payee: 'y',
          amountNative: 1,
          currencyCode: 'USD',
          fxRateToBase: 1,
          baseAmount: 1,
          baseCurrencyCode: 'USD',
          date: '2025-01-10',
          categoryId: null,
          notes: null,
        }),
      ).rejects.toThrow('insert failed');
    });
    expect(ctx.state.error).toBe('insert failed');
  });

  it('imports expenses and reloads state from the database', async () => {
    await renderProvider();
    mockDb.listTransactions.mockResolvedValue([transaction]);

    let summary;
    await act(async () => {
      summary = await ctx.actions.importTransactions(emptyPreview, {
        'USD|EUR': 1.2,
      });
    });

    expect(mockImport.commitImport).toHaveBeenCalledWith(emptyPreview, {
      'USD|EUR': 1.2,
    });
    expect(summary).toEqual({
      insertedExpenses: 2,
      insertedIncome: 0,
      skippedInvalid: 0,
      skippedNeedsFxRate: 0,
      createdCategories: 1,
    });
    expect(ctx.state.transactions).toHaveLength(1);
  });

  it('surfaces an error when import fails', async () => {
    await renderProvider();
    mockImport.commitImport.mockRejectedValueOnce(new Error('import boom'));

    await act(async () => {
      await expect(
        ctx.actions.importTransactions(emptyPreview),
      ).rejects.toThrow('import boom');
    });
    expect(ctx.state.error).toBe('import boom');
  });

  it('updates and deletes expenses through the database', async () => {
    mockDb.listTransactions.mockResolvedValue([transaction]);
    await renderProvider();
    mockDb.updateTransaction.mockResolvedValue({
      ...transaction,
      description: 'Tea',
    });
    mockDb.deleteTransaction.mockResolvedValue(undefined as never);
    await act(async () => {
      await ctx.actions.updateTransaction({
        ...transaction,
        description: 'Tea',
      });
    });
    expect(ctx.state.transactions[0].description).toBe('Tea');
    await act(async () => {
      await ctx.actions.deleteTransaction(1);
    });
    expect(ctx.state.transactions).toHaveLength(0);
  });

  it('creates and deletes categories', async () => {
    await renderProvider();
    mockDb.createCategory.mockResolvedValue(category);
    mockDb.listCategories.mockResolvedValue([category]);
    await act(async () => {
      await ctx.actions.createCategory({ name: 'Food', type: 'both' });
    });
    expect(ctx.state.categories).toContainEqual(category);

    mockDb.deleteCategory.mockResolvedValue(undefined as never);
    mockDb.listCategories.mockResolvedValue([]);
    await act(async () => {
      await ctx.actions.deleteCategory(1);
    });
    expect(ctx.state.categories).toHaveLength(0);
  });

  it('persists settings changes', async () => {
    await renderProvider();
    await act(async () => {
      await ctx.actions.setBaseCurrency('EUR');
    });
    expect(mockDb.setSetting).toHaveBeenCalledWith(
      expect.anything(),
      'base_currency',
      'EUR',
    );
    expect(ctx.state.settings.baseCurrency).toBe('EUR');

    await act(async () => {
      await ctx.actions.setDriveFolderId('folder-1');
    });
    expect(ctx.state.settings.driveFolderId).toBe('folder-1');

    await act(async () => {
      await ctx.actions.setExportDirectoryUri('content://dir');
    });
    expect(ctx.state.settings.exportDirectoryUri).toBe('content://dir');
  });

  it('enables and disables the biometric gate', async () => {
    await renderProvider();
    await act(async () => {
      await ctx.actions.setBiometricGateEnabled(true);
    });
    expect(Keychain.setGenericPassword).toHaveBeenCalled();
    expect(ctx.state.settings.biometricGateEnabled).toBe(true);

    await act(async () => {
      await ctx.actions.setBiometricGateEnabled(false);
    });
    expect(Keychain.resetGenericPassword).toHaveBeenCalled();
    expect(ctx.state.settings.biometricGateEnabled).toBe(false);
  });

  it('stamps the credential version when the gate is enabled', async () => {
    await renderProvider();
    await act(async () => {
      await ctx.actions.setBiometricGateEnabled(true);
    });
    expect(mockDb.setSetting).toHaveBeenCalledWith(
      expect.anything(),
      'biometric_cred_version',
      '2',
    );
    expect(ctx.state.settings.biometricCredentialVersion).toBe(2);
  });

  it('queues an export and writes a file', async () => {
    mockExport.writeExportFile.mockResolvedValue({
      filename: 'export.csv',
      filePath: 'content://export.csv',
      fileUri: 'content://export.csv',
      contentSize: 10,
    });
    await renderProvider();
    await act(async () => {
      await ctx.actions.queueExport();
    });
    expect(mockExport.writeExportFile).toHaveBeenCalled();
    expect(mockDb.insertExportQueueItem).toHaveBeenCalled();
  });

  it('updates filters and clears them', async () => {
    await renderProvider();
    act(() => ctx.actions.setFilters({ categoryId: 2 }));
    expect(ctx.selectors.hasActiveFilters).toBe(true);
    act(() => ctx.actions.clearFilters());
    expect(ctx.selectors.hasActiveFilters).toBe(false);
  });

  it('throws when useTransactionData is used outside the provider', () => {
    const Outside: React.FC = () => {
      useTransactionData();
      return null;
    };
    expect(() => renderWithProviders(<Outside />)).toThrow(
      'useTransactionData must be used within TransactionDataProvider',
    );
  });

  it('unlocks immediately when the biometric gate is disabled', async () => {
    await renderProvider();
    let result = false;
    await act(async () => {
      result = await ctx.actions.unlockWithBiometrics();
    });
    expect(result).toBe(true);
  });

  it('locks after the background timeout and shows the unlock modal', async () => {
    mockDb.getAllSettings.mockResolvedValue([
      { key: 'biometric_gate_enabled', value: 'true' },
    ]);
    const addEventListenerSpy = jest.spyOn(AppState, 'addEventListener');
    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(1_000_000);

    await renderProvider();

    const changeCalls = addEventListenerSpy.mock.calls.filter(
      call => call[0] === 'change',
    );
    const handler = changeCalls[changeCalls.length - 1][1] as (
      status: string,
    ) => void;

    act(() => handler('background'));
    nowSpy.mockReturnValue(1_000_000 + 6 * 60 * 1000);
    act(() => handler('active'));

    expect(ctx.state.biometric.isLocked).toBe(true);
    expect(screen.getByText('Unlock required')).toBeOnTheScreen();

    await waitFor(() => expect(ctx.state.biometric.lastError).toBeTruthy());

    nowSpy.mockRestore();
  });

  it('shows the unlock modal on cold start when the gate is enabled', async () => {
    mockDb.getAllSettings.mockResolvedValue([
      { key: 'biometric_gate_enabled', value: 'true' },
    ]);
    await renderProvider();
    await waitFor(() =>
      expect(screen.getByText('Unlock required')).toBeOnTheScreen(),
    );
    expect(ctx.state.biometric.isLocked).toBe(true);
  });

  it('locks fail-closed on a settings-load failure when a credential exists', async () => {
    mockDb.listTransactions.mockRejectedValueOnce(new Error('load failed'));
    (Keychain.hasGenericPassword as jest.Mock).mockResolvedValueOnce(true);
    await renderProvider();
    await waitFor(() =>
      expect(screen.getByText('Unlock required')).toBeOnTheScreen(),
    );
    expect(ctx.state.biometric.isLocked).toBe(true);
    expect(ctx.state.error).toBe('load failed');
    expect(mockDb.setSetting).not.toHaveBeenCalledWith(
      expect.anything(),
      'biometric_cred_version',
      '2',
    );
  });

  it('stays unlocked on a settings-load failure when no credential exists', async () => {
    mockDb.listTransactions.mockRejectedValueOnce(new Error('load failed'));
    (Keychain.hasGenericPassword as jest.Mock).mockResolvedValueOnce(false);
    await renderProvider();
    expect(ctx.state.biometric.isLocked).toBe(false);
    expect(screen.queryByText('Unlock required')).toBeNull();
  });

  it('locks fail-closed when the credential probe itself throws', async () => {
    mockDb.listTransactions.mockRejectedValueOnce(new Error('load failed'));
    (Keychain.hasGenericPassword as jest.Mock).mockRejectedValueOnce(
      new Error('keychain down'),
    );
    await renderProvider();
    await waitFor(() => expect(ctx.state.biometric.isLocked).toBe(true));
  });

  it('refreshes a legacy credential to the new access control on healthy load', async () => {
    mockDb.getAllSettings.mockResolvedValue([
      { key: 'biometric_gate_enabled', value: 'true' },
    ]);
    await renderProvider();
    await waitFor(() =>
      expect(mockDb.setSetting).toHaveBeenCalledWith(
        expect.anything(),
        'biometric_cred_version',
        '2',
      ),
    );
    expect(Keychain.setGenericPassword).toHaveBeenCalled();
  });

  it('does not refresh when the credential version is already current', async () => {
    mockDb.getAllSettings.mockResolvedValue([
      { key: 'biometric_gate_enabled', value: 'true' },
      { key: 'biometric_cred_version', value: '2' },
    ]);
    await renderProvider();
    await waitFor(() => expect(ctx.state.biometric.isLocked).toBe(true));
    expect(Keychain.setGenericPassword).not.toHaveBeenCalled();
  });

  it('does not bump the version when the credential refresh fails', async () => {
    mockDb.getAllSettings.mockResolvedValue([
      { key: 'biometric_gate_enabled', value: 'true' },
    ]);
    (Keychain.setGenericPassword as jest.Mock).mockRejectedValueOnce(
      new Error('keystore fail'),
    );
    await renderProvider();
    await waitFor(() => expect(ctx.state.biometric.isLocked).toBe(true));
    expect(mockDb.setSetting).not.toHaveBeenCalledWith(
      expect.anything(),
      'biometric_cred_version',
      '2',
    );
  });
});

const queueRecord = (overrides = {}) => ({
  id: 'e1',
  filename: 'export.csv',
  filePath: 'content://export.csv',
  fileUri: 'content://export.csv',
  status: 'failed' as const,
  createdAt: '2025-01-10T00:00:00.000Z',
  updatedAt: '2025-01-10T00:00:00.000Z',
  uploadedAt: null,
  driveFileId: null,
  lastError: 'previous failure',
  ...overrides,
});

describe('TransactionDataProvider queue and connectivity', () => {
  it('uploads queued exports and stores an updated drive folder id', async () => {
    mockDb.listExportQueue.mockResolvedValue([queueRecord()]);
    mockExport.uploadPendingExports.mockResolvedValue({
      requiresAuth: false,
      attempted: 1,
      uploaded: 1,
      failed: 0,
      skipped: 0,
      errors: [],
      updatedFolderId: 'folder-x',
    });
    await renderProvider();
    await act(async () => {
      await ctx.actions.uploadQueuedExports({ interactive: true });
    });
    expect(mockExport.uploadPendingExports).toHaveBeenCalled();
    expect(ctx.state.settings.driveFolderId).toBe('folder-x');
  });

  it('retries and removes a queued export', async () => {
    mockDb.listExportQueue.mockResolvedValue([queueRecord()]);
    mockExport.writeExportFile.mockResolvedValue({
      filename: 'export.csv',
      filePath: 'content://export.csv',
      fileUri: 'content://export.csv',
      contentSize: 10,
    });
    await renderProvider();
    await act(async () => {
      await ctx.actions.retryExport('e1');
    });
    expect(mockDb.updateExportQueueStatus).toHaveBeenCalled();
    await act(async () => {
      await ctx.actions.removeExport('e1');
    });
    expect(mockDb.removeExportQueueItem).toHaveBeenCalledWith(
      expect.anything(),
      'e1',
    );
  });

  it('clears completed exports', async () => {
    mockDb.listExportQueue.mockResolvedValue([
      queueRecord({ status: 'completed' }),
    ]);
    await renderProvider();
    await act(async () => {
      await ctx.actions.clearCompletedExports();
    });
    expect(mockDb.clearCompletedExportQueueItems).toHaveBeenCalled();
  });

  it('throws when the export directory selection is cancelled', async () => {
    mockStorage.requestDirectorySelection.mockResolvedValue({
      ok: false,
      cancelled: true,
      message: 'cancelled',
    });
    await renderProvider();
    await act(async () => {
      await expect(ctx.actions.queueExport()).rejects.toThrow();
    });
  });

  it('applies category and date filters to the expense selector', async () => {
    mockDb.listTransactions.mockResolvedValue([
      transaction,
      { ...transaction, id: 2, categoryId: 5, date: '2025-03-01' },
    ]);
    await renderProvider();
    act(() => ctx.actions.setFilters({ categoryId: 5 }));
    expect(ctx.selectors.filteredTransactions).toHaveLength(1);
    act(() =>
      ctx.actions.setFilters({
        categoryId: undefined,
        startDate: '2025-02-15',
      }),
    );
    expect(ctx.selectors.filteredTransactions).toHaveLength(1);
    act(() =>
      ctx.actions.setFilters({ startDate: undefined, endDate: '2025-01-31' }),
    );
    expect(ctx.selectors.filteredTransactions).toHaveLength(1);
  });

  it('records a cancelled biometric unlock', async () => {
    mockDb.getAllSettings.mockResolvedValue([
      { key: 'biometric_gate_enabled', value: 'true' },
    ]);
    (Keychain.getGenericPassword as jest.Mock).mockResolvedValue(false);
    await renderProvider();
    let result = true;
    await act(async () => {
      result = await ctx.actions.unlockWithBiometrics();
    });
    expect(result).toBe(false);
    expect(ctx.state.biometric.lastError).toBeTruthy();
  });

  it('reports a failed biometric unlock attempt', async () => {
    (Keychain.getGenericPassword as jest.Mock).mockRejectedValue(
      new Error('denied'),
    );
    mockDb.getAllSettings.mockResolvedValue([
      { key: 'biometric_gate_enabled', value: 'true' },
    ]);
    await renderProvider();
    let result = true;
    await act(async () => {
      result = await ctx.actions.unlockWithBiometrics();
    });
    expect(result).toBe(false);
    expect(ctx.state.biometric.lastError).toBeTruthy();
  });

  it('surfaces errors from settings and mutation failures', async () => {
    await renderProvider();
    mockDb.setSetting.mockRejectedValueOnce(new Error('setting failed'));
    await act(async () => {
      await expect(ctx.actions.setBaseCurrency('EUR')).rejects.toThrow(
        'setting failed',
      );
    });
    mockDb.updateTransaction.mockRejectedValueOnce(new Error('update failed'));
    await act(async () => {
      await expect(
        ctx.actions.updateTransaction({ ...transaction }),
      ).rejects.toThrow('update failed');
    });
    mockDb.deleteTransaction.mockRejectedValueOnce(new Error('delete failed'));
    await act(async () => {
      await expect(ctx.actions.deleteTransaction(1)).rejects.toThrow(
        'delete failed',
      );
    });
    mockDb.createCategory.mockRejectedValueOnce(new Error('category failed'));
    await act(async () => {
      await expect(
        ctx.actions.createCategory({ name: 'X', type: 'both' }),
      ).rejects.toThrow('category failed');
    });
    expect(ctx.state.error).toBeTruthy();
  });

  it('clears the error and biometric error state', async () => {
    mockDb.listTransactions.mockRejectedValueOnce(new Error('boom'));
    await renderProvider();
    expect(ctx.state.error).toBe('boom');
    act(() => ctx.actions.clearError());
    expect(ctx.state.error).toBeNull();
  });

  it('refreshes data on demand', async () => {
    await renderProvider();
    mockDb.listTransactions.mockResolvedValue([transaction]);
    await act(async () => {
      await ctx.actions.refresh();
    });
    expect(ctx.state.transactions).toHaveLength(1);
  });

  it('uploads immediately after queueing when already online', async () => {
    mockExport.writeExportFile.mockResolvedValue({
      filename: 'export.csv',
      filePath: 'content://export.csv',
      fileUri: 'content://export.csv',
      contentSize: 10,
    });
    await renderProvider();
    const netListener = (NetInfo.addEventListener as jest.Mock).mock
      .calls[0][0] as (info: {
      isConnected: boolean;
      isInternetReachable: boolean;
    }) => void;
    act(() => netListener({ isConnected: true, isInternetReachable: true }));
    await act(async () => {
      await ctx.actions.queueExport();
    });
    expect(mockExport.uploadPendingExports).toHaveBeenCalled();
  });
});

describe('totals', () => {
  it('reports no figures at all when nothing matches the filters', async () => {
    mockDb.listTransactions.mockResolvedValue([]);
    await renderProvider();
    expect(ctx.selectors.totals.byBaseCurrency).toEqual([]);
    expect(ctx.selectors.totals.mixedBase).toBe(false);
  });

  it('separates expense, income and net within one base currency', async () => {
    mockDb.listTransactions.mockResolvedValue([
      { ...transaction, id: 1, type: 'expense', baseAmount: 30 },
      { ...transaction, id: 2, type: 'income', baseAmount: 100 },
    ]);
    await renderProvider();

    const [entry] = ctx.selectors.totals.byBaseCurrency;
    expect(entry.expense.total).toBe(30);
    expect(entry.expense.count).toBe(1);
    expect(entry.income.total).toBe(100);
    expect(entry.income.count).toBe(1);
    expect(entry.net.total).toBe(70);
    expect(ctx.selectors.totals.mixedBase).toBe(false);
  });

  it('counts rows separately from their sum so a zero total is not mistaken for no data', async () => {
    mockDb.listTransactions.mockResolvedValue([
      { ...transaction, id: 1, type: 'expense', baseAmount: 40 },
      { ...transaction, id: 2, type: 'income', baseAmount: 40 },
    ]);
    await renderProvider();

    const [entry] = ctx.selectors.totals.byBaseCurrency;
    expect(entry.net.total).toBe(0);
    expect(entry.net.count).toBe(2);
  });

  it('keeps each base currency separate when directions and bases both vary', async () => {
    mockDb.listTransactions.mockResolvedValue([
      {
        ...transaction,
        id: 1,
        type: 'expense',
        baseCurrencyCode: 'USD',
        baseAmount: 10,
      },
      {
        ...transaction,
        id: 2,
        type: 'income',
        baseCurrencyCode: 'USD',
        baseAmount: 25,
      },
      {
        ...transaction,
        id: 3,
        type: 'expense',
        baseCurrencyCode: 'GBP',
        baseAmount: 8,
      },
    ]);
    await renderProvider();

    const totals = ctx.selectors.totals;
    expect(totals.mixedBase).toBe(true);

    const usd = totals.byBaseCurrency.find(
      row => row.baseCurrencyCode === 'USD',
    );
    const gbp = totals.byBaseCurrency.find(
      row => row.baseCurrencyCode === 'GBP',
    );
    expect(usd?.net.total).toBe(15);
    expect(gbp?.expense.total).toBe(8);
    expect(gbp?.income.count).toBe(0);
  });

  it('excludes the other direction once a type filter is set', async () => {
    mockDb.listTransactions.mockResolvedValue([
      { ...transaction, id: 1, type: 'expense', baseAmount: 30 },
      { ...transaction, id: 2, type: 'income', baseAmount: 100 },
    ]);
    await renderProvider();

    act(() => ctx.actions.setFilters({ type: 'income' }));
    expect(ctx.selectors.filteredTransactions).toHaveLength(1);
    expect(ctx.selectors.totals.byBaseCurrency[0].expense.count).toBe(0);
    expect(ctx.selectors.hasActiveFilters).toBe(true);

    act(() => ctx.actions.setFilters({ type: undefined }));
    expect(ctx.selectors.filteredTransactions).toHaveLength(2);
  });
});
