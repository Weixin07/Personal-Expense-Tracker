import React, { useEffect } from 'react';
import { AppState } from 'react-native';
import NetInfo from '@react-native-community/netinfo';
import * as Keychain from 'react-native-keychain';

const APP_PIN_SERVICE = 'expense-tracker-app-pin';
const BIOMETRIC_SERVICE = 'expense-tracker-biometric-gate';
const STORED_PIN_RECORD = JSON.stringify({
  v: 1,
  algorithm: 'PBKDF2-HMAC-SHA256',
  iterations: 150000,
  saltB64: 'c2FsdA==',
  hashB64: 'aGFzaA==',
});
import {
  renderWithProviders,
  act,
  fireEvent,
  screen,
  waitFor,
} from '../../__tests__/test-utils/renderWithProviders';
import {
  makeImportPreview,
  makeImportSummary,
} from '../../__tests__/test-utils/importFixtures';
import {
  TransactionDataProvider,
  useTransactionData,
  type TransactionDataContextValue,
} from '../AppContext';
import * as db from '../../database';
import * as exportModule from '../../export';
import * as importModule from '../../import';
import * as storageAccess from '../../security/storageAccess';
import { isAppLockError } from '../../security/appLockError';
import { computePresetRange } from '../../screens/homeUtils';
import { localIsoDate } from '../../utils/date';
import type { TransactionRecord, CategoryRecord } from '../../database';
import type { ImportPreview } from '../../import';

