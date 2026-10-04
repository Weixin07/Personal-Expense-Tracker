import React, { useEffect } from 'react';
import { AppState, Text } from 'react-native';
import { Portal } from 'react-native-paper';
import NetInfo from '@react-native-community/netinfo';
import * as Keychain from 'react-native-keychain';

const APP_PIN_SERVICE = 'expense-tracker-app-pin';
const BIOMETRIC_SERVICE = 'expense-tracker-biometric-gate';
const MARKER_SERVICE = 'expense-tracker-app-lock-on';
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
import { TRANSACTION_ACTION_LOCK_POLICY } from '../../security/actionLockPolicy';
import NativeAppPinCrypto from '../../security/NativeAppPinCrypto';
import { computePresetRange } from '../../screens/homeUtils';
import { localIsoDate } from '../../utils/date';
import type { TransactionRecord, CategoryRecord } from '../../database';
import type { ImportPreview } from '../../import';

const mockPinDialogModes: string[] = [];
jest.mock('../../components/PinEntryDialog', () => {
  const ReactActual = jest.requireActual('react');
  const actual = jest.requireActual('../../components/PinEntryDialog');
  const Recording = (props: { mode: string }) => {
    mockPinDialogModes.push(props.mode);
    return ReactActual.createElement(actual.default, props);
  };
  return { __esModule: true, ...actual, default: Recording };
});

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

const isDeviceSecure = NativeAppPinCrypto.isDeviceSecure as jest.Mock;
const confirmCredential =
  NativeAppPinCrypto.confirmDeviceCredential as jest.Mock;

const biometricWrites = () =>
  (Keychain.setGenericPassword as jest.Mock).mock.calls.filter(
    ([, , options]) => options?.service === BIOMETRIC_SERVICE,
  );

const markerWrites = () =>
  (Keychain.setGenericPassword as jest.Mock).mock.calls.filter(
    ([, , options]) => options?.service === MARKER_SERVICE,
  );

const markerWriteCallOrders = (): number[] => {
  const mock = Keychain.setGenericPassword as jest.Mock;
  return mock.mock.calls.flatMap(([, , options], index) =>
    options?.service === MARKER_SERVICE
      ? [mock.mock.invocationCallOrder[index]]
      : [],
  );
};

const markerClearCallOrders = (): number[] => {
  const mock = Keychain.resetGenericPassword as jest.Mock;
  return mock.mock.calls.flatMap(([options], index) =>
    options?.service === MARKER_SERVICE
      ? [mock.mock.invocationCallOrder[index]]
      : [],
  );
};

const gateSettingWriteOrder = (value: 'true' | 'false'): number => {
  const index = mockDb.setSetting.mock.calls.findIndex(
    ([, key, written]) => key === 'biometric_gate_enabled' && written === value,
  );
  return index === -1
    ? Number.NaN
    : mockDb.setSetting.mock.invocationCallOrder[index];
};

const stubMarkerOnly = (): void => {
  (Keychain.hasGenericPassword as jest.Mock).mockImplementation(
    ({ service }: { service: string }) =>
      Promise.resolve(service === MARKER_SERVICE),
  );
};

const renderProvider = async () => {
  renderWithProviders(
    <TransactionDataProvider>
      <Capture />
    </TransactionDataProvider>,
  );
  await waitFor(() => expect(ctx?.state.isInitialised).toBe(true));
};