jest.mock('../../database', () => ({
  withDatabase: jest.fn(),
  listTransactions: jest.fn(),
  createTransaction: jest.fn(),
  updateTransaction: jest.fn(),
  deleteTransaction: jest.fn(),
  setTransactionConfirmed: jest.fn(),
  listCategories: jest.fn(),
  createCategory: jest.fn(),
  updateCategory: jest.fn(),
  deleteCategory: jest.fn(),
  listFunds: jest.fn(),
  createFund: jest.fn(),
  updateFund: jest.fn(),
  deleteFund: jest.fn(),
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

const emptyPreview: ImportPreview = makeImportPreview();

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
  time: null,
  categoryId: null,
  fundId: 1,
  counterpartFundId: null,
  counterpartAmount: null,
  counterpartCurrencyCode: null,
  notes: null,
  isConfirmed: true,
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
  // clearAllMocks leaves implementations in place, so a per-test credential
  // stub would otherwise decide the outcome of every test after it.
  (Keychain.hasGenericPassword as jest.Mock).mockResolvedValue(false);
  (Keychain.getGenericPassword as jest.Mock).mockResolvedValue(false);
  (Keychain.getSupportedBiometryType as jest.Mock).mockResolvedValue(
    'Fingerprint',
  );
  (mockDb.withDatabase as jest.Mock).mockImplementation(
    (cb: (database: unknown) => unknown) => Promise.resolve(cb({})),
  );
  mockDb.listTransactions.mockResolvedValue([]);
  mockDb.listCategories.mockResolvedValue([]);
  mockDb.listFunds.mockResolvedValue([]);
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
  mockImport.commitImport.mockResolvedValue(
    makeImportSummary({ insertedExpenses: 2, createdCategories: 1 }),
  );
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
        time: null,
        categoryId: null,
        fundId: 1,
        counterpartFundId: null,
        counterpartAmount: null,
        counterpartCurrencyCode: null,
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
          time: null,
          categoryId: null,
          fundId: 1,
          counterpartFundId: null,
          counterpartAmount: null,
          counterpartCurrencyCode: null,
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
      summary = await ctx.actions.importTransactions(
        emptyPreview,
        { 'USD|EUR': 1.2 },
        {
          skipDuplicates: true,
          categoryAliases: { transportation: 'Transport' },
        },
      );
    });

    expect(mockImport.commitImport).toHaveBeenCalledWith(
      emptyPreview,
      { 'USD|EUR': 1.2 },
      {
        skipDuplicates: true,
        categoryAliases: { transportation: 'Transport' },
      },
    );
    expect(summary).toEqual(
      makeImportSummary({ insertedExpenses: 2, createdCategories: 1 }),
    );
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
    mockDb.listFunds.mockResolvedValue([]);
    await act(async () => {
      await ctx.actions.deleteCategory(1);
    });
    expect(ctx.state.categories).toHaveLength(0);
  });

  it('updates a category and reloads the collection', async () => {
    await renderProvider();
    const renamed = { ...category, name: 'Groceries' };
    mockDb.updateCategory.mockResolvedValue(renamed);
    mockDb.listCategories.mockResolvedValue([renamed]);

    await act(async () => {
      await ctx.actions.updateCategory({
        id: 1,
        name: 'Groceries',
        type: 'both',
      });
    });

    expect(ctx.state.categories).toEqual([renamed]);
    expect(ctx.state.isLoading).toBe(false);
  });

  it('creates, updates and deletes funds', async () => {
    const pot = {
      id: 3,
      name: 'Travel',
      currencyCode: null,
      openingBalance: 0,
      notes: null,
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
    };
    await renderProvider();

    mockDb.createFund.mockResolvedValue(pot);
    mockDb.listFunds.mockResolvedValue([pot]);
    await act(async () => {
      await ctx.actions.createFund({
        name: 'Travel',
        currencyCode: null,
        openingBalance: 0,
        notes: null,
      });
    });
    expect(ctx.state.funds).toEqual([pot]);

    const renamed = { ...pot, name: 'Trips' };
    mockDb.updateFund.mockResolvedValue(renamed);
    mockDb.listFunds.mockResolvedValue([renamed]);
    await act(async () => {
      await ctx.actions.updateFund({
        id: 3,
        name: 'Trips',
        currencyCode: null,
        openingBalance: 0,
        notes: null,
      });
    });
    expect(ctx.state.funds).toEqual([renamed]);

    mockDb.deleteFund.mockResolvedValue(undefined as never);
    mockDb.listFunds.mockResolvedValue([]);
    await act(async () => {
      await ctx.actions.deleteFund(3);
    });
    expect(ctx.state.funds).toEqual([]);
    expect(ctx.state.isLoading).toBe(false);
  });

  it('surfaces a refused fund deletion and clears the in-flight state', async () => {
    await renderProvider();
    mockDb.deleteFund.mockRejectedValueOnce(new Error('fund still in use'));

    await act(async () => {
      await expect(ctx.actions.deleteFund(1)).rejects.toThrow(
        'fund still in use',
      );
    });

    expect(ctx.state.error).toBeTruthy();
    expect(ctx.state.isLoading).toBe(false);
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

  const stubPinExists = (exists: boolean): void => {
    (Keychain.hasGenericPassword as jest.Mock).mockImplementation(
      ({ service }: { service: string }) =>
        Promise.resolve(exists && service === APP_PIN_SERVICE),
    );
    (Keychain.getGenericPassword as jest.Mock).mockImplementation(
      ({ service }: { service: string }) =>
        Promise.resolve(
          exists && service === APP_PIN_SERVICE
            ? { username: 'expense-tracker', password: STORED_PIN_RECORD }
            : false,
        ),
    );
  };

  it('enables and disables the biometric gate', async () => {
    stubPinExists(true);
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

  // Under the rule on `TransactionDataActions.setBiometricGateEnabled`.
  it('refuses to enable the gate when no PIN is set', async () => {
    stubPinExists(false);
    await renderProvider();
    await act(async () => {
      const thrown = await ctx.actions
        .setBiometricGateEnabled(true)
        .then(() => null)
        .catch((error: unknown) => error);
      expect(isAppLockError(thrown, 'pin-required')).toBe(true);
    });
    expect(ctx.state.settings.biometricGateEnabled).toBe(false);
    expect(mockDb.setSetting).not.toHaveBeenCalledWith(
      expect.anything(),
      'biometric_gate_enabled',
      'true',
    );
  });

  /**
   * A device with no TEE or no screen lock cannot hold the biometric
   * credential. The PIN is a complete unlock path on its own, so the gate must
   * still go on for exactly the users the fallback exists to serve.
   */
  it('enables the gate PIN-only when the biometric credential cannot be created', async () => {
    stubPinExists(true);
    await renderProvider();
    (Keychain.setGenericPassword as jest.Mock).mockRejectedValue(
      new Error('Cannot generate keys with required security guarantees'),
    );

    await act(async () => {
      await ctx.actions.setBiometricGateEnabled(true);
    });

    expect(ctx.state.settings.biometricGateEnabled).toBe(true);
    expect(mockDb.setSetting).toHaveBeenCalledWith(
      expect.anything(),
      'biometric_gate_enabled',
      'true',
    );
    (Keychain.setGenericPassword as jest.Mock).mockResolvedValue(true);
  });

  it('still refuses to enable without a PIN, whatever the biometric hardware does', async () => {
    stubPinExists(false);
    await renderProvider();
    (Keychain.setGenericPassword as jest.Mock).mockRejectedValue(
      new Error('Cannot generate keys with required security guarantees'),
    );

    await act(async () => {
      const thrown = await ctx.actions
        .setBiometricGateEnabled(true)
        .then(() => null)
        .catch((error: unknown) => error);
      expect(isAppLockError(thrown, 'pin-required')).toBe(true);
    });
    expect(ctx.state.settings.biometricGateEnabled).toBe(false);
    (Keychain.setGenericPassword as jest.Mock).mockResolvedValue(true);
  });

  it('clears the PIN when the gate is disabled', async () => {
    stubPinExists(true);
    await renderProvider();
    await act(async () => {
      await ctx.actions.setBiometricGateEnabled(false);
    });
    expect(Keychain.resetGenericPassword).toHaveBeenCalledWith({
      service: APP_PIN_SERVICE,
    });
  });

  it('stamps the credential version when the gate is enabled', async () => {
    stubPinExists(true);
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

  describe('the PIN and auto-lock settings', () => {
    it('persists an auto-lock preset', async () => {
      await renderProvider();
      await act(async () => {
        await ctx.actions.setAutoLockMinutes(15);
      });
      expect(mockDb.setSetting).toHaveBeenCalledWith(
        expect.anything(),
        'auto_lock_minutes',
        '15',
      );
      expect(ctx.state.settings.autoLockMinutes).toBe(15);
    });

    it('persists Never as its own token, not as NULL', async () => {
      await renderProvider();
      await act(async () => {
        await ctx.actions.setAutoLockMinutes(null);
      });
      expect(mockDb.setSetting).toHaveBeenCalledWith(
        expect.anything(),
        'auto_lock_minutes',
        'never',
      );
      expect(ctx.state.settings.autoLockMinutes).toBeNull();
    });

    it('reports a failure to persist the preset', async () => {
      await renderProvider();
      mockDb.setSetting.mockRejectedValueOnce(new Error('write failed'));
      await act(async () => {
        await expect(ctx.actions.setAutoLockMinutes(30)).rejects.toThrow(
          'write failed',
        );
      });
      expect(ctx.state.error).toBe('write failed');
    });

    it('hydrates the preset from storage', async () => {
      mockDb.getAllSettings.mockResolvedValue([
        { key: 'auto_lock_minutes', value: '30' },
      ]);
      await renderProvider();
      await waitFor(() => expect(ctx.state.settings.autoLockMinutes).toBe(30));
    });

    it('hydrates Never from its own token', async () => {
      mockDb.getAllSettings.mockResolvedValue([
        { key: 'auto_lock_minutes', value: 'never' },
      ]);
      await renderProvider();
      await waitFor(() => expect(ctx.state.isInitialised).toBe(true));
      expect(ctx.state.settings.autoLockMinutes).toBeNull();
    });

    // Resolved under the rule on `autoLockMinutesFromToken`.
    it.each([
      ['an unknown token', 'sometimes'],
      ['a value outside the presets', '7'],
      ['an empty value', ''],
      ['a NULL value', null],
    ])('falls back to five minutes for %s', async (_label, value) => {
      mockDb.getAllSettings.mockResolvedValue([
        { key: 'auto_lock_minutes', value },
      ]);
      await renderProvider();
      await waitFor(() => expect(ctx.state.isInitialised).toBe(true));
      expect(ctx.state.settings.autoLockMinutes).toBe(5);
    });

    it('sets a PIN and records the upgrade', async () => {
      stubPinExists(false);
      await renderProvider();
      await act(async () => {
        await ctx.actions.completePinSetup('846207');
      });
      expect(mockDb.setSetting).toHaveBeenCalledWith(
        expect.anything(),
        'app_pin_version',
        '1',
      );
    });

    it('refuses a PIN that fails the strength rule', async () => {
      await renderProvider();
      await act(async () => {
        await expect(ctx.actions.setAppPin('111111')).rejects.toThrow(
          /same digit repeated/,
        );
      });
    });

    /**
     * Declining leaves the gate off rather than on-without-a-PIN, which the
     * gate has no unlock path for.
     */
    it('turns the gate off when the PIN upgrade is declined', async () => {
      stubPinExists(false);
      mockDb.getAllSettings.mockResolvedValue([
        { key: 'biometric_gate_enabled', value: 'true' },
      ]);
      await renderProvider();
      await waitFor(() => expect(ctx.state.pinSetupRequired).toBe(true));
      await act(async () => {
        await ctx.actions.declinePinSetup();
      });
      expect(ctx.state.settings.biometricGateEnabled).toBe(false);
      expect(ctx.state.pinSetupRequired).toBe(false);
      expect(mockDb.setSetting).toHaveBeenCalledWith(
        expect.anything(),
        'biometric_gate_enabled',
        'false',
      );
      expect(mockDb.setSetting).toHaveBeenCalledWith(
        expect.anything(),
        'app_pin_version',
        '1',
      );
    });

    /**
     * The gate modal covers every route to Settings, so an install with the
     * gate on and no PIN has to be offered enrolment at the lock screen or it
     * cannot be opened at all.
     */
    it('offers enrolment at the lock screen, not a PIN field with no PIN', async () => {
      stubPinExists(false);
      (Keychain.getSupportedBiometryType as jest.Mock).mockResolvedValue(null);
      mockDb.getAllSettings.mockResolvedValue([
        { key: 'biometric_gate_enabled', value: 'true' },
      ]);
      await renderProvider();
      await waitFor(() => expect(ctx.state.pinSetupRequired).toBe(true));
      await waitFor(() =>
        expect(screen.getByText('Set an app PIN')).toBeOnTheScreen(),
      );
      expect(screen.queryByLabelText('App PIN')).toBeNull();
      expect(screen.queryByLabelText('Try biometrics again')).toBeNull();
    });

    it('lets the enrolled user straight in, through a real verify', async () => {
      const written: string[] = [];
      (Keychain.setGenericPassword as jest.Mock).mockImplementation(
        (_username: string, password: string, options: { service: string }) => {
          if (options.service === APP_PIN_SERVICE) {
            written.push(password);
            (Keychain.getGenericPassword as jest.Mock).mockImplementation(
              ({ service }: { service: string }) =>
                Promise.resolve(
                  service === APP_PIN_SERVICE
                    ? { username: 'expense-tracker', password }
                    : false,
                ),
            );
          }
          return Promise.resolve(true);
        },
      );
      stubPinExists(false);
      (Keychain.getSupportedBiometryType as jest.Mock).mockResolvedValue(null);
      mockDb.getAllSettings.mockResolvedValue([
        { key: 'biometric_gate_enabled', value: 'true' },
      ]);
      await renderProvider();
      await waitFor(() => expect(ctx.state.pinSetupRequired).toBe(true));

      await act(async () => {
        await ctx.actions.completePinSetup('846207');
      });

      expect(written).toHaveLength(1);
      await waitFor(() => expect(ctx.state.biometric.isLocked).toBe(false));
      expect(ctx.state.pinSetupRequired).toBe(false);
    });

    it('lets that install turn the lock off from the same prompt', async () => {
      stubPinExists(false);
      (Keychain.getSupportedBiometryType as jest.Mock).mockResolvedValue(null);
      mockDb.getAllSettings.mockResolvedValue([
        { key: 'biometric_gate_enabled', value: 'true' },
      ]);
      await renderProvider();
      await waitFor(() =>
        expect(screen.getByText('Turn the lock off')).toBeOnTheScreen(),
      );
      await act(async () => {
        fireEvent.press(screen.getByText('Turn the lock off'));
      });
      await waitFor(() =>
        expect(ctx.state.settings.biometricGateEnabled).toBe(false),
      );
      expect(screen.queryByText('Set an app PIN')).toBeNull();
    });

    const stubKeychain = ({
      biometricRead,
      pinPassword,
    }: {
      biometricRead: boolean;
      pinPassword: string | null;
    }): void => {
      (Keychain.hasGenericPassword as jest.Mock).mockImplementation(
        ({ service }: { service: string }) =>
          Promise.resolve(
            service === BIOMETRIC_SERVICE ||
              (service === APP_PIN_SERVICE && pinPassword !== null),
          ),
      );
      (Keychain.getGenericPassword as jest.Mock).mockImplementation(
        ({ service }: { service: string }) => {
          if (service === BIOMETRIC_SERVICE) {
            return Promise.resolve(
              biometricRead
                ? { username: 'expense-tracker', password: 'biometric-lock' }
                : false,
            );
          }
          if (service === APP_PIN_SERVICE && pinPassword !== null) {
            return Promise.resolve({
              username: 'expense-tracker',
              password: pinPassword,
            });
          }
          return Promise.resolve(false);
        },
      );
    };

    const gateOnSettings = [
      { key: 'biometric_gate_enabled', value: 'true' },
      { key: 'biometric_cred_version', value: '2' },
    ];

    it('asks for biometrics before offering enrolment or its decline', async () => {
      stubKeychain({ biometricRead: false, pinPassword: null });
      mockDb.getAllSettings.mockResolvedValue(gateOnSettings);
      await renderProvider();
      await waitFor(() =>
        expect(ctx.state.biometric.biometricsAvailable).toBe(true),
      );
      await waitFor(() => expect(ctx.state.biometric.lastError).not.toBeNull());
      expect(ctx.state.biometric.isLocked).toBe(true);
      expect(ctx.state.pinSetupRequired).toBe(false);
      expect(screen.queryByText('Turn the lock off')).toBeNull();
      expect(screen.queryByText('Set an app PIN')).toBeNull();
      expect(mockDb.setSetting).not.toHaveBeenCalledWith(
        expect.anything(),
        'biometric_gate_enabled',
        'false',
      );
    });

    it('offers enrolment once biometrics have unlocked', async () => {
      stubKeychain({ biometricRead: true, pinPassword: null });
      mockDb.getAllSettings.mockResolvedValue(gateOnSettings);
      await renderProvider();
      await waitFor(() => expect(ctx.state.biometric.isLocked).toBe(false));
      await waitFor(() => expect(ctx.state.pinSetupRequired).toBe(true));
      expect(screen.getByText('Set an app PIN')).toBeOnTheScreen();
    });

    it('keeps a corrupt PIN record closed when no biometric can stand in', async () => {
      stubKeychain({ biometricRead: false, pinPassword: 'not a record' });
      (Keychain.getSupportedBiometryType as jest.Mock).mockResolvedValue(null);
      mockDb.getAllSettings.mockResolvedValue(gateOnSettings);
      await renderProvider();
      await waitFor(() => expect(ctx.state.biometric.pinUsable).toBe(false));
      await waitFor(() =>
        expect(ctx.state.biometric.biometricsAvailable).toBe(false),
      );
      expect(ctx.state.biometric.isLocked).toBe(true);
      expect(ctx.state.pinSetupRequired).toBe(false);
      expect(screen.getByText('Unlock required')).toBeOnTheScreen();
      expect(screen.queryByText('Turn the lock off')).toBeNull();
    });

    it('does not prompt a gate-on install that already has a PIN', async () => {
      stubPinExists(true);
      mockDb.getAllSettings.mockResolvedValue([
        { key: 'biometric_gate_enabled', value: 'true' },
      ]);
      await renderProvider();
      await waitFor(() => expect(ctx.state.isInitialised).toBe(true));
      expect(ctx.state.pinSetupRequired).toBe(false);
    });

    it('does not prompt when the gate is off', async () => {
      stubPinExists(false);
      await renderProvider();
      await waitFor(() => expect(ctx.state.isInitialised).toBe(true));
      expect(ctx.state.pinSetupRequired).toBe(false);
    });

    it('exposes the PIN unlock path', async () => {
      await renderProvider();
      let unlocked = true;
      await act(async () => {
        unlocked = await ctx.actions.unlockWithPin('846207');
      });
      expect(unlocked).toBe(false);
    });

    it('reports whether a PIN exists', async () => {
      stubPinExists(true);
      await renderProvider();
      await expect(ctx.actions.appPinUsable()).resolves.toBe(true);
    });

    it('changes a PIN only under the current one', async () => {
      await renderProvider();
      let changed = true;
      await act(async () => {
        changed = await ctx.actions.changeAppPin('111213', '846207');
      });
      expect(changed).toBe(false);
    });
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
    // A normally configured gate-on install holds both credentials; the
    // biometric auto-prompt only fires once a PIN exists.
    (Keychain.hasGenericPassword as jest.Mock).mockResolvedValue(true);
    (Keychain.getGenericPassword as jest.Mock).mockImplementation(
      ({ service }: { service: string }) =>
        Promise.resolve(
          service === APP_PIN_SERVICE
            ? { username: 'expense-tracker', password: STORED_PIN_RECORD }
            : false,
        ),
    );
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
    (Keychain.hasGenericPassword as jest.Mock).mockResolvedValue(true);
    (Keychain.getGenericPassword as jest.Mock).mockImplementation(
      ({ service }: { service: string }) =>
        Promise.resolve(
          service === APP_PIN_SERVICE
            ? { username: 'expense-tracker', password: STORED_PIN_RECORD }
            : false,
        ),
    );
    await renderProvider();
    await waitFor(() =>
      expect(screen.getByText('Unlock required')).toBeOnTheScreen(),
    );
    expect(ctx.state.biometric.isLocked).toBe(true);
  });

  it('locks fail-closed on a settings-load failure when a credential exists', async () => {
    mockDb.listTransactions.mockRejectedValueOnce(new Error('load failed'));
    (Keychain.hasGenericPassword as jest.Mock).mockImplementation(
      ({ service }: { service: string }) =>
        Promise.resolve(service === BIOMETRIC_SERVICE),
    );
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

  it('locks fail-closed for a PIN-only install with no biometric credential', async () => {
    mockDb.listTransactions.mockRejectedValueOnce(new Error('load failed'));
    (Keychain.hasGenericPassword as jest.Mock).mockImplementation(
      ({ service }: { service: string }) =>
        Promise.resolve(service === APP_PIN_SERVICE),
    );
    await renderProvider();
    await waitFor(() =>
      expect(screen.getByText('Unlock required')).toBeOnTheScreen(),
    );
    expect(ctx.state.biometric.isLocked).toBe(true);
  });

  it('keeps the five-minute auto-lock default when settings cannot be read', async () => {
    mockDb.listTransactions.mockRejectedValueOnce(new Error('load failed'));
    (Keychain.hasGenericPassword as jest.Mock).mockResolvedValue(false);
    await renderProvider();
    expect(ctx.state.error).toBe('load failed');
    expect(ctx.state.settings.autoLockMinutes).toBe(5);
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
    (Keychain.hasGenericPassword as jest.Mock).mockRejectedValue(
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

  // The window and the transaction's own date are read from two separate
  // clocks, so nothing but a shared calendar keeps them agreeing. The instant
  // below is local early morning, where a UTC reading still names yesterday
  // and would put today's entry past the end of the range.
  it('keeps a transaction dated today inside the default last-30-days window', async () => {
    const realNow = Date.now();
    jest.setSystemTime(new Date(2026, 7, 14, 6, 27));
    try {
      mockDb.listTransactions.mockResolvedValue([
        { ...transaction, id: 3, date: localIsoDate() },
      ]);
      await renderProvider();

      const range = computePresetRange('last30Days');
      act(() =>
        ctx.actions.setFilters({
          startDate: range.startDate ?? undefined,
          endDate: range.endDate ?? undefined,
        }),
      );

      expect(ctx.selectors.filteredTransactions).toHaveLength(1);
    } finally {
      jest.setSystemTime(realNow);
    }
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
    expect(ctx.selectors.totals).toEqual([]);
  });

  it('separates expense, income and net within one base currency', async () => {
    mockDb.listTransactions.mockResolvedValue([
      { ...transaction, id: 1, type: 'expense', baseAmount: 30 },
      { ...transaction, id: 2, type: 'income', baseAmount: 100 },
    ]);
    await renderProvider();

    const [entry] = ctx.selectors.totals;
    expect(entry.expense.total).toBe(30);
    expect(entry.expense.count).toBe(1);
    expect(entry.income.total).toBe(100);
    expect(entry.income.count).toBe(1);
    expect(entry.net.total).toBe(70);
  });

  it('counts rows separately from their sum so a zero total is not mistaken for no data', async () => {
    mockDb.listTransactions.mockResolvedValue([
      { ...transaction, id: 1, type: 'expense', baseAmount: 40 },
      { ...transaction, id: 2, type: 'income', baseAmount: 40 },
    ]);
    await renderProvider();

    const [entry] = ctx.selectors.totals;
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

    const usd = totals.find(row => row.baseCurrencyCode === 'USD');
    const gbp = totals.find(row => row.baseCurrencyCode === 'GBP');
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
    expect(ctx.selectors.totals[0].expense.count).toBe(0);
    expect(ctx.selectors.hasActiveFilters).toBe(true);

    act(() => ctx.actions.setFilters({ type: undefined }));
    expect(ctx.selectors.filteredTransactions).toHaveLength(2);
  });
});

describe('transfers and fund balances', () => {
  const fund = (id: number, overrides = {}) => ({
    id,
    name: `Fund ${id}`,
    currencyCode: null,
    openingBalance: 0,
    notes: null,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
    ...overrides,
  });

  const transfer = {
    ...transaction,
    id: 50,
    type: 'transfer' as const,
    amountNative: 100,
    baseAmount: 100,
    fundId: 1,
    counterpartFundId: 2,
    counterpartAmount: 117,
    counterpartCurrencyCode: 'EUR',
  };

  it('leaves transfers out of spent, received and net', async () => {
    mockDb.listFunds.mockResolvedValue([fund(1), fund(2)]);
    mockDb.listTransactions.mockResolvedValue([
      { ...transaction, id: 1, type: 'expense', baseAmount: 10 },
      transfer,
    ]);

    await renderProvider();

    const group = ctx.selectors.totals[0];
    expect(group.expense.total).toBe(10);
    expect(group.expense.count).toBe(1);
    expect(group.income.total).toBe(0);
    expect(group.net.total).toBe(-10);
  });

  it('moves the same base amount out of the source fund and into the destination', async () => {
    mockDb.getAllSettings.mockResolvedValue([
      { key: 'base_currency', value: 'USD' },
    ]);
    mockDb.listFunds.mockResolvedValue([fund(1), fund(2)]);
    mockDb.listTransactions.mockResolvedValue([transfer]);

    await renderProvider();

    const source = ctx.selectors.fundBalances.find(item => item.fundId === 1);
    const destination = ctx.selectors.fundBalances.find(
      item => item.fundId === 2,
    );
    expect(source?.byCurrency).toEqual([
      { currencyCode: 'USD', balance: -100 },
    ]);
    // The destination is credited what the source gave up, so the 117 recorded
    // as having arrived in EUR never reaches a balance.
    expect(destination?.byCurrency).toEqual([
      { currencyCode: 'USD', balance: 100 },
    ]);
  });

  it('recomputes fund balances when a transaction is added', async () => {
    mockDb.getAllSettings.mockResolvedValue([
      { key: 'base_currency', value: 'USD' },
    ]);
    mockDb.listFunds.mockResolvedValue([fund(1)]);
    mockDb.listTransactions.mockResolvedValue([]);
    mockDb.createTransaction.mockResolvedValue({
      ...transaction,
      id: 99,
      amountNative: 12,
      currencyCode: 'USD',
      baseAmount: 12,
      fundId: 1,
    });

    await renderProvider();

    expect(
      ctx.selectors.fundBalances.find(item => item.fundId === 1)?.byCurrency,
    ).toEqual([{ currencyCode: 'USD', balance: 0 }]);

    await act(async () => {
      await ctx.actions.createTransaction({
        ...transaction,
        amountNative: 12,
        currencyCode: 'USD',
        baseAmount: 12,
        fundId: 1,
      });
    });

    expect(
      ctx.selectors.fundBalances.find(item => item.fundId === 1)?.byCurrency,
    ).toEqual([{ currencyCode: 'USD', balance: -12 }]);
  });

  it('files an opening balance under the fund currency, falling back to base', async () => {
    mockDb.getAllSettings.mockResolvedValue([
      { key: 'base_currency', value: 'USD' },
    ]);
    mockDb.listFunds.mockResolvedValue([
      fund(1, { currencyCode: 'EUR', openingBalance: 500 }),
      fund(2, { currencyCode: null, openingBalance: 20 }),
    ]);
    mockDb.listTransactions.mockResolvedValue([]);

    await renderProvider();

    expect(
      ctx.selectors.fundBalances.find(item => item.fundId === 1)?.byCurrency,
    ).toEqual([{ currencyCode: 'EUR', balance: 500 }]);
    expect(
      ctx.selectors.fundBalances.find(item => item.fundId === 2)?.byCurrency,
    ).toEqual([{ currencyCode: 'USD', balance: 20 }]);
  });

  it('restates a fund in its own currency when a newer rate is saved', async () => {
    mockDb.getAllSettings.mockResolvedValue([
      { key: 'base_currency', value: 'USD' },
    ]);
    mockDb.listFunds.mockResolvedValue([fund(1, { currencyCode: 'EUR' })]);
    mockDb.listTransactions.mockResolvedValue([
      { ...transaction, id: 1, type: 'income', baseAmount: 108 },
    ]);
    mockDb.listCurrencyFxRates.mockResolvedValue([
      {
        baseCurrencyCode: 'USD',
        currencyCode: 'EUR',
        fxRateToBase: 1.08,
        updatedAt: '2026-01-01T00:00:00.000Z',
      },
    ]);

    await renderProvider();

    expect(
      ctx.selectors.fundBalances.find(item => item.fundId === 1)?.byCurrency,
    ).toEqual([{ currencyCode: 'EUR', balance: 100 }]);

    // Saving a transaction in EUR re-caches the pair. Its own base amount is
    // zero, so the only thing that can move the fund's figure is the new rate.
    const reRated = {
      ...transaction,
      id: 99,
      amountNative: 0,
      currencyCode: 'EUR',
      fxRateToBase: 1.2,
      baseAmount: 0,
      fundId: 1,
    };
    mockDb.createTransaction.mockResolvedValue(reRated);

    await act(async () => {
      await ctx.actions.createTransaction(reRated);
    });

    expect(
      ctx.selectors.fundBalances.find(item => item.fundId === 1)?.byCurrency,
    ).toEqual([{ currencyCode: 'EUR', balance: 90 }]);
  });

  it('counts a fund filter against both sides of a transfer', async () => {
    mockDb.listFunds.mockResolvedValue([fund(1), fund(2)]);
    mockDb.listTransactions.mockResolvedValue([transfer]);

    await renderProvider();

    await act(async () => {
      ctx.actions.setFilters({ fundId: 2 });
    });

    expect(ctx.selectors.filteredTransactions).toHaveLength(1);
  });

  const unconverted = {
    ...transfer,
    id: 51,
    currencyCode: 'MYR',
    counterpartAmount: 100,
    counterpartCurrencyCode: 'EUR',
  };

  it('identifies a transfer whose amounts imply a rate of one', async () => {
    mockDb.listFunds.mockResolvedValue([fund(1), fund(2)]);
    mockDb.listTransactions.mockResolvedValue([unconverted]);

    await renderProvider();

    expect([...ctx.selectors.suspectTransferIds]).toEqual([51]);
  });

  it('leaves a converted transfer alone', async () => {
    mockDb.listFunds.mockResolvedValue([fund(1), fund(2)]);
    mockDb.listTransactions.mockResolvedValue([transfer]);

    await renderProvider();

    expect(ctx.selectors.suspectTransferIds.size).toBe(0);
  });

  it('leaves a same-currency transfer of equal magnitude alone', async () => {
    mockDb.listFunds.mockResolvedValue([fund(1), fund(2)]);
    mockDb.listTransactions.mockResolvedValue([
      { ...unconverted, counterpartCurrencyCode: 'MYR' },
    ]);

    await renderProvider();

    expect(ctx.selectors.suspectTransferIds.size).toBe(0);
  });

  it('reads an unlabelled transfer against the destination fund currency', async () => {
    mockDb.listFunds.mockResolvedValue([
      fund(1),
      fund(2, { currencyCode: 'EUR' }),
    ]);
    mockDb.listTransactions.mockResolvedValue([
      { ...unconverted, counterpartCurrencyCode: null },
    ]);

    await renderProvider();

    expect([...ctx.selectors.suspectTransferIds]).toEqual([51]);
  });

  it('collects the rows the user has not confirmed', async () => {
    mockDb.listFunds.mockResolvedValue([fund(1), fund(2)]);
    mockDb.listTransactions.mockResolvedValue([
      { ...transaction, id: 1, isConfirmed: false },
      { ...transaction, id: 2, isConfirmed: true },
      { ...transaction, id: 3, isConfirmed: false },
    ]);

    await renderProvider();

    expect([...ctx.selectors.unconfirmedIds]).toEqual([1, 3]);
  });

  it('counts unconfirmed rows over the whole history, not the filtered view', async () => {
    mockDb.listFunds.mockResolvedValue([fund(1), fund(2)]);
    mockDb.listTransactions.mockResolvedValue([
      { ...transaction, id: 1, isConfirmed: false, date: '2025-01-10' },
      { ...transaction, id: 2, isConfirmed: false, date: '2030-01-10' },
    ]);

    await renderProvider();
    act(() => {
      ctx.actions.setFilters({ startDate: '2029-01-01' });
    });

    expect(ctx.selectors.filteredTransactions).toHaveLength(1);
    expect(ctx.selectors.unconfirmedIds.size).toBe(2);
  });

  it('stores the confirmed flag without touching the rate cache', async () => {
    mockDb.listFunds.mockResolvedValue([fund(1), fund(2)]);
    mockDb.listTransactions.mockResolvedValue([
      { ...transaction, id: 1, isConfirmed: false },
    ]);
    await renderProvider();
    mockDb.upsertCurrencyFxRate.mockClear();
    mockDb.setTransactionConfirmed.mockResolvedValue({
      ...transaction,
      id: 1,
      isConfirmed: true,
    });

    await act(async () => {
      await ctx.actions.setTransactionConfirmed(1, true);
    });

    expect(mockDb.setTransactionConfirmed).toHaveBeenCalledWith(
      expect.anything(),
      1,
      true,
    );
    expect(ctx.selectors.unconfirmedIds.size).toBe(0);
    expect(mockDb.upsertCurrencyFxRate).not.toHaveBeenCalled();
  });

  it('surfaces an error when the confirmed flag cannot be stored', async () => {
    mockDb.listFunds.mockResolvedValue([fund(1), fund(2)]);
    mockDb.listTransactions.mockResolvedValue([
      { ...transaction, id: 1, isConfirmed: false },
    ]);
    await renderProvider();
    mockDb.setTransactionConfirmed.mockRejectedValueOnce(
      new Error('confirm failed'),
    );

    await act(async () => {
      await expect(
        ctx.actions.setTransactionConfirmed(1, true),
      ).rejects.toThrow('confirm failed');
    });

    expect(ctx.state.error).toBe('confirm failed');
  });

  it('narrows to suspect transfers and reports the filter as active', async () => {
    mockDb.listFunds.mockResolvedValue([fund(1), fund(2)]);
    mockDb.listTransactions.mockResolvedValue([
      { ...transaction, id: 1 },
      unconverted,
    ]);

    await renderProvider();

    await act(async () => {
      ctx.actions.setFilters({ needsAttention: true });
    });

    expect(ctx.selectors.filteredTransactions).toHaveLength(1);
    expect(ctx.selectors.filteredTransactions[0].id).toBe(51);
    expect(ctx.selectors.hasActiveFilters).toBe(true);

    await act(async () => {
      ctx.actions.setFilters({ needsAttention: undefined });
    });

    expect(ctx.selectors.filteredTransactions).toHaveLength(2);
    expect(ctx.selectors.hasActiveFilters).toBe(false);
  });
});

describe('fx rate cache', () => {
  const crossCurrencyTransfer: TransactionRecord = {
    ...transaction,
    id: 7,
    type: 'transfer',
    amountNative: 100,
    currencyCode: 'EUR',
    fxRateToBase: 5,
    baseAmount: 500,
    baseCurrencyCode: 'MYR',
    counterpartFundId: 2,
    counterpartAmount: 17000,
    counterpartCurrencyCode: 'JPY',
  };

  const cachedRates = () =>
    ctx.state.fxRateCache.map(item => [item.currencyCode, item.fxRateToBase]);

  beforeEach(() => {
    mockDb.getAllSettings.mockResolvedValue([
      { key: 'base_currency', value: 'MYR' },
    ]);
  });

  it('saves what a cross-currency transfer says about both currencies', async () => {
    await renderProvider();
    mockDb.createTransaction.mockResolvedValue(crossCurrencyTransfer);

    await act(async () => {
      await ctx.actions.createTransaction({ ...crossCurrencyTransfer });
    });

    expect(mockDb.upsertCurrencyFxRate).toHaveBeenCalledTimes(2);
    expect(mockDb.upsertCurrencyFxRate).toHaveBeenNthCalledWith(
      1,
      {},
      'MYR',
      'EUR',
      5,
    );
    expect(mockDb.upsertCurrencyFxRate).toHaveBeenNthCalledWith(
      2,
      {},
      'MYR',
      'JPY',
      500 / 17000,
    );
  });

  it('offers the destination rate without waiting for a reload', async () => {
    await renderProvider();
    mockDb.createTransaction.mockResolvedValue(crossCurrencyTransfer);

    await act(async () => {
      await ctx.actions.createTransaction({ ...crossCurrencyTransfer });
    });

    expect(cachedRates()).toEqual([
      ['EUR', 5],
      ['JPY', 500 / 17000],
    ]);
  });

  it('saves both currencies again when a stored transfer is corrected', async () => {
    await renderProvider();
    mockDb.updateTransaction.mockResolvedValue({
      ...crossCurrencyTransfer,
      counterpartAmount: 16000,
    });

    await act(async () => {
      await ctx.actions.updateTransaction({ ...crossCurrencyTransfer });
    });

    expect(mockDb.upsertCurrencyFxRate).toHaveBeenCalledTimes(2);
    expect(cachedRates()).toEqual([
      ['EUR', 5],
      ['JPY', 500 / 16000],
    ]);
  });

  it('keeps the source leg of a transfer whose amounts imply parity', async () => {
    await renderProvider();
    mockDb.createTransaction.mockResolvedValue({
      ...crossCurrencyTransfer,
      counterpartAmount: 100,
    });

    await act(async () => {
      await ctx.actions.createTransaction({ ...crossCurrencyTransfer });
    });

    expect(mockDb.upsertCurrencyFxRate).toHaveBeenCalledTimes(1);
    expect(mockDb.upsertCurrencyFxRate).toHaveBeenCalledWith(
      {},
      'MYR',
      'EUR',
      5,
    );
    expect(cachedRates()).toEqual([['EUR', 5]]);
  });

  it('keeps the source leg of a same-currency transfer that lost a fee', async () => {
    await renderProvider();
    mockDb.createTransaction.mockResolvedValue({
      ...crossCurrencyTransfer,
      counterpartCurrencyCode: 'EUR',
      counterpartAmount: 98,
    });

    await act(async () => {
      await ctx.actions.createTransaction({ ...crossCurrencyTransfer });
    });

    expect(mockDb.upsertCurrencyFxRate).toHaveBeenCalledTimes(1);
    expect(cachedRates()).toEqual([['EUR', 5]]);
  });

  it('saves nothing for a transaction already in the base currency', async () => {
    await renderProvider();
    mockDb.createTransaction.mockResolvedValue({
      ...transaction,
      currencyCode: 'MYR',
      baseCurrencyCode: 'MYR',
      fxRateToBase: 1,
    });

    await act(async () => {
      await ctx.actions.createTransaction({ ...transaction });
    });

    expect(mockDb.upsertCurrencyFxRate).not.toHaveBeenCalled();
    expect(ctx.state.fxRateCache).toEqual([]);
  });
});

describe('free-text search', () => {
  const coffee: TransactionRecord = {
    ...transaction,
    id: 1,
    description: 'Morning coffee',
    payee: 'Costa',
    fundId: 1,
  };
  const fuel: TransactionRecord = {
    ...transaction,
    id: 2,
    type: 'income',
    description: 'Fuel refund',
    payee: 'Shell',
    notes: 'Coffee on the way',
    categoryId: 5,
    fundId: 2,
    date: '2025-03-10',
  };
  const rent: TransactionRecord = {
    ...transaction,
    id: 3,
    description: 'Rent',
    payee: 'Landlord',
    categoryId: null,
    fundId: 1,
  };

  const matchedIds = () =>
    ctx.selectors.filteredTransactions.map(record => record.id);

  beforeEach(() => {
    mockDb.listTransactions.mockResolvedValue([coffee, fuel, rent]);
  });

  it('matches description, payee and notes', async () => {
    await renderProvider();

    await act(async () => {
      ctx.actions.setFilters({ query: 'coffee' });
    });

    expect(matchedIds()).toEqual([1, 2]);
  });

  it('counts as an active filter on its own', async () => {
    await renderProvider();

    expect(ctx.selectors.hasActiveFilters).toBe(false);

    await act(async () => {
      ctx.actions.setFilters({ query: 'coffee' });
    });

    expect(ctx.selectors.hasActiveFilters).toBe(true);
  });

  it('stores the query trimmed', async () => {
    await renderProvider();

    await act(async () => {
      ctx.actions.setFilters({ query: '  coffee  ' });
    });

    expect(ctx.state.filters.query).toBe('coffee');
    expect(matchedIds()).toEqual([1, 2]);
  });

  it('drops a blank query rather than counting it as a filter', async () => {
    await renderProvider();

    await act(async () => {
      ctx.actions.setFilters({ query: '   ' });
    });

    expect(ctx.state.filters.query).toBeUndefined();
    expect(ctx.selectors.hasActiveFilters).toBe(false);
    expect(matchedIds()).toEqual([1, 2, 3]);
  });

  it('drops the query when it is cleared', async () => {
    await renderProvider();

    await act(async () => {
      ctx.actions.setFilters({ query: 'coffee' });
    });
    await act(async () => {
      ctx.actions.setFilters({ query: undefined });
    });

    expect(ctx.state.filters.query).toBeUndefined();
    expect(ctx.selectors.hasActiveFilters).toBe(false);
    expect(matchedIds()).toEqual([1, 2, 3]);
  });

  it('composes with a type filter', async () => {
    await renderProvider();

    await act(async () => {
      ctx.actions.setFilters({ query: 'coffee', type: 'income' });
    });

    expect(matchedIds()).toEqual([2]);
  });

  it('composes with a category filter, including the no-category case', async () => {
    await renderProvider();

    await act(async () => {
      ctx.actions.setFilters({ query: 'coffee', categoryId: 5 });
    });
    expect(matchedIds()).toEqual([2]);

    await act(async () => {
      ctx.actions.setFilters({ query: 'rent', categoryId: null });
    });
    expect(matchedIds()).toEqual([3]);
  });

  it('composes with a fund filter', async () => {
    await renderProvider();

    await act(async () => {
      ctx.actions.setFilters({ query: 'coffee', fundId: 1 });
    });

    expect(matchedIds()).toEqual([1]);
  });

  it('composes with a fund filter met only by the receiving side', async () => {
    const arriving: TransactionRecord = {
      ...transaction,
      id: 4,
      type: 'transfer',
      description: 'Coffee pot top-up',
      payee: '',
      fundId: 1,
      counterpartFundId: 2,
      counterpartAmount: 3.5,
      counterpartCurrencyCode: 'USD',
    };
    mockDb.listTransactions.mockResolvedValue([coffee, fuel, rent, arriving]);

    await renderProvider();

    await act(async () => {
      ctx.actions.setFilters({ query: 'top-up', fundId: 2 });
    });
    expect(matchedIds()).toEqual([4]);

    await act(async () => {
      ctx.actions.setFilters({ query: 'top-up', fundId: 3 });
    });
    expect(matchedIds()).toEqual([]);
  });

  it('composes with a date range', async () => {
    await renderProvider();

    await act(async () => {
      ctx.actions.setFilters({
        query: 'coffee',
        startDate: '2025-01-01',
        endDate: '2025-01-31',
      });
    });

    expect(matchedIds()).toEqual([1]);
  });

  it('composes with the needs-review filter', async () => {
    mockDb.listFunds.mockResolvedValue([
      {
        id: 1,
        name: 'Fund 1',
        currencyCode: null,
        openingBalance: 0,
        notes: null,
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T00:00:00.000Z',
      },
    ]);
    mockDb.listTransactions.mockResolvedValue([coffee, rent]);

    await renderProvider();

    await act(async () => {
      ctx.actions.setFilters({ query: 'coffee', needsAttention: true });
    });

    expect(matchedIds()).toEqual([]);
  });

  it('narrows the period totals but leaves fund balances alone', async () => {
    await renderProvider();

    const balancesBefore = ctx.selectors.fundBalances;
    const countedBefore = ctx.selectors.totals.reduce(
      (total, entry) => total + entry.expense.count + entry.income.count,
      0,
    );

    await act(async () => {
      ctx.actions.setFilters({ query: 'rent' });
    });

    const countedAfter = ctx.selectors.totals.reduce(
      (total, entry) => total + entry.expense.count + entry.income.count,
      0,
    );

    expect(countedBefore).toBe(3);
    expect(countedAfter).toBe(1);
    expect(ctx.selectors.fundBalances).toEqual(balancesBefore);
  });
});