beforeEach(() => {
  ctx = undefined as unknown as TransactionDataContextValue;
  jest.clearAllMocks();
  // clearAllMocks leaves implementations in place, so a per-test credential
  // stub would otherwise decide the outcome of every test after it.
  (Keychain.hasGenericPassword as jest.Mock).mockResolvedValue(false);
  (Keychain.getGenericPassword as jest.Mock).mockResolvedValue(false);
  (Keychain.getSupportedBiometryType as jest.Mock).mockResolvedValue(
    'Fingerprint',
  );
  isDeviceSecure.mockResolvedValue(true);
  confirmCredential.mockResolvedValue(false);
  mockPinDialogModes.length = 0;
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

  const gateOnNoVersion = [{ key: 'biometric_gate_enabled', value: 'true' }];

  const confirmScreenLock = async (): Promise<void> => {
    confirmCredential.mockResolvedValueOnce(true);
    await act(async () => {
      await ctx.actions.unlockWithDeviceCredential();
    });
    await waitFor(() => expect(ctx.state.pinSetupRequired).toBe(true));
  };

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
    expect(biometricWrites()).not.toHaveLength(0);
    expect(ctx.state.settings.biometricGateEnabled).toBe(true);

    await act(async () => {
      await ctx.actions.setBiometricGateEnabled(false);
    });
    expect(Keychain.resetGenericPassword).toHaveBeenCalled();
    expect(ctx.state.settings.biometricGateEnabled).toBe(false);
  });

  it('writes the lock marker when the lock is turned on', async () => {
    stubPinExists(true);
    await renderProvider();
    await act(async () => {
      await ctx.actions.setBiometricGateEnabled(true);
    });
    const writes = markerWriteCallOrders();
    expect(writes).toHaveLength(1);
    expect(writes[0]).toBeLessThan(gateSettingWriteOrder('true'));
  });

  it('still turns the lock on when the marker cannot be written', async () => {
    stubPinExists(true);
    (Keychain.setGenericPassword as jest.Mock).mockImplementation(
      (_username: string, _password: string, options: { service: string }) =>
        options.service === MARKER_SERVICE
          ? Promise.reject(new Error('keystore busy'))
          : Promise.resolve(true),
    );
    await renderProvider();
    await act(async () => {
      await ctx.actions.setBiometricGateEnabled(true);
    });
    expect(markerWrites()).toHaveLength(1);
    expect(ctx.state.settings.biometricGateEnabled).toBe(true);
    expect(ctx.state.error).toBeNull();
  });

  it('clears the lock marker again when saving the lock-on setting fails', async () => {
    stubPinExists(true);
    await renderProvider();
    mockDb.setSetting.mockImplementation((_db, key) =>
      key === 'biometric_gate_enabled'
        ? Promise.reject(new Error('disk full'))
        : Promise.resolve(undefined),
    );
    await act(async () => {
      await expect(ctx.actions.setBiometricGateEnabled(true)).rejects.toThrow(
        'disk full',
      );
    });
    const writes = markerWriteCallOrders();
    const clears = markerClearCallOrders();
    expect(writes).toHaveLength(1);
    expect(clears).toHaveLength(1);
    expect(writes[0]).toBeLessThan(clears[0]);
    expect(ctx.state.settings.biometricGateEnabled).toBe(false);
    expect(ctx.state.error).toBe('disk full');
  });

  it('keeps the lock marker when only the credential version fails to save', async () => {
    stubPinExists(true);
    await renderProvider();
    mockDb.setSetting.mockImplementation((_db, key) =>
      key === 'biometric_cred_version'
        ? Promise.reject(new Error('disk full'))
        : Promise.resolve(undefined),
    );
    await act(async () => {
      await expect(ctx.actions.setBiometricGateEnabled(true)).rejects.toThrow(
        'disk full',
      );
    });
    expect(markerWrites()).toHaveLength(1);
    expect(markerClearCallOrders()).toHaveLength(0);
    expect(gateSettingWriteOrder('true')).not.toBeNaN();
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
   * A device with no TEE cannot hold the biometric credential. The PIN is a
   * complete unlock path on its own, so the gate must still go on for exactly
   * the users the fallback exists to serve.
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

  it('enables the gate PIN-only with no keychain attempt when no screen lock is set', async () => {
    stubPinExists(true);
    isDeviceSecure.mockResolvedValue(false);
    await renderProvider();

    await act(async () => {
      await ctx.actions.setBiometricGateEnabled(true);
    });

    expect(ctx.state.settings.biometricGateEnabled).toBe(true);
    expect(ctx.state.error).toBeNull();
    expect(biometricWrites()).toHaveLength(0);
  });

  /**
   * An unanswered lock-screen probe must not read as "no biometrics": for an
   * install with the gate on and no PIN, that would turn the lock screen into
   * PIN enrolment and a way to turn the lock off, without authenticating.
   */
  it('keeps a biometric-only install locked when the lock-screen probe fails', async () => {
    isDeviceSecure.mockRejectedValue(new Error('keyguard down'));
    (Keychain.hasGenericPassword as jest.Mock).mockImplementation(
      ({ service }: { service: string }) =>
        Promise.resolve(service === BIOMETRIC_SERVICE),
    );
    mockDb.getAllSettings.mockResolvedValue([
      { key: 'biometric_gate_enabled', value: 'true' },
      { key: 'biometric_cred_version', value: '2' },
    ]);
    await renderProvider();

    await waitFor(() =>
      expect(ctx.state.biometric.biometricsAvailable).toBe(true),
    );
    expect(ctx.state.biometric.isLocked).toBe(true);
    expect(ctx.state.pinSetupRequired).toBe(false);
    expect(screen.queryByText('Set an app PIN')).toBeNull();
    expect(screen.queryByText('Turn the lock off')).toBeNull();
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
      mockDb.getAllSettings.mockResolvedValue(gateOnNoVersion);
      await renderProvider();
      await confirmScreenLock();
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
      mockDb.getAllSettings.mockResolvedValue(gateOnNoVersion);
      await renderProvider();
      await confirmScreenLock();
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
     * gate on and no PIN is offered enrolment there — but only once the
     * screen lock has confirmed who is asking.
     */
    it("shows Confirm it's you, not enrolment, when no biometric can stand in", async () => {
      stubPinExists(false);
      (Keychain.getSupportedBiometryType as jest.Mock).mockResolvedValue(null);
      mockDb.getAllSettings.mockResolvedValue(gateOnNoVersion);
      await renderProvider();
      await waitFor(() =>
        expect(ctx.state.gatePresentation).toBe('confirm-credential'),
      );
      expect(
        screen.getByLabelText('Confirm your screen lock'),
      ).toBeOnTheScreen();
      expect(screen.queryByText('Set an app PIN')).toBeNull();
      expect(screen.queryByText('Turn the lock off')).toBeNull();
      expect(screen.queryByLabelText('App PIN')).toBeNull();

      await act(async () => {
        confirmCredential.mockResolvedValueOnce(true);
        fireEvent.press(screen.getByLabelText('Confirm your screen lock'));
      });
      await waitFor(() =>
        expect(screen.getByText('Set an app PIN')).toBeOnTheScreen(),
      );
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
      mockDb.getAllSettings.mockResolvedValue(gateOnNoVersion);
      await renderProvider();
      await confirmScreenLock();

      await act(async () => {
        await ctx.actions.completePinSetup('846207');
      });

      expect(written).toHaveLength(1);
      await waitFor(() => expect(ctx.state.biometric.isLocked).toBe(false));
      expect(ctx.state.pinSetupRequired).toBe(false);
    });

    it('offers that install no way to turn the lock off before it authenticates', async () => {
      stubPinExists(false);
      (Keychain.getSupportedBiometryType as jest.Mock).mockResolvedValue(null);
      mockDb.getAllSettings.mockResolvedValue(gateOnNoVersion);
      await renderProvider();
      await waitFor(() =>
        expect(ctx.state.gatePresentation).toBe('confirm-credential'),
      );
      expect(screen.queryByText('Turn the lock off')).toBeNull();
    });

    it('lets that install turn the lock off once the screen lock confirms', async () => {
      stubPinExists(false);
      (Keychain.getSupportedBiometryType as jest.Mock).mockResolvedValue(null);
      mockDb.getAllSettings.mockResolvedValue(gateOnNoVersion);
      await renderProvider();
      await confirmScreenLock();
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
                ? {
                    username: 'expense-tracker',
                    password: 'biometric-lock',
                    storage: 'KeystoreAESGCM',
                  }
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

    it('hides the app from assistive technology and keyboard focus while locked', async () => {
      stubPinExists(true);
      mockDb.getAllSettings.mockResolvedValue(gateOnSettings);
      const view = renderWithProviders(
        <TransactionDataProvider>
          <Capture />
        </TransactionDataProvider>,
      );
      await waitFor(() => expect(ctx.state.biometric.isLocked).toBe(true));
      const appRoot = view.UNSAFE_getByProps({ blocked: true });
      expect(appRoot.props.importantForAccessibility).toBe(
        'no-hide-descendants',
      );
      expect(screen.getByText('Unlock required')).toBeOnTheScreen();
    });

    it('exposes the app again once unlocked', async () => {
      stubKeychain({ biometricRead: true, pinPassword: STORED_PIN_RECORD });
      mockDb.getAllSettings.mockResolvedValue(gateOnSettings);
      const view = renderWithProviders(
        <TransactionDataProvider>
          <Capture />
        </TransactionDataProvider>,
      );
      await waitFor(() => expect(ctx.state.biometric.isLocked).toBe(false));
      const appRoot = view.UNSAFE_getByProps({ blocked: false });
      expect(appRoot.props.importantForAccessibility).toBe('auto');
    });

    it('turns the lock off only once the current PIN verifies', async () => {
      stubKeychain({ biometricRead: true, pinPassword: STORED_PIN_RECORD });
      mockDb.getAllSettings.mockResolvedValue(gateOnSettings);
      await renderProvider();
      await waitFor(() => expect(ctx.state.biometric.isLocked).toBe(false));
      let turnedOff = true;
      await act(async () => {
        turnedOff = await ctx.actions.turnOffAppLock('135792');
      });
      expect(turnedOff).toBe(false);
      expect(ctx.state.settings.biometricGateEnabled).toBe(true);
      expect(mockDb.setSetting).not.toHaveBeenCalledWith(
        expect.anything(),
        'biometric_gate_enabled',
        'false',
      );
    });

    it('turns the lock off with the right PIN', async () => {
      (Keychain.setGenericPassword as jest.Mock).mockImplementation(
        (_username: string, password: string, options: { service: string }) => {
          if (options.service === APP_PIN_SERVICE) {
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
      mockDb.getAllSettings.mockResolvedValue(gateOnSettings);
      await renderProvider();
      await confirmScreenLock();
      await act(async () => {
        await ctx.actions.setAppPin('846207');
      });
      let turnedOff = false;
      await act(async () => {
        turnedOff = await ctx.actions.turnOffAppLock('846207');
      });
      expect(turnedOff).toBe(true);
      expect(ctx.state.settings.biometricGateEnabled).toBe(false);
    });

    const enrolPinOnGateOnInstall = async (): Promise<void> => {
      (Keychain.setGenericPassword as jest.Mock).mockImplementation(
        (_username: string, password: string, options: { service: string }) => {
          if (options.service === APP_PIN_SERVICE) {
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
      mockDb.getAllSettings.mockResolvedValue(gateOnSettings);
      await renderProvider();
      await confirmScreenLock();
      await act(async () => {
        await ctx.actions.setAppPin('846207');
      });
    };

    it('clears the lock marker when the lock is turned off', async () => {
      await enrolPinOnGateOnInstall();
      await act(async () => {
        await ctx.actions.turnOffAppLock('846207');
      });
      const clears = markerClearCallOrders();
      expect(clears).toHaveLength(1);
      expect(clears[0]).toBeGreaterThan(gateSettingWriteOrder('false'));
    });

    it('keeps the lock marker when saving the lock-off setting fails', async () => {
      await enrolPinOnGateOnInstall();
      mockDb.setSetting.mockRejectedValueOnce(new Error('write failed'));
      let error: unknown = null;
      await act(async () => {
        await ctx.actions.turnOffAppLock('846207').catch((e: unknown) => {
          error = e;
        });
      });
      expect(error).toBeInstanceOf(Error);
      expect(markerClearCallOrders()).toHaveLength(0);
    });

    it('refuses a new PIN on a locked install that has not authenticated', async () => {
      stubPinExists(false);
      mockDb.getAllSettings.mockResolvedValue(gateOnSettings);
      await renderProvider();
      await waitFor(() => expect(ctx.state.biometric.isLocked).toBe(true));
      let error: unknown = null;
      await act(async () => {
        await ctx.actions.setAppPin('846207').catch((e: unknown) => {
          error = e;
        });
      });
      expect(isAppLockError(error, 'not-authenticated')).toBe(true);
      expect(Keychain.setGenericPassword).not.toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.objectContaining({ service: APP_PIN_SERVICE }),
      );
    });

    it('sets a PIN while the gate is off', async () => {
      stubPinExists(false);
      await renderProvider();
      await act(async () => {
        await ctx.actions.setAppPin('846207');
      });
      expect(Keychain.setGenericPassword).toHaveBeenCalledWith(
        expect.anything(),
        expect.anything(),
        expect.objectContaining({ service: APP_PIN_SERVICE }),
      );
    });

    it('renders the app only once settings have loaded', async () => {
      let finishLoad: (rows: { key: string; value: string }[]) => void = () =>
        undefined;
      mockDb.getAllSettings.mockImplementation(
        () =>
          new Promise(resolve => {
            finishLoad = resolve;
          }),
      );
      renderWithProviders(
        <TransactionDataProvider>
          <Capture />
          <Text>app content</Text>
        </TransactionDataProvider>,
      );
      await act(async () => undefined);
      expect(
        screen.queryByText('app content', { includeHiddenElements: true }),
      ).toBeNull();
      expect(ctx).toBeUndefined();
      await act(async () => {
        finishLoad(gateOnSettings);
      });
      await waitFor(() =>
        expect(
          screen.getByText('app content', { includeHiddenElements: true }),
        ).toBeOnTheScreen(),
      );
      await waitFor(() => expect(ctx.state.biometric.isLocked).toBe(true));
    });

    describe('a gate-on install with no PIN, before any authentication', () => {
      it.each<[string, () => void]>([
        [
          'the screen lock was removed',
          () => isDeviceSecure.mockResolvedValue(false),
        ],
        [
          'every biometric was un-enrolled',
          () =>
            (Keychain.getSupportedBiometryType as jest.Mock).mockResolvedValue(
              null,
            ),
        ],
        ['the biometric credential is missing', () => undefined],
        [
          'the biometry probe throws',
          () =>
            (Keychain.getSupportedBiometryType as jest.Mock).mockRejectedValue(
              new Error('probe failed'),
            ),
        ],
      ])('refuses enrolment and turn-off when %s', async (_label, arrange) => {
        stubPinExists(false);
        arrange();
        mockDb.getAllSettings.mockResolvedValue(gateOnSettings);
        await renderProvider();
        await waitFor(() =>
          expect(ctx.state.biometric.biometricsAvailable).toBe(false),
        );

        await act(async () => {
          const setup = await ctx.actions
            .completePinSetup('846207')
            .catch((error: unknown) => error);
          const decline = await ctx.actions
            .declinePinSetup()
            .catch((error: unknown) => error);
          expect(isAppLockError(setup, 'not-authenticated')).toBe(true);
          expect(isAppLockError(decline, 'not-authenticated')).toBe(true);
        });

        expect(ctx.state.biometric.isLocked).toBe(true);
        expect(screen.queryByText('Set an app PIN')).toBeNull();
        expect(screen.queryByText('Turn the lock off')).toBeNull();
        expect(mockDb.setSetting).not.toHaveBeenCalledWith(
          expect.anything(),
          'biometric_gate_enabled',
          'false',
        );
        expect(Keychain.setGenericPassword).not.toHaveBeenCalledWith(
          expect.anything(),
          expect.anything(),
          expect.objectContaining({ service: APP_PIN_SERVICE }),
        );
      });

      it('never renders enrolment on the way to the cold-start lock', async () => {
        stubPinExists(false);
        (Keychain.getSupportedBiometryType as jest.Mock).mockResolvedValue(
          null,
        );
        mockDb.getAllSettings.mockResolvedValue(gateOnSettings);
        await renderProvider();
        await waitFor(() =>
          expect(ctx.state.gatePresentation).toBe('confirm-credential'),
        );
        expect(mockPinDialogModes).not.toContain('enrol');
      });

      it('moves from asking for a screen lock to confirming it once one is set', async () => {
        stubPinExists(false);
        isDeviceSecure.mockResolvedValue(false);
        mockDb.getAllSettings.mockResolvedValue(gateOnSettings);
        const addEventListenerSpy = jest.spyOn(AppState, 'addEventListener');
        await renderProvider();
        await waitFor(() =>
          expect(screen.getByText('Screen lock needed')).toBeOnTheScreen(),
        );

        isDeviceSecure.mockResolvedValue(true);
        const changeCalls = addEventListenerSpy.mock.calls.filter(
          call => call[0] === 'change',
        );
        const handler = changeCalls[changeCalls.length - 1][1] as (
          status: string,
        ) => void;
        act(() => handler('background'));
        act(() => handler('active'));

        await waitFor(() =>
          expect(
            screen.getByLabelText('Confirm your screen lock'),
          ).toBeOnTheScreen(),
        );
        expect(ctx.state.biometric.isLocked).toBe(true);
      });

      it('opens a key that no longer works through the screen lock', async () => {
        stubKeychain({ biometricRead: false, pinPassword: null });
        (Keychain.getGenericPassword as jest.Mock).mockImplementation(
          ({ service }: { service: string }) =>
            service === BIOMETRIC_SERVICE
              ? Promise.reject(new Error('Key permanently invalidated'))
              : Promise.resolve(false),
        );
        mockDb.getAllSettings.mockResolvedValue(gateOnSettings);
        await renderProvider();
        await waitFor(() =>
          expect(ctx.state.biometric.lastError).toBe(
            'Not unlocked. Tap Try again or use your screen lock.',
          ),
        );
        expect(screen.queryByText(/permanently invalidated/)).toBeNull();

        await act(async () => {
          confirmCredential.mockResolvedValueOnce(true);
          fireEvent.press(screen.getByLabelText('Use screen lock instead'));
        });
        await waitFor(() =>
          expect(screen.getByText('Set an app PIN')).toBeOnTheScreen(),
        );
      });

      it('gives no way in through a credential an older build stored without authentication', async () => {
        const stored: Record<string, boolean> = {
          [BIOMETRIC_SERVICE]: true,
        };
        (Keychain.hasGenericPassword as jest.Mock).mockImplementation(
          ({ service }: { service: string }) =>
            Promise.resolve(Boolean(stored[service])),
        );
        (Keychain.resetGenericPassword as jest.Mock).mockImplementation(
          ({ service }: { service: string }) => {
            stored[service] = false;
            return Promise.resolve(true);
          },
        );
        (Keychain.getGenericPassword as jest.Mock).mockImplementation(
          ({ service }: { service: string }) =>
            Promise.resolve(
              service === BIOMETRIC_SERVICE && stored[service]
                ? {
                    username: 'expense-tracker',
                    password: 'biometric-lock',
                    storage: Keychain.STORAGE_TYPE.AES_GCM_NO_AUTH,
                  }
                : false,
            ),
        );
        mockDb.getAllSettings.mockResolvedValue(gateOnSettings);
        await renderProvider();

        await waitFor(() =>
          expect(ctx.state.gatePresentation).toBe('confirm-credential'),
        );
        expect(ctx.state.biometric.isLocked).toBe(true);
        expect(mockPinDialogModes).not.toContain('enrol');
        expect(screen.queryByText('Turn the lock off')).toBeNull();
        expect(mockDb.setSetting).not.toHaveBeenCalledWith(
          expect.anything(),
          'biometric_gate_enabled',
          'false',
        );
      });

      it('asks for the screen lock after the credential upgrade finds none can be made', async () => {
        stubPinExists(false);
        (Keychain.getSupportedBiometryType as jest.Mock).mockResolvedValue(
          null,
        );
        mockDb.getAllSettings.mockResolvedValue(gateOnNoVersion);
        await renderProvider();
        await waitFor(() =>
          expect(ctx.state.gatePresentation).toBe('confirm-credential'),
        );
        expect(screen.queryByText('Set an app PIN')).toBeNull();
      });
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

    describe('while the app is locked', () => {
      let nowSpy: jest.SpyInstance | null = null;

      afterEach(() => {
        nowSpy?.mockRestore();
        nowSpy = null;
      });
      const LOCKOUT_SERVICE = 'expense-tracker-app-pin-lockout';

      const clearWriteMocks = (): void => {
        [...Object.values(mockDb), ...Object.values(mockExport)].forEach(fn => {
          if (jest.isMockFunction(fn)) {
            fn.mockClear();
          }
        });
        mockImport.commitImport.mockClear();
        mockStorage.requestDirectorySelection.mockClear();
        (Keychain.setGenericPassword as jest.Mock).mockClear();
      };

      const renderLocked = async (
        tree: React.ReactElement = (
          <TransactionDataProvider>
            <Capture />
          </TransactionDataProvider>
        ),
      ) => {
        stubKeychain({ biometricRead: false, pinPassword: STORED_PIN_RECORD });
        mockDb.getAllSettings.mockResolvedValue(gateOnSettings);
        const view = renderWithProviders(tree);
        await waitFor(() => expect(ctx?.state.biometric.isLocked).toBe(true));
        await waitFor(() =>
          expect(ctx.state.biometric.lastError).not.toBeNull(),
        );
        clearWriteMocks();
        return view;
      };

      /** Renders unlocked; `lock` then locks through the background timeout. */
      const renderUnlocked = async () => {
        stubKeychain({ biometricRead: true, pinPassword: STORED_PIN_RECORD });
        mockDb.getAllSettings.mockResolvedValue(gateOnSettings);
        const addEventListenerSpy = jest.spyOn(AppState, 'addEventListener');
        const clock = jest.spyOn(Date, 'now').mockReturnValue(1_000_000);
        nowSpy = clock;
        await renderProvider();
        await waitFor(() => expect(ctx.state.biometric.isLocked).toBe(false));
        const lock = async (): Promise<void> => {
          const changeCalls = addEventListenerSpy.mock.calls.filter(
            call => call[0] === 'change',
          );
          const handler = changeCalls[changeCalls.length - 1][1] as (
            status: string,
          ) => void;
          stubKeychain({
            biometricRead: false,
            pinPassword: STORED_PIN_RECORD,
          });
          act(() => handler('background'));
          clock.mockReturnValue(1_000_000 + 6 * 60 * 1000);
          act(() => handler('active'));
          expect(ctx.state.biometric.isLocked).toBe(true);
          await waitFor(() =>
            expect(ctx.state.biometric.lastError).not.toBeNull(),
          );
          clearWriteMocks();
        };
        return { lock };
      };

      const settle = async (call: () => Promise<unknown>): Promise<unknown> => {
        let outcome: unknown;
        await act(async () => {
          outcome = await call().catch((e: unknown) => e);
        });
        return outcome;
      };

      it.each<[string, () => Promise<unknown>, () => unknown[]]>([
        [
          'createTransaction',
          () =>
            ctx.actions.createTransaction({
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
              isConfirmed: true,
            }),
          () => [mockDb.createTransaction],
        ],
        [
          'updateTransaction',
          () => ctx.actions.updateTransaction({ ...transaction }),
          () => [mockDb.updateTransaction],
        ],
        [
          'deleteTransaction',
          () => ctx.actions.deleteTransaction(1),
          () => [mockDb.deleteTransaction],
        ],
        [
          'setTransactionConfirmed',
          () => ctx.actions.setTransactionConfirmed(1, false),
          () => [mockDb.setTransactionConfirmed],
        ],
        [
          'createCategory',
          () => ctx.actions.createCategory({ name: 'Food', type: 'both' }),
          () => [mockDb.createCategory],
        ],
        [
          'updateCategory',
          () =>
            ctx.actions.updateCategory({ id: 1, name: 'Fuel', type: 'both' }),
          () => [mockDb.updateCategory],
        ],
        [
          'deleteCategory',
          () => ctx.actions.deleteCategory(1),
          () => [mockDb.deleteCategory],
        ],
        [
          'createFund',
          () =>
            ctx.actions.createFund({
              name: 'Travel',
              currencyCode: null,
              openingBalance: 0,
              notes: null,
            }),
          () => [mockDb.createFund],
        ],
        [
          'updateFund',
          () =>
            ctx.actions.updateFund({
              id: 3,
              name: 'Trips',
              currencyCode: null,
              openingBalance: 0,
              notes: null,
            }),
          () => [mockDb.updateFund],
        ],
        [
          'deleteFund',
          () => ctx.actions.deleteFund(1),
          () => [mockDb.deleteFund],
        ],
        [
          'setBaseCurrency',
          () => ctx.actions.setBaseCurrency('EUR'),
          () => [mockDb.setSetting],
        ],
        [
          'setBiometricGateEnabled',
          () => ctx.actions.setBiometricGateEnabled(false),
          () => [mockDb.setSetting],
        ],
        [
          'setAutoLockMinutes',
          () => ctx.actions.setAutoLockMinutes(null),
          () => [mockDb.setSetting],
        ],
        [
          'setDriveFolderId',
          () => ctx.actions.setDriveFolderId('f'),
          () => [mockDb.setSetting],
        ],
        [
          'setExportDirectoryUri',
          () => ctx.actions.setExportDirectoryUri('content://x'),
          () => [mockDb.setSetting],
        ],
        [
          'queueExport',
          () => ctx.actions.queueExport(),
          () => [
            mockDb.insertExportQueueItem,
            mockStorage.requestDirectorySelection,
          ],
        ],
        [
          'retryExport',
          () => ctx.actions.retryExport('q1'),
          () => [mockDb.updateExportQueueStatus],
        ],
        [
          'removeExport',
          () => ctx.actions.removeExport('q1'),
          () => [mockDb.removeExportQueueItem],
        ],
        [
          'clearCompletedExports',
          () => ctx.actions.clearCompletedExports(),
          () => [mockDb.clearCompletedExportQueueItems],
        ],
        [
          'importTransactions',
          () => ctx.actions.importTransactions(emptyPreview),
          () => [mockImport.commitImport],
        ],
        [
          'changeAppPin',
          () => ctx.actions.changeAppPin('111213', '846207'),
          () => [Keychain.setGenericPassword as jest.Mock],
        ],
        [
          'turnOffAppLock',
          () => ctx.actions.turnOffAppLock('846207'),
          () => [Keychain.setGenericPassword as jest.Mock, mockDb.setSetting],
        ],
      ])('refuses %s without writing', async (_name, call, spies) => {
        await renderLocked();
        const outcome = await settle(call);
        expect(isAppLockError(outcome, 'locked')).toBe(true);
        spies().forEach(spy => expect(spy).not.toHaveBeenCalled());
        expect(ctx.state.error).toBeNull();
        expect(ctx.state.isLoading).toBe(false);
      });

      it('refuses actions captured before the lock', async () => {
        const { lock } = await renderUnlocked();
        const staleDelete = ctx.actions.deleteCategory;
        const staleAutoLock = ctx.actions.setAutoLockMinutes;
        await lock();

        const deleted = await settle(() => staleDelete(1));
        const autoLock = await settle(() => staleAutoLock(null));

        expect(isAppLockError(deleted, 'locked')).toBe(true);
        expect(isAppLockError(autoLock, 'locked')).toBe(true);
        expect(mockDb.deleteCategory).not.toHaveBeenCalled();
        expect(mockDb.setSetting).not.toHaveBeenCalledWith(
          expect.anything(),
          'auto_lock_minutes',
          expect.anything(),
        );
      });

      it('lets a captured action through again once unlocked', async () => {
        const { lock } = await renderUnlocked();
        const staleDelete = ctx.actions.deleteCategory;
        await lock();

        stubKeychain({ biometricRead: true, pinPassword: STORED_PIN_RECORD });
        await act(async () => {
          await ctx.actions.unlockWithBiometrics();
        });
        expect(ctx.state.biometric.isLocked).toBe(false);

        await act(async () => {
          await staleDelete(1);
        });
        expect(mockDb.deleteCategory).toHaveBeenCalledWith(
          expect.anything(),
          1,
        );
      });

      it('refuses an interactive upload but allows a non-interactive one', async () => {
        await renderLocked();
        const interactive = await settle(() =>
          ctx.actions.uploadQueuedExports({ interactive: true }),
        );
        expect(isAppLockError(interactive, 'locked')).toBe(true);
        expect(mockExport.uploadPendingExports).not.toHaveBeenCalled();

        await act(async () => {
          await ctx.actions.uploadQueuedExports();
        });
        expect(mockExport.uploadPendingExports).toHaveBeenCalledWith({
          interactive: false,
        });
      });

      it('keeps the automatic upload running', async () => {
        mockDb.listExportQueue.mockResolvedValue([
          queueRecord({ status: 'pending', lastError: null }),
        ]);
        await renderLocked();
        const netListener = (NetInfo.addEventListener as jest.Mock).mock
          .calls[0][0] as (info: {
          isConnected: boolean;
          isInternetReachable: boolean;
        }) => void;
        act(() =>
          netListener({ isConnected: true, isInternetReachable: true }),
        );
        await waitFor(() =>
          expect(mockExport.uploadPendingExports).toHaveBeenCalledWith({
            interactive: false,
          }),
        );
      });

      it('still reads data and answers PIN availability', async () => {
        await renderLocked();
        await act(async () => {
          await ctx.actions.refresh();
        });
        expect(mockDb.listTransactions).toHaveBeenCalled();
        await expect(ctx.actions.appPinUsable()).resolves.toBe(true);
      });

      it('ignores filter and error changes without throwing', async () => {
        await renderLocked();
        const lastError = ctx.state.biometric.lastError;
        act(() => {
          ctx.actions.setFilters({ query: 'x' });
          ctx.actions.clearFilters();
          ctx.actions.clearError();
        });
        expect(ctx.state.filters).toEqual({});
        expect(ctx.state.biometric.lastError).toBe(lastError);
      });

      it('spends no PIN attempt on a refused change or turn-off', async () => {
        await renderLocked();
        await settle(() => ctx.actions.changeAppPin('111213', '846207'));
        await settle(() => ctx.actions.turnOffAppLock('846207'));
        expect(Keychain.setGenericPassword).not.toHaveBeenCalledWith(
          expect.anything(),
          expect.anything(),
          expect.objectContaining({ service: LOCKOUT_SERVICE }),
        );
      });

      it('lets an authenticated enrolment decline turn the lock off', async () => {
        stubKeychain({ biometricRead: true, pinPassword: null });
        mockDb.getAllSettings.mockResolvedValue(gateOnSettings);
        await renderProvider();
        await waitFor(() => expect(ctx.state.pinSetupRequired).toBe(true));
        await act(async () => {
          await ctx.actions.declinePinSetup();
        });
        expect(mockDb.setSetting).toHaveBeenCalledWith(
          expect.anything(),
          'biometric_gate_enabled',
          'false',
        );
      });

      it('keeps a filter a child sets as it mounts on a cold start', async () => {
        const FilterProbe: React.FC = () => {
          const { setFilters } = useTransactionData().actions;
          useEffect(() => {
            setFilters({ startDate: '2025-01-01' });
          }, [setFilters]);
          return null;
        };
        await renderLocked(
          <TransactionDataProvider>
            <Capture />
            <FilterProbe />
          </TransactionDataProvider>,
        );
        expect(ctx.state.filters.startDate).toBe('2025-01-01');
      });

      it('classifies every action in the lock policy', async () => {
        await renderProvider();
        expect(Object.keys(ctx.actions).sort()).toEqual(
          Object.keys(TRANSACTION_ACTION_LOCK_POLICY).sort(),
        );
      });

      it('renders screen dialogs inside the seal and the lock screen outside it', async () => {
        const view = await renderLocked(
          <TransactionDataProvider>
            <Capture />
            <Portal>
              <Text>sealed dialog</Text>
            </Portal>
          </TransactionDataProvider>,
        );
        const sealedRoot = view.UNSAFE_getByProps({ blocked: true });
        const isInside = (node: { parent: unknown } | null): boolean => {
          let current = node as { parent: unknown } | null;
          while (current) {
            if (current === sealedRoot) {
              return true;
            }
            current = current.parent as { parent: unknown } | null;
          }
          return false;
        };
        expect(screen.queryByText('sealed dialog')).toBeNull();
        expect(
          isInside(
            screen.getByText('sealed dialog', { includeHiddenElements: true }),
          ),
        ).toBe(true);
        expect(isInside(screen.getByText('Unlock required'))).toBe(false);
      });
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

  it('locks fail-closed on a settings-load failure when only the lock marker exists', async () => {
    mockDb.listTransactions.mockRejectedValueOnce(new Error('load failed'));
    stubMarkerOnly();
    await renderProvider();
    await waitFor(() => expect(ctx.state.biometric.isLocked).toBe(true));
    expect(ctx.state.error).toBe('load failed');
    expect(ctx.state.settings.biometricGateEnabled).toBe(true);
  });

  it.each([BIOMETRIC_SERVICE, APP_PIN_SERVICE])(
    'latches the lock marker on a settings-load failure when %s exists',
    async credentialService => {
      mockDb.listTransactions.mockRejectedValueOnce(new Error('load failed'));
      (Keychain.hasGenericPassword as jest.Mock).mockImplementation(
        ({ service }: { service: string }) =>
          Promise.resolve(service === credentialService),
      );
      await renderProvider();
      await waitFor(() => expect(markerWrites()).toHaveLength(1));
      expect(markerClearCallOrders()).toHaveLength(0);
    },
  );

  it('does not latch the lock marker on a settings-load failure with no credential', async () => {
    mockDb.listTransactions.mockRejectedValueOnce(new Error('load failed'));
    (Keychain.hasGenericPassword as jest.Mock).mockResolvedValue(false);
    await renderProvider();
    await act(async () => {});
    expect(markerWrites()).toHaveLength(0);
  });

  it('does not touch the lock marker on a settings-load failure when it is already there', async () => {
    mockDb.listTransactions.mockRejectedValueOnce(new Error('load failed'));
    (Keychain.hasGenericPassword as jest.Mock).mockResolvedValue(true);
    await renderProvider();
    await act(async () => {});
    expect(markerWrites()).toHaveLength(0);
    expect(markerClearCallOrders()).toHaveLength(0);
  });

  it('stays locked after the last credential is lost while settings keep failing', async () => {
    const stored = new Set([BIOMETRIC_SERVICE]);
    (Keychain.hasGenericPassword as jest.Mock).mockImplementation(
      ({ service }: { service: string }) =>
        Promise.resolve(stored.has(service)),
    );
    (Keychain.setGenericPassword as jest.Mock).mockImplementation(
      (_username: string, _password: string, options: { service: string }) => {
        stored.add(options.service);
        return Promise.resolve(true);
      },
    );
    mockDb.listTransactions.mockRejectedValueOnce(new Error('load failed'));
    await renderProvider();
    await waitFor(() => expect(stored.has(MARKER_SERVICE)).toBe(true));
    stored.delete(BIOMETRIC_SERVICE);
    mockDb.listTransactions.mockRejectedValueOnce(new Error('reload failed'));
    await act(async () => {
      await ctx.actions.refresh();
    });
    expect(ctx.state.error).toBe('reload failed');
    expect(ctx.state.biometric.isLocked).toBe(true);
  });

  it('keeps the lock on when a later reload fails on an install with only the marker', async () => {
    mockDb.getAllSettings.mockResolvedValue([
      { key: 'biometric_gate_enabled', value: 'true' },
      { key: 'biometric_cred_version', value: '2' },
    ]);
    stubMarkerOnly();
    await renderProvider();
    await waitFor(() => expect(ctx.state.biometric.isLocked).toBe(true));
    mockDb.listTransactions.mockRejectedValueOnce(new Error('reload failed'));
    await act(async () => {
      await ctx.actions.refresh();
    });
    expect(ctx.state.error).toBe('reload failed');
    expect(ctx.state.settings.biometricGateEnabled).toBe(true);
    expect(ctx.state.biometric.isLocked).toBe(true);
  });

  it('backfills the marker on a healthy load with the lock on', async () => {
    mockDb.getAllSettings.mockResolvedValue([
      { key: 'biometric_gate_enabled', value: 'true' },
      { key: 'biometric_cred_version', value: '2' },
    ]);
    await renderProvider();
    await waitFor(() => expect(markerWrites()).toHaveLength(1));
  });

  it('clears a stale marker on a healthy load with the lock off', async () => {
    mockDb.getAllSettings.mockResolvedValue([
      { key: 'biometric_gate_enabled', value: 'false' },
    ]);
    stubMarkerOnly();
    await renderProvider();
    await waitFor(() => expect(markerClearCallOrders()).toHaveLength(1));
    expect(markerWrites()).toHaveLength(0);
    expect(ctx.state.biometric.isLocked).toBe(false);
  });

  describe('a healthy load with no definite lock setting', () => {
    const markerProbes = () =>
      (Keychain.hasGenericPassword as jest.Mock).mock.calls.filter(
        ([options]) => options?.service === MARKER_SERVICE,
      );

    const gateSettingWrites = () =>
      mockDb.setSetting.mock.calls.filter(
        ([, key]) => key === 'biometric_gate_enabled',
      );

    it('locks and restores the setting when the marker is present', async () => {
      stubMarkerOnly();
      await renderProvider();
      await waitFor(() => expect(ctx.state.biometric.isLocked).toBe(true));
      expect(ctx.state.settings.biometricGateEnabled).toBe(true);
      await waitFor(() =>
        expect(mockDb.setSetting).toHaveBeenCalledWith(
          expect.anything(),
          'biometric_gate_enabled',
          'true',
        ),
      );
      expect(markerWrites()).toHaveLength(0);
      expect(markerClearCallOrders()).toHaveLength(0);
    });

    it('opens as a fresh install and stores the lock as off when there is no marker', async () => {
      await renderProvider();
      await act(async () => {});
      expect(ctx.state.biometric.isLocked).toBe(false);
      expect(ctx.state.settings.biometricGateEnabled).toBe(false);
      expect(gateSettingWrites()).toEqual([
        [expect.anything(), 'biometric_gate_enabled', 'false'],
      ]);
      expect(markerWrites()).toHaveLength(0);
      expect(markerClearCallOrders()).toHaveLength(0);
    });

    it('locks without restoring the setting when the marker cannot be read', async () => {
      (Keychain.hasGenericPassword as jest.Mock).mockImplementation(
        ({ service }: { service: string }) =>
          service === MARKER_SERVICE
            ? Promise.reject(new Error('keychain down'))
            : Promise.resolve(false),
      );
      await renderProvider();
      await waitFor(() => expect(ctx.state.biometric.isLocked).toBe(true));
      await act(async () => {});
      expect(ctx.state.error).toBeNull();
      expect(gateSettingWrites()).toHaveLength(0);
    });

    it.each([null, 'TRUE'])(
      'treats a stored value of %p like a missing setting',
      async value => {
        mockDb.getAllSettings.mockResolvedValue([
          { key: 'biometric_gate_enabled', value },
        ]);
        stubMarkerOnly();
        await renderProvider();
        await waitFor(() => expect(ctx.state.biometric.isLocked).toBe(true));
        await waitFor(() =>
          expect(mockDb.setSetting).toHaveBeenCalledWith(
            expect.anything(),
            'biometric_gate_enabled',
            'true',
          ),
        );
        expect(markerClearCallOrders()).toHaveLength(0);
      },
    );

    it.each([null, 'TRUE'])(
      'replaces a stored value of %p with off and opens when there is no marker',
      async value => {
        mockDb.getAllSettings.mockResolvedValue([
          { key: 'biometric_gate_enabled', value },
        ]);
        await renderProvider();
        await act(async () => {});
        expect(ctx.state.biometric.isLocked).toBe(false);
        expect(gateSettingWrites()).toEqual([
          [expect.anything(), 'biometric_gate_enabled', 'false'],
        ]);
      },
    );

    it('stays healthy and locked when restoring the setting fails', async () => {
      stubMarkerOnly();
      mockDb.setSetting.mockRejectedValue(new Error('disk full'));
      await renderProvider();
      await waitFor(() => expect(ctx.state.biometric.isLocked).toBe(true));
      await waitFor(() => expect(gateSettingWrites()).toHaveLength(1));
      await act(async () => {});
      expect(ctx.state.error).toBeNull();
      expect(markerClearCallOrders()).toHaveLength(0);
    });

    it.each(['true', 'false'])(
      'probes the marker only once, from the sync, when the setting reads %p',
      async value => {
        mockDb.getAllSettings.mockResolvedValue([
          { key: 'biometric_gate_enabled', value },
          { key: 'biometric_cred_version', value: '2' },
        ]);
        await renderProvider();
        await waitFor(() => expect(markerProbes()).toHaveLength(1));
        await act(async () => {});
        expect(markerProbes()).toHaveLength(1);
      },
    );
  });

  it('does not rewrite a marker that is already present', async () => {
    mockDb.getAllSettings.mockResolvedValue([
      { key: 'biometric_gate_enabled', value: 'true' },
      { key: 'biometric_cred_version', value: '2' },
    ]);
    stubMarkerOnly();
    await renderProvider();
    await waitFor(() =>
      expect(Keychain.hasGenericPassword).toHaveBeenCalledWith({
        service: MARKER_SERVICE,
      }),
    );
    await act(async () => {});
    expect(markerWrites()).toHaveLength(0);
    expect(markerClearCallOrders()).toHaveLength(0);
  });

  it('keeps a healthy load healthy when the marker sync fails', async () => {
    mockDb.getAllSettings.mockResolvedValue([
      { key: 'biometric_gate_enabled', value: 'true' },
      { key: 'biometric_cred_version', value: '2' },
    ]);
    (Keychain.hasGenericPassword as jest.Mock).mockImplementation(
      ({ service }: { service: string }) =>
        service === MARKER_SERVICE
          ? Promise.reject(new Error('keychain down'))
          : Promise.resolve(false),
    );
    await renderProvider();
    await act(async () => {});
    expect(ctx.state.error).toBeNull();
    expect(ctx.state.settings.biometricGateEnabled).toBe(true);
  });

  it('writes the marker on the load whose credential upgrade finds creation impossible', async () => {
    mockDb.getAllSettings.mockResolvedValue([
      { key: 'biometric_gate_enabled', value: 'true' },
    ]);
    (Keychain.getSupportedBiometryType as jest.Mock).mockResolvedValue(null);
    await renderProvider();
    await confirmScreenLock();
    await waitFor(() =>
      expect(mockDb.setSetting).toHaveBeenCalledWith(
        expect.anything(),
        'biometric_cred_version',
        '2',
      ),
    );
    expect(Keychain.resetGenericPassword).toHaveBeenCalledWith({
      service: BIOMETRIC_SERVICE,
    });
    expect(biometricWrites()).toHaveLength(0);
    expect(markerWrites()).toHaveLength(1);
  });

  it('locks fail-closed when the credential probe itself throws', async () => {
    mockDb.listTransactions.mockRejectedValueOnce(new Error('load failed'));
    (Keychain.hasGenericPassword as jest.Mock).mockRejectedValue(
      new Error('keychain down'),
    );
    await renderProvider();
    await waitFor(() => expect(ctx.state.biometric.isLocked).toBe(true));
  });

  it('leaves a legacy credential alone until the app is unlocked', async () => {
    mockDb.getAllSettings.mockResolvedValue([
      { key: 'biometric_gate_enabled', value: 'true' },
    ]);
    await renderProvider();
    await waitFor(() => expect(ctx.state.biometric.isLocked).toBe(true));
    await act(async () => {});
    expect(biometricWrites()).toHaveLength(0);
    expect(
      (Keychain.resetGenericPassword as jest.Mock).mock.calls.filter(
        ([options]) => options?.service === BIOMETRIC_SERVICE,
      ),
    ).toHaveLength(0);
    expect(mockDb.setSetting).not.toHaveBeenCalledWith(
      expect.anything(),
      'biometric_cred_version',
      '2',
    );
  });

  it('refreshes a legacy credential to the new access control once unlocked', async () => {
    mockDb.getAllSettings.mockResolvedValue([
      { key: 'biometric_gate_enabled', value: 'true' },
    ]);
    await renderProvider();
    await confirmScreenLock();
    await waitFor(() =>
      expect(mockDb.setSetting).toHaveBeenCalledWith(
        expect.anything(),
        'biometric_cred_version',
        '2',
      ),
    );
    expect(biometricWrites()).toHaveLength(1);
  });

  it('does not refresh when the credential version is already current', async () => {
    mockDb.getAllSettings.mockResolvedValue([
      { key: 'biometric_gate_enabled', value: 'true' },
      { key: 'biometric_cred_version', value: '2' },
    ]);
    await renderProvider();
    await waitFor(() => expect(ctx.state.biometric.isLocked).toBe(true));
    expect(biometricWrites()).toHaveLength(0);
  });

  it('counts the refresh done when the device has no secure lock screen', async () => {
    isDeviceSecure.mockResolvedValue(false);
    mockDb.getAllSettings.mockResolvedValue([
      { key: 'biometric_gate_enabled', value: 'true' },
    ]);
    await renderProvider();
    await confirmScreenLock();
    await waitFor(() =>
      expect(mockDb.setSetting).toHaveBeenCalledWith(
        expect.anything(),
        'biometric_cred_version',
        '2',
      ),
    );
    expect(biometricWrites()).toHaveLength(0);
  });

  it('retries the refresh next launch when the lock-screen probe cannot answer', async () => {
    isDeviceSecure.mockRejectedValue(new Error('keyguard down'));
    mockDb.getAllSettings.mockResolvedValue([
      { key: 'biometric_gate_enabled', value: 'true' },
    ]);
    await renderProvider();
    await waitFor(() => expect(ctx.state.biometric.isLocked).toBe(true));
    await confirmScreenLock();
    expect(mockDb.setSetting).not.toHaveBeenCalledWith(
      expect.anything(),
      'biometric_cred_version',
      '2',
    );
    expect(
      (Keychain.resetGenericPassword as jest.Mock).mock.calls.filter(
        ([options]) => options?.service === BIOMETRIC_SERVICE,
      ),
    ).toHaveLength(0);
  });

  it('does not bump the version when the credential refresh fails', async () => {
    mockDb.getAllSettings.mockResolvedValue([
      { key: 'biometric_gate_enabled', value: 'true' },
    ]);
    (Keychain.setGenericPassword as jest.Mock).mockImplementation(
      (_username: string, _password: string, options: { service: string }) =>
        options.service === BIOMETRIC_SERVICE
          ? Promise.reject(new Error('keystore fail'))
          : Promise.resolve(true),
    );
    await renderProvider();
    await waitFor(() => expect(ctx.state.biometric.isLocked).toBe(true));
    await confirmScreenLock();
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
        effectiveDate: '2026-01-01',
        confirmedAt: '2026-01-01T00:00:00.000Z',
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
      date: '2026-02-01',
    };
    mockDb.createTransaction.mockResolvedValue(reRated);

    await act(async () => {
      await ctx.actions.createTransaction(reRated);
    });

    expect(
      ctx.selectors.fundBalances.find(item => item.fundId === 1)?.byCurrency,
    ).toEqual([{ currencyCode: 'EUR', balance: 90 }]);
  });

  it('leaves a fund alone when a rate for an earlier day is saved', async () => {
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
        effectiveDate: '2026-01-01',
        confirmedAt: '2026-01-01T00:00:00.000Z',
      },
    ]);
    await renderProvider();

    const backfilled = {
      ...transaction,
      id: 99,
      amountNative: 0,
      currencyCode: 'EUR',
      fxRateToBase: 1.2,
      baseAmount: 0,
      fundId: 1,
      date: '2025-06-01',
      updatedAt: '2026-08-20T00:00:00.000Z',
    };
    mockDb.createTransaction.mockResolvedValue(backfilled);

    await act(async () => {
      await ctx.actions.createTransaction(backfilled);
    });

    expect(ctx.state.fxRateSeries).toHaveLength(2);
    expect(ctx.selectors.currentFxRates).toEqual([
      expect.objectContaining({ fxRateToBase: 1.08 }),
    ]);
    expect(
      ctx.selectors.fundBalances.find(item => item.fundId === 1)?.byCurrency,
    ).toEqual([{ currencyCode: 'EUR', balance: 100 }]);
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
    ctx.state.fxRateSeries.map(item => [item.currencyCode, item.fxRateToBase]);

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
      crossCurrencyTransfer.date,
      crossCurrencyTransfer.updatedAt,
    );
    expect(mockDb.upsertCurrencyFxRate).toHaveBeenNthCalledWith(
      2,
      {},
      'MYR',
      'JPY',
      500 / 17000,
      crossCurrencyTransfer.date,
      crossCurrencyTransfer.updatedAt,
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
    expect(
      ctx.state.fxRateSeries.map(item => [
        item.effectiveDate,
        item.confirmedAt,
      ]),
    ).toEqual([
      [crossCurrencyTransfer.date, crossCurrencyTransfer.updatedAt],
      [crossCurrencyTransfer.date, crossCurrencyTransfer.updatedAt],
    ]);
  });

  it('touches no rate when a transaction is deleted', async () => {
    mockDb.listTransactions.mockResolvedValue([crossCurrencyTransfer]);
    await renderProvider();

    await act(async () => {
      await ctx.actions.deleteTransaction(crossCurrencyTransfer.id);
    });

    expect(mockDb.upsertCurrencyFxRate).not.toHaveBeenCalled();
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
    expect(mockDb.upsertCurrencyFxRate).toHaveBeenNthCalledWith(
      2,
      {},
      'MYR',
      'JPY',
      500 / 16000,
      crossCurrencyTransfer.date,
      crossCurrencyTransfer.updatedAt,
    );
    expect(cachedRates()).toEqual([
      ['EUR', 5],
      ['JPY', 500 / 16000],
    ]);
    expect(ctx.state.fxRateSeries.map(item => item.confirmedAt)).toEqual([
      crossCurrencyTransfer.updatedAt,
      crossCurrencyTransfer.updatedAt,
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
      crossCurrencyTransfer.date,
      crossCurrencyTransfer.updatedAt,
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
    expect(ctx.state.fxRateSeries).toEqual([]);
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
