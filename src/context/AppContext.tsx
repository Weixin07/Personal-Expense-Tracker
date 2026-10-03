import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useLayoutEffect,
  useMemo,
  useReducer,
  useState,
} from 'react';
import { StyleSheet } from 'react-native';
import { ActivityIndicator, Portal, Surface } from 'react-native-paper';
import type { UploadPendingExportsResult } from '../export';
import { commitImport } from '../import';
import type {
  CommitImportOptions,
  ImportPreview,
  ImportSummary,
} from '../import';
import { requestDirectorySelection } from '../security/storageAccess';
import {
  withDatabase,
  listTransactions as dbListTransactions,
  createTransaction as dbCreateTransaction,
  updateTransaction as dbUpdateTransaction,
  deleteTransaction as dbDeleteTransaction,
  setTransactionConfirmed as dbSetTransactionConfirmed,
  listCategories as dbListCategories,
  createCategory as dbCreateCategory,
  updateCategory as dbUpdateCategory,
  deleteCategory as dbDeleteCategory,
  listFunds as dbListFunds,
  createFund as dbCreateFund,
  updateFund as dbUpdateFund,
  deleteFund as dbDeleteFund,
  getAllSettings as dbGetAllSettings,
  setSetting as dbSetSetting,
  listExportQueue as dbListExportQueue,
  listCurrencyFxRates as dbListCurrencyFxRates,
  upsertCurrencyFxRate as dbUpsertCurrencyFxRate,
} from '../database';
import type {
  TransactionRecord,
  CategoryRecord,
  FundRecord,
  NewTransactionRecord,
  UpdateTransactionRecord,
  NewCategoryRecord,
  UpdateCategoryRecord,
  NewFundRecord,
  UpdateFundRecord,
  AppSettingRecord,
  ExportQueueRecord,
  CurrencyFxRateRecord,
} from '../database';
import { bankersRound } from '../utils/math';
import { resolveTransferCurrency } from '../utils/funds';
import { calculateFundBalances } from '../utils/fundBalances';
import type { FundBalance } from '../utils/fundBalances';
import {
  currentFxRates as currentFxRatesOf,
  isSuspectTransferRate,
  ratesForTransaction,
} from '../utils/fxRates';
import { buildCategoryUsageCounts } from '../utils/suggestions';
import type { CategoryUsageCounts } from '../utils/suggestions';
import { toError, toErrorMessage } from '../utils/errors';
import { applyFilters } from '../utils/transactionFilters';
import type { TransactionFilters } from '../utils/transactionFilters';
import {
  useBiometricGate,
  useExportSync,
  biometricCredentialExists,
  appLockMarkerExists,
  writeAppLockMarker,
  clearAppLockMarker,
  syncAppLockMarker,
} from '../hooks';
import type { BiometricGateState, ExportQueueItem } from '../hooks';
import { BiometricGateModal } from '../components/BiometricGateModal';
import FocusBlockView from '../security/FocusBlockViewNativeComponent';
import {
  autoLockMinutesFromToken,
  autoLockMinutesToToken,
  DEFAULT_AUTO_LOCK_MINUTES,
} from '../constants/autoLockPresets';
import { pinCredentialExists } from '../security/pinCredential';
import { AppLockError, UNLOCK_FIRST_MESSAGE } from '../security/appLockError';
import {
  createActionLockGuard,
  TRANSACTION_ACTION_LOCK_POLICY,
} from '../security/actionLockPolicy';
import {
  openScreenLockSettings,
  type DeviceCredentialOutcome,
} from '../security/deviceSecurity';
import {
  gatePresentation as deriveGatePresentation,
  type GatePresentation,
} from '../security/gatePresentation';

export type { ExportQueueItem } from '../hooks';
export type {
  FundBalance,
  FundBalanceBasis,
  FundBalanceFigure,
} from '../utils/fundBalances';
export type { TransactionFilters } from '../utils/transactionFilters';

export type TransactionDataSettings = {
  baseCurrency: string | null;
  biometricGateEnabled: boolean;
  biometricCredentialVersion: number;
  /** Minutes of background idle before the gate locks; `null` is Never. */
  autoLockMinutes: number | null;
  driveFolderId: string | null;
  exportDirectoryUri: string | null;
};

type CoreState = {
  transactions: TransactionRecord[];
  categories: CategoryRecord[];
  funds: FundRecord[];
  settings: TransactionDataSettings;
  /**
   * Every dated rate held. A consumer wanting the rate to prefill or convert
   * at reads `currentFxRates` instead.
   */
  fxRateSeries: CurrencyFxRateRecord[];
  filters: TransactionFilters;
  isInitialised: boolean;
  isLoading: boolean;
  error: string | null;
};

export type TransactionDataState = CoreState & {
  exportQueue: ExportQueueItem[];
  biometric: BiometricGateState;
  gatePresentation: GatePresentation;
  /**
   * The session has authenticated but the gate holds no usable PIN, so one is
   * offered; `gatePresentation` is `'enrol'`.
   */
  pinSetupRequired: boolean;
};

export type TotalsFigure = {
  /**
   * Unrounded, so a caller combining figures does not compound rounding.
   * `total` is the display value.
   */
  rawTotal: number;
  total: number;
  /**
   * Rows contributing to this figure. Distinguishes "nothing here" from "rows
   * that happen to sum to zero", which a total alone cannot.
   */
  count: number;
};

export type TotalsByBaseCurrency = {
  baseCurrencyCode: string | null;
  expense: TotalsFigure;
  income: TotalsFigure;
  /** Income minus expense: positive is a surplus. */
  net: TotalsFigure;
};

/**
 * Every figure is scoped to a base currency, which is the only scope in which
 * summing is meaningful — amounts captured against different base currencies
 * cannot be added together.
 */
export type TransactionTotals = TotalsByBaseCurrency[];

export type TransactionDataSelectors = {
  filteredTransactions: TransactionRecord[];
  totals: TransactionTotals;
  fundBalances: FundBalance[];
  /** One rate per pair, under the rule on `currentFxRates`. */
  currentFxRates: CurrencyFxRateRecord[];
  /**
   * Transfers whose recorded amounts imply a rate their currencies contradict.
   * Spans the whole history rather than the filtered view, for the same reason
   * `fundBalances` does: a count that moved with the date filter would describe
   * a period rather than the state of the ledger.
   */
  suspectTransferIds: ReadonlySet<number>;
  /**
   * Rows the user has not confirmed. Spans the whole history rather than the
   * filtered view, for the same reason `suspectTransferIds` does.
   */
  unconfirmedIds: ReadonlySet<number>;
  hasActiveFilters: boolean;
  /**
   * Counted over the whole history rather than the filtered view: a picker
   * whose order depended on the filter it sets would reorder itself between
   * one opening and the next.
   */
  categoryUsageCounts: CategoryUsageCounts;
};

/**
 * While the app is locked, actions marked `guarded` in
 * `TRANSACTION_ACTION_LOCK_POLICY` reject under the rule on `AppLockErrorKind`,
 * `uploadQueuedExports` rejects only when interactive, the synchronous filter
 * and error actions are ignored, and the unlock paths run as normal.
 */
export type TransactionDataActions = {
  refresh: () => Promise<void>;
  createTransaction: (
    payload: NewTransactionRecord,
  ) => Promise<TransactionRecord>;
  updateTransaction: (
    payload: UpdateTransactionRecord,
  ) => Promise<TransactionRecord>;
  deleteTransaction: (id: number) => Promise<void>;
  /**
   * Takes the value rather than toggling, so a repeated call lands the same
   * state.
   */
  setTransactionConfirmed: (id: number, isConfirmed: boolean) => Promise<void>;
  createCategory: (payload: NewCategoryRecord) => Promise<CategoryRecord>;
  updateCategory: (payload: UpdateCategoryRecord) => Promise<CategoryRecord>;
  deleteCategory: (id: number) => Promise<void>;
  createFund: (payload: NewFundRecord) => Promise<FundRecord>;
  updateFund: (payload: UpdateFundRecord) => Promise<FundRecord>;
  /** Rejected by the database while any transaction still references the fund. */
  deleteFund: (id: number) => Promise<void>;
  setBaseCurrency: (currencyCode: string | null) => Promise<void>;
  /**
   * @throws AppLockError of kind `pin-required` when enabling with no usable
   * PIN. The gate has no unlock path without one, so the caller must set a PIN
   * first.
   */
  setBiometricGateEnabled: (enabled: boolean) => Promise<void>;
  setAutoLockMinutes: (minutes: number | null) => Promise<void>;
  setDriveFolderId: (folderId: string | null) => Promise<void>;
  setExportDirectoryUri: (directoryUri: string | null) => Promise<void>;
  setFilters: (filters: TransactionFilters) => void;
  clearFilters: () => void;
  clearError: () => void;
  queueExport: () => Promise<void>;
  retryExport: (id: string) => Promise<void>;
  removeExport: (id: string) => Promise<void>;
  clearCompletedExports: () => Promise<void>;
  uploadQueuedExports: (options?: {
    interactive?: boolean;
  }) => Promise<UploadPendingExportsResult | null>;
  /**
   * `acceptedRates` is keyed by `fxPairKey` and `options` carries the review
   * step's choices, both matching `commitImport`.
   */
  importTransactions: (
    preview: ImportPreview,
    acceptedRates?: Record<string, number>,
    options?: CommitImportOptions,
  ) => Promise<ImportSummary>;
  unlockWithBiometrics: () => Promise<boolean>;
  unlockWithPin: (pin: string) => Promise<boolean>;
  /**
   * Enrolment. Rejects a PIN failing `validatePin`.
   *
   * @throws AppLockError of kind `not-authenticated` before settings load, or
   * while the gate is on and the session has not authenticated.
   */
  setAppPin: (pin: string) => Promise<void>;
  /**
   * Rotation. Verifies `currentPin` under the same throttle the unlock modal
   * uses, so this cannot become an unthrottled guessing oracle.
   */
  changeAppPin: (currentPin: string, nextPin: string) => Promise<boolean>;
  /**
   * Turns the gate off once `currentPin` verifies, throttled under the rule on
   * `changeAppPin`. Resolves `false` when the PIN is refused.
   */
  turnOffAppLock: (currentPin: string) => Promise<boolean>;
  appPinUsable: () => Promise<boolean>;
  /**
   * Sets the PIN an existing gate-on install was missing, unlocks through it,
   * then records the upgrade.
   *
   * @throws AppLockError of kind `not-authenticated` before the session has
   * authenticated.
   */
  completePinSetup: (pin: string) => Promise<void>;
  /**
   * Turns the gate off, because it has no unlock path without a PIN.
   *
   * @throws AppLockError of kind `not-authenticated` before the session has
   * authenticated.
   */
  declinePinSetup: () => Promise<void>;
  unlockWithDeviceCredential: () => Promise<DeviceCredentialOutcome>;
  openScreenLockSettings: () => Promise<void>;
  refreshLockAvailability: () => Promise<void>;
};

export type TransactionDataContextValue = {
  state: TransactionDataState;
  actions: TransactionDataActions;
  selectors: TransactionDataSelectors;
};

export type TransactionDataAction =
  | { type: 'load/start' }
  | {
      type: 'load/success';
      payload: {
        transactions: TransactionRecord[];
        categories: CategoryRecord[];
        funds: FundRecord[];
        settings: TransactionDataSettings;
        fxRateSeries: CurrencyFxRateRecord[];
      };
    }
  | {
      type: 'load/error';
      payload: { error: string; biometricGateEnabled: boolean };
    }
  | { type: 'operation/start' }
  | { type: 'operation/end' }
  | { type: 'operation/error'; payload: string }
  | { type: 'error/clear' }
  | { type: 'filters/set'; payload: TransactionFilters }
  | { type: 'filters/clear' }
  | { type: 'transactions/set-all'; payload: TransactionRecord[] }
  | { type: 'transaction/add'; payload: TransactionRecord }
  | { type: 'transaction/update'; payload: TransactionRecord }
  | { type: 'transaction/delete'; payload: number }
  | { type: 'categories/set-all'; payload: CategoryRecord[] }
  | { type: 'funds/set-all'; payload: FundRecord[] }
  | { type: 'fx-series/upsert'; payload: CurrencyFxRateRecord }
  | { type: 'settings/set-base-currency'; payload: string | null }
  | { type: 'settings/set-biometric'; payload: boolean }
  | { type: 'settings/set-cred-version'; payload: number }
  | { type: 'settings/set-auto-lock'; payload: number | null }
  | { type: 'settings/set-drive-folder'; payload: string | null }
  | { type: 'settings/set-export-directory'; payload: string | null };

const BASE_CURRENCY_KEY = 'base_currency';
const BIOMETRIC_GATE_KEY = 'biometric_gate_enabled';
const BIOMETRIC_CRED_VERSION_KEY = 'biometric_cred_version';
const AUTO_LOCK_MINUTES_KEY = 'auto_lock_minutes';
const APP_PIN_VERSION_KEY = 'app_pin_version';
const DRIVE_FOLDER_ID_KEY = 'drive_folder_id';
const EXPORT_DIRECTORY_URI_KEY = 'export_directory_uri';

const BIOMETRIC_CRED_VERSION = 2;

const styles = StyleSheet.create({
  app: { flex: 1 },
  loading: { flex: 1, alignItems: 'center', justifyContent: 'center' },
});

/**
 * Marks an install as having been offered a PIN. Nothing reads it to decide
 * whether to prompt — the gate being switched off on a decline is what stops
 * the re-prompt — so it exists only for a later upgrade to key off.
 */
const APP_PIN_VERSION = 1;

export const initialState: CoreState = {
  transactions: [],
  categories: [],
  funds: [],
  settings: {
    baseCurrency: null,
    biometricGateEnabled: false,
    biometricCredentialVersion: 0,
    autoLockMinutes: DEFAULT_AUTO_LOCK_MINUTES,
    driveFolderId: null,
    exportDirectoryUri: null,
  },
  fxRateSeries: [],
  filters: {},
  isInitialised: false,
  isLoading: false,
  error: null,
};

const TransactionDataContext = createContext<
  TransactionDataContextValue | undefined
>(undefined);

const parseSettings = (
  records: AppSettingRecord[],
): TransactionDataSettings => {
  const baseCurrency =
    records.find(setting => setting.key === BASE_CURRENCY_KEY)?.value ?? null;
  const biometricGateSetting = records.find(
    setting => setting.key === BIOMETRIC_GATE_KEY,
  )?.value;
  const driveFolderId =
    records.find(setting => setting.key === DRIVE_FOLDER_ID_KEY)?.value ?? null;
  const exportDirectoryUri =
    records.find(setting => setting.key === EXPORT_DIRECTORY_URI_KEY)?.value ??
    null;
  const biometricGateEnabled = biometricGateSetting === 'true';
  const biometricCredentialVersion =
    Number.parseInt(
      records.find(setting => setting.key === BIOMETRIC_CRED_VERSION_KEY)
        ?.value ?? '',
      10,
    ) || 0;
  const autoLockMinutes = autoLockMinutesFromToken(
    records.find(setting => setting.key === AUTO_LOCK_MINUTES_KEY)?.value ??
      null,
  );
  return {
    baseCurrency,
    biometricGateEnabled,
    biometricCredentialVersion,
    autoLockMinutes,
    driveFolderId,
    exportDirectoryUri,
  };
};

const normalizeFilters = (
  current: TransactionFilters,
  update: TransactionFilters,
): TransactionFilters => {
  const next: TransactionFilters = { ...current, ...update };

  if (
    Object.prototype.hasOwnProperty.call(update, 'type') &&
    update.type === undefined
  ) {
    delete next.type;
  }
  if (
    Object.prototype.hasOwnProperty.call(update, 'categoryId') &&
    update.categoryId === undefined
  ) {
    delete next.categoryId;
  }
  if (
    Object.prototype.hasOwnProperty.call(update, 'fundId') &&
    update.fundId === undefined
  ) {
    delete next.fundId;
  }
  if (
    Object.prototype.hasOwnProperty.call(update, 'needsAttention') &&
    update.needsAttention === undefined
  ) {
    delete next.needsAttention;
  }
  if (
    Object.prototype.hasOwnProperty.call(update, 'startDate') &&
    update.startDate === undefined
  ) {
    delete next.startDate;
  }
  if (
    Object.prototype.hasOwnProperty.call(update, 'endDate') &&
    update.endDate === undefined
  ) {
    delete next.endDate;
  }
  if (Object.prototype.hasOwnProperty.call(update, 'query')) {
    const trimmed = next.query?.trim() ?? '';
    if (trimmed) {
      next.query = trimmed;
    } else {
      delete next.query;
    }
  }

  return next;
};

export const transactionDataReducer = (
  state: CoreState,
  action: TransactionDataAction,
): CoreState => {
  switch (action.type) {
    case 'load/start':
      return {
        ...state,
        isLoading: true,
        error: null,
      };
    case 'load/success':
      return {
        ...state,
        transactions: action.payload.transactions,
        categories: action.payload.categories,
        funds: action.payload.funds,
        settings: action.payload.settings,
        fxRateSeries: action.payload.fxRateSeries,
        isInitialised: true,
        isLoading: false,
        error: null,
      };
    case 'load/error':
      return {
        ...state,
        settings: {
          ...state.settings,
          biometricGateEnabled: action.payload.biometricGateEnabled,
        },
        isInitialised: true,
        isLoading: false,
        error: action.payload.error,
      };
    case 'operation/start':
      return {
        ...state,
        isLoading: true,
        error: null,
      };
    case 'operation/end':
      return {
        ...state,
        isLoading: false,
      };
    case 'operation/error':
      return {
        ...state,
        isLoading: false,
        error: action.payload,
      };
    case 'error/clear':
      return {
        ...state,
        error: null,
      };
    case 'filters/set':
      return {
        ...state,
        filters: normalizeFilters(state.filters, action.payload),
      };
    case 'filters/clear':
      return {
        ...state,
        filters: {},
      };
    case 'transactions/set-all':
      return {
        ...state,
        transactions: action.payload,
      };
    case 'transaction/add':
      return {
        ...state,
        transactions: [action.payload, ...state.transactions],
      };
    case 'transaction/update':
      return {
        ...state,
        transactions: state.transactions.map(transaction =>
          transaction.id === action.payload.id ? action.payload : transaction,
        ),
      };
    case 'transaction/delete':
      return {
        ...state,
        transactions: state.transactions.filter(
          transaction => transaction.id !== action.payload,
        ),
      };
    case 'categories/set-all':
      return {
        ...state,
        categories: action.payload,
      };
    case 'funds/set-all':
      return {
        ...state,
        funds: action.payload,
      };
    // Keyed like the table's primary key, so memory and disk agree on which
    // write replaces which.
    case 'fx-series/upsert': {
      const next = state.fxRateSeries.filter(
        rate =>
          !(
            rate.baseCurrencyCode === action.payload.baseCurrencyCode &&
            rate.currencyCode === action.payload.currencyCode &&
            rate.effectiveDate === action.payload.effectiveDate
          ),
      );
      next.push(action.payload);
      return {
        ...state,
        fxRateSeries: next,
      };
    }
    case 'settings/set-base-currency':
      return {
        ...state,
        settings: {
          ...state.settings,
          baseCurrency: action.payload,
        },
      };
    case 'settings/set-biometric':
      return {
        ...state,
        settings: {
          ...state.settings,
          biometricGateEnabled: action.payload,
        },
      };
    case 'settings/set-cred-version':
      return {
        ...state,
        settings: {
          ...state.settings,
          biometricCredentialVersion: action.payload,
        },
      };
    case 'settings/set-auto-lock':
      return {
        ...state,
        settings: {
          ...state.settings,
          autoLockMinutes: action.payload,
        },
      };
    case 'settings/set-drive-folder':
      return {
        ...state,
        settings: {
          ...state.settings,
          driveFolderId: action.payload,
        },
      };
    case 'settings/set-export-directory':
      return {
        ...state,
        settings: {
          ...state.settings,
          exportDirectoryUri: action.payload,
        },
      };
    default:
      return state;
  }
};

const toFigure = (rawTotal: number, count: number): TotalsFigure => ({
  rawTotal,
  total: bankersRound(rawTotal, 2),
  count,
});

type DirectionAccumulator = {
  expenseRaw: number;
  expenseCount: number;
  incomeRaw: number;
  incomeCount: number;
};

const calculateTotals = (
  transactions: TransactionRecord[],
): TransactionTotals => {
  const perBaseCurrency = new Map<string | null, DirectionAccumulator>();

  transactions.forEach(transaction => {
    // A transfer moves money between the user's own funds. Counting it either
    // way would report spending or income that never happened.
    if (transaction.type === 'transfer') {
      return;
    }
    const baseKey = transaction.baseCurrencyCode ?? null;
    const accumulator = perBaseCurrency.get(baseKey) ?? {
      expenseRaw: 0,
      expenseCount: 0,
      incomeRaw: 0,
      incomeCount: 0,
    };
    if (transaction.type === 'income') {
      accumulator.incomeRaw += transaction.baseAmount;
      accumulator.incomeCount += 1;
    } else {
      accumulator.expenseRaw += transaction.baseAmount;
      accumulator.expenseCount += 1;
    }
    perBaseCurrency.set(baseKey, accumulator);
  });

  return Array.from(perBaseCurrency.entries()).map(
    ([baseCurrencyCode, accumulator]) => ({
      baseCurrencyCode,
      expense: toFigure(accumulator.expenseRaw, accumulator.expenseCount),
      income: toFigure(accumulator.incomeRaw, accumulator.incomeCount),
      net: toFigure(
        accumulator.incomeRaw - accumulator.expenseRaw,
        accumulator.expenseCount + accumulator.incomeCount,
      ),
    }),
  );
};

/**
 * Transfers whose two amounts imply a rate their two currencies contradict,
 * under the rule on `TransactionRecord.counterpartAmount`.
 *
 * The destination currency is resolved by `resolveTransferCurrency`, because a
 * row stored before that column was required carries none. A transfer is judged
 * on what it records, never on what the fund holds now.
 */
const calculateSuspectTransferIds = (
  transactions: readonly TransactionRecord[],
  funds: readonly FundRecord[],
  baseCurrency: string | null,
): ReadonlySet<number> => {
  const fundsById = new Map<number, FundRecord>();
  funds.forEach(fund => {
    fundsById.set(fund.id, fund);
  });

  const suspect = new Set<number>();
  transactions.forEach(transaction => {
    if (transaction.type !== 'transfer') {
      return;
    }
    const destination =
      transaction.counterpartFundId != null
        ? (fundsById.get(transaction.counterpartFundId) ?? null)
        : null;
    if (
      isSuspectTransferRate({
        amountNative: transaction.amountNative,
        counterpartAmount: transaction.counterpartAmount,
        currencyCode: transaction.currencyCode,
        counterpartCurrencyCode: resolveTransferCurrency(
          transaction.counterpartCurrencyCode,
          destination,
          baseCurrency,
          transaction.currencyCode,
        ),
      })
    ) {
      suspect.add(transaction.id);
    }
  });

  return suspect;
};

const hasActiveFilters = (filters: TransactionFilters): boolean => {
  if (filters.type !== undefined) {
    return true;
  }
  if (Object.prototype.hasOwnProperty.call(filters, 'categoryId')) {
    return true;
  }
  if (filters.fundId !== undefined) {
    return true;
  }
  if (filters.needsAttention !== undefined) {
    return true;
  }
  if (filters.startDate || filters.endDate) {
    return true;
  }
  if (filters.query !== undefined) {
    return true;
  }
  return false;
};

export const TransactionDataProvider: React.FC<React.PropsWithChildren> = ({
  children,
}) => {
  const [state, dispatch] = useReducer(transactionDataReducer, initialState);
  const [loadedQueueRecords, setLoadedQueueRecords] = useState<
    readonly ExportQueueRecord[]
  >([]);

  const loadFromDatabase = useCallback(async () => {
    dispatch({ type: 'load/start' });
    try {
      const snapshot = await withDatabase(async db => {
        const [
          transactions,
          categories,
          funds,
          settings,
          exportQueueRecords,
          fxRateSeries,
        ] = await Promise.all([
          dbListTransactions(db),
          dbListCategories(db),
          dbListFunds(db),
          dbGetAllSettings(db),
          dbListExportQueue(db),
          dbListCurrencyFxRates(db),
        ]);
        return {
          transactions,
          categories,
          funds,
          settings,
          exportQueueRecords,
          fxRateSeries,
        };
      });

      const settings = parseSettings(snapshot.settings);
      dispatch({
        type: 'load/success',
        payload: {
          transactions: snapshot.transactions,
          categories: snapshot.categories,
          funds: snapshot.funds,
          settings,
          fxRateSeries: snapshot.fxRateSeries,
        },
      });
      setLoadedQueueRecords(snapshot.exportQueueRecords);
      // Only from settings read here, never from the `load/error` value, which
      // is itself derived from the marker.
      void syncAppLockMarker(settings.biometricGateEnabled);
    } catch (error) {
      // The keychain decides here because it outlives a database that will
      // not open. Any of the three entries means the lock was on: a device with
      // no passcode can hold a PIN but no biometric entry, and an install
      // upgraded from before the PIN may hold neither, only the marker.
      let biometricGateEnabled: boolean;
      try {
        const [hasBiometric, hasPin, hasMarker] = await Promise.all([
          biometricCredentialExists(),
          pinCredentialExists(),
          appLockMarkerExists(),
        ]);
        biometricGateEnabled = hasBiometric || hasPin || hasMarker;
        if (!hasMarker && (hasBiometric || hasPin)) {
          void writeAppLockMarker();
        }
      } catch {
        biometricGateEnabled = true;
      }
      dispatch({
        type: 'load/error',
        payload: { error: toErrorMessage(error), biometricGateEnabled },
      });
    }
  }, []);

  useEffect(() => {
    void loadFromDatabase();
  }, [loadFromDatabase]);

  const {
    isLocked: biometricIsLocked,
    lastError: biometricLastError,
    lockout: biometricLockout,
    unlockWithBiometrics,
    unlockWithPin,
    setAppPin: writeAppPin,
    changeAppPin,
    confirmAppPin,
    appPinUsable,
    biometricsAvailable,
    pinUsable,
    pinStored,
    secureLockScreen,
    sessionAuthenticated,
    unlockWithDeviceCredential,
    refreshAvailability: refreshLockAvailability,
    backgroundNonce: biometricBackgroundNonce,
    clearError: clearBiometricError,
    ensureCredential: ensureBiometricCredential,
    clearCredential: clearBiometricCredential,
    clearPin: clearAppPin,
    applyEnabledState: applyBiometricEnabledState,
  } = useBiometricGate({
    enabled: state.settings.biometricGateEnabled,
    isInitialised: state.isInitialised,
    autoLockMinutes: state.settings.autoLockMinutes,
  });

  const [lockGuard] = useState(createActionLockGuard);
  useLayoutEffect(() => {
    lockGuard.setLocked(biometricIsLocked);
  }, [lockGuard, biometricIsLocked]);

  useEffect(() => {
    if (state.error !== null) {
      return;
    }
    if (!state.isInitialised || !state.settings.biometricGateEnabled) {
      return;
    }
    if (state.settings.biometricCredentialVersion >= BIOMETRIC_CRED_VERSION) {
      return;
    }
    void (async () => {
      try {
        await ensureBiometricCredential();
        await withDatabase(db =>
          dbSetSetting(
            db,
            BIOMETRIC_CRED_VERSION_KEY,
            String(BIOMETRIC_CRED_VERSION),
          ),
        );
        dispatch({
          type: 'settings/set-cred-version',
          payload: BIOMETRIC_CRED_VERSION,
        });
      } catch {
        // Leave the version unbumped so the upgrade retries on the next launch.
      }
    })();
  }, [
    state.error,
    state.isInitialised,
    state.settings.biometricGateEnabled,
    state.settings.biometricCredentialVersion,
    ensureBiometricCredential,
  ]);

  const gatePresentation = deriveGatePresentation({
    isInitialised: state.isInitialised,
    hasError: state.error !== null,
    gateEnabled: state.settings.biometricGateEnabled,
    isLocked: biometricIsLocked,
    sessionAuthenticated,
    pinUsable,
    pinStored,
    biometricsAvailable,
    secureLockScreen,
  });
  const pinSetupRequired = gatePresentation === 'enrol';

  const createTransaction = useCallback<
    TransactionDataActions['createTransaction']
  >(async payload => {
    dispatch({ type: 'operation/start' });
    try {
      const { transaction, rates } = await withDatabase(async db => {
        const created = await dbCreateTransaction(db, payload);
        const derived = ratesForTransaction(created);
        for (const rate of derived) {
          await dbUpsertCurrencyFxRate(
            db,
            rate.baseCurrencyCode,
            rate.currencyCode,
            rate.fxRateToBase,
            rate.effectiveDate,
            created.updatedAt,
          );
        }
        return { transaction: created, rates: derived };
      });
      dispatch({ type: 'transaction/add', payload: transaction });
      rates.forEach(rate => {
        dispatch({
          type: 'fx-series/upsert',
          payload: { ...rate, confirmedAt: transaction.updatedAt },
        });
      });
      return transaction;
    } catch (error) {
      dispatch({ type: 'operation/error', payload: toErrorMessage(error) });
      throw toError(error);
    } finally {
      dispatch({ type: 'operation/end' });
    }
  }, []);

  const updateTransaction = useCallback<
    TransactionDataActions['updateTransaction']
  >(async payload => {
    dispatch({ type: 'operation/start' });
    try {
      const { transaction, rates } = await withDatabase(async db => {
        const updated = await dbUpdateTransaction(db, payload);
        const derived = ratesForTransaction(updated);
        for (const rate of derived) {
          await dbUpsertCurrencyFxRate(
            db,
            rate.baseCurrencyCode,
            rate.currencyCode,
            rate.fxRateToBase,
            rate.effectiveDate,
            updated.updatedAt,
          );
        }
        return { transaction: updated, rates: derived };
      });
      dispatch({ type: 'transaction/update', payload: transaction });
      rates.forEach(rate => {
        dispatch({
          type: 'fx-series/upsert',
          payload: { ...rate, confirmedAt: transaction.updatedAt },
        });
      });
      return transaction;
    } catch (error) {
      dispatch({ type: 'operation/error', payload: toErrorMessage(error) });
      throw toError(error);
    } finally {
      dispatch({ type: 'operation/end' });
    }
  }, []);

  const deleteTransaction = useCallback<
    TransactionDataActions['deleteTransaction']
  >(async id => {
    dispatch({ type: 'operation/start' });
    try {
      await withDatabase(db => dbDeleteTransaction(db, id));
      dispatch({ type: 'transaction/delete', payload: id });
    } catch (error) {
      dispatch({ type: 'operation/error', payload: toErrorMessage(error) });
      throw toError(error);
    } finally {
      dispatch({ type: 'operation/end' });
    }
  }, []);

  const setTransactionConfirmed = useCallback<
    TransactionDataActions['setTransactionConfirmed']
  >(async (id, isConfirmed) => {
    dispatch({ type: 'operation/start' });
    try {
      // No rate is derived here, unlike the create and update paths: no amount,
      // currency or rate moved, and seeding one would put a rate nobody
      // observed into the cache the form prefills from.
      const transaction = await withDatabase(db =>
        dbSetTransactionConfirmed(db, id, isConfirmed),
      );
      dispatch({ type: 'transaction/update', payload: transaction });
    } catch (error) {
      dispatch({ type: 'operation/error', payload: toErrorMessage(error) });
      throw toError(error);
    } finally {
      dispatch({ type: 'operation/end' });
    }
  }, []);

  const createCategory = useCallback<TransactionDataActions['createCategory']>(
    async payload => {
      dispatch({ type: 'operation/start' });
      try {
        const { category, categories } = await withDatabase(async db => {
          const created = await dbCreateCategory(db, payload);
          const all = await dbListCategories(db);
          return { category: created, categories: all };
        });
        dispatch({ type: 'categories/set-all', payload: categories });
        return category;
      } catch (error) {
        dispatch({ type: 'operation/error', payload: toErrorMessage(error) });
        throw toError(error);
      } finally {
        dispatch({ type: 'operation/end' });
      }
    },
    [],
  );

  const updateCategory = useCallback<TransactionDataActions['updateCategory']>(
    async payload => {
      dispatch({ type: 'operation/start' });
      try {
        const { category, categories } = await withDatabase(async db => {
          const updated = await dbUpdateCategory(db, payload);
          const all = await dbListCategories(db);
          return { category: updated, categories: all };
        });
        dispatch({ type: 'categories/set-all', payload: categories });
        return category;
      } catch (error) {
        dispatch({ type: 'operation/error', payload: toErrorMessage(error) });
        throw toError(error);
      } finally {
        dispatch({ type: 'operation/end' });
      }
    },
    [],
  );

  const deleteCategory = useCallback<TransactionDataActions['deleteCategory']>(
    async id => {
      dispatch({ type: 'operation/start' });
      try {
        const { categories, transactions } = await withDatabase(async db => {
          await dbDeleteCategory(db, id);
          const [allCategories, allTransactions] = await Promise.all([
            dbListCategories(db),
            dbListTransactions(db),
          ]);
          return { categories: allCategories, transactions: allTransactions };
        });
        dispatch({ type: 'categories/set-all', payload: categories });
        dispatch({ type: 'transactions/set-all', payload: transactions });
      } catch (error) {
        dispatch({ type: 'operation/error', payload: toErrorMessage(error) });
        throw toError(error);
      } finally {
        dispatch({ type: 'operation/end' });
      }
    },
    [],
  );

  const createFund = useCallback<TransactionDataActions['createFund']>(
    async payload => {
      dispatch({ type: 'operation/start' });
      try {
        const { fund, funds } = await withDatabase(async db => {
          const created = await dbCreateFund(db, payload);
          const all = await dbListFunds(db);
          return { fund: created, funds: all };
        });
        dispatch({ type: 'funds/set-all', payload: funds });
        return fund;
      } catch (error) {
        dispatch({ type: 'operation/error', payload: toErrorMessage(error) });
        throw toError(error);
      } finally {
        dispatch({ type: 'operation/end' });
      }
    },
    [],
  );

  const updateFund = useCallback<TransactionDataActions['updateFund']>(
    async payload => {
      dispatch({ type: 'operation/start' });
      try {
        const { fund, funds } = await withDatabase(async db => {
          const updated = await dbUpdateFund(db, payload);
          const all = await dbListFunds(db);
          return { fund: updated, funds: all };
        });
        dispatch({ type: 'funds/set-all', payload: funds });
        return fund;
      } catch (error) {
        dispatch({ type: 'operation/error', payload: toErrorMessage(error) });
        throw toError(error);
      } finally {
        dispatch({ type: 'operation/end' });
      }
    },
    [],
  );

  const deleteFund = useCallback<TransactionDataActions['deleteFund']>(
    async id => {
      dispatch({ type: 'operation/start' });
      try {
        const funds = await withDatabase(async db => {
          await dbDeleteFund(db, id);
          return dbListFunds(db);
        });
        dispatch({ type: 'funds/set-all', payload: funds });
      } catch (error) {
        dispatch({ type: 'operation/error', payload: toErrorMessage(error) });
        throw toError(error);
      } finally {
        dispatch({ type: 'operation/end' });
      }
    },
    [],
  );

  const setBaseCurrency = useCallback<
    TransactionDataActions['setBaseCurrency']
  >(async currencyCode => {
    dispatch({ type: 'operation/start' });
    try {
      await withDatabase(db =>
        dbSetSetting(db, BASE_CURRENCY_KEY, currencyCode),
      );
      dispatch({ type: 'settings/set-base-currency', payload: currencyCode });
    } catch (error) {
      dispatch({ type: 'operation/error', payload: toErrorMessage(error) });
      throw toError(error);
    } finally {
      dispatch({ type: 'operation/end' });
    }
  }, []);

  const setBiometricGateEnabled = useCallback<
    TransactionDataActions['setBiometricGateEnabled']
  >(
    async enabled => {
      dispatch({ type: 'operation/start' });
      try {
        if (enabled) {
          if (!(await appPinUsable())) {
            throw new AppLockError(
              'pin-required',
              'Set a PIN before turning the app lock on.',
            );
          }
          try {
            await ensureBiometricCredential();
          } catch {
            // No TEE, an unanswered device probe or another Keystore failure
            // leaves no biometric credential. The PIN verified above is a
            // complete unlock path on its own, so the gate still goes on.
          }
          await writeAppLockMarker();
        } else {
          await clearBiometricCredential();
          await clearAppPin();
          applyBiometricEnabledState(false);
        }
        await withDatabase(db =>
          dbSetSetting(db, BIOMETRIC_GATE_KEY, enabled ? 'true' : 'false'),
        );
        if (!enabled) {
          // Only once the setting is saved: until then the marker is what
          // keeps a gate with no credential left fail-closed.
          await clearAppLockMarker();
        }
        dispatch({ type: 'settings/set-biometric', payload: enabled });
        if (enabled) {
          await withDatabase(db =>
            dbSetSetting(
              db,
              BIOMETRIC_CRED_VERSION_KEY,
              String(BIOMETRIC_CRED_VERSION),
            ),
          );
          dispatch({
            type: 'settings/set-cred-version',
            payload: BIOMETRIC_CRED_VERSION,
          });
          applyBiometricEnabledState(true);
        }
      } catch (error) {
        dispatch({ type: 'operation/error', payload: toErrorMessage(error) });
        throw toError(error);
      } finally {
        dispatch({ type: 'operation/end' });
      }
    },
    [
      appPinUsable,
      applyBiometricEnabledState,
      clearAppPin,
      clearBiometricCredential,
      ensureBiometricCredential,
    ],
  );

  const turnOffAppLock = useCallback<TransactionDataActions['turnOffAppLock']>(
    async currentPin => {
      if (!(await confirmAppPin(currentPin))) {
        return false;
      }
      await setBiometricGateEnabled(false);
      return true;
    },
    [confirmAppPin, setBiometricGateEnabled],
  );

  const setAppPin = useCallback<TransactionDataActions['setAppPin']>(
    async pin => {
      if (
        !state.isInitialised ||
        (state.settings.biometricGateEnabled && !sessionAuthenticated)
      ) {
        throw new AppLockError('not-authenticated', UNLOCK_FIRST_MESSAGE);
      }
      await writeAppPin(pin);
    },
    [
      state.isInitialised,
      state.settings.biometricGateEnabled,
      sessionAuthenticated,
      writeAppPin,
    ],
  );

  const declinePinSetup = useCallback<
    TransactionDataActions['declinePinSetup']
  >(async () => {
    if (!sessionAuthenticated) {
      throw new AppLockError('not-authenticated', UNLOCK_FIRST_MESSAGE);
    }
    await setBiometricGateEnabled(false);
    await withDatabase(db =>
      dbSetSetting(db, APP_PIN_VERSION_KEY, String(APP_PIN_VERSION)),
    );
  }, [sessionAuthenticated, setBiometricGateEnabled]);

  const completePinSetup = useCallback<
    TransactionDataActions['completePinSetup']
  >(
    async pin => {
      if (!sessionAuthenticated) {
        throw new AppLockError('not-authenticated', UNLOCK_FIRST_MESSAGE);
      }
      await writeAppPin(pin);
      // Unlocking through the normal verify rather than clearing the lock
      // directly, so a Keystore write that silently failed surfaces here
      // instead of at the next launch.
      await unlockWithPin(pin);
      await withDatabase(db =>
        dbSetSetting(db, APP_PIN_VERSION_KEY, String(APP_PIN_VERSION)),
      );
    },
    [sessionAuthenticated, writeAppPin, unlockWithPin],
  );

  const setAutoLockMinutes = useCallback<
    TransactionDataActions['setAutoLockMinutes']
  >(async minutes => {
    dispatch({ type: 'operation/start' });
    try {
      await withDatabase(db =>
        dbSetSetting(
          db,
          AUTO_LOCK_MINUTES_KEY,
          autoLockMinutesToToken(minutes),
        ),
      );
      dispatch({ type: 'settings/set-auto-lock', payload: minutes });
    } catch (error) {
      dispatch({ type: 'operation/error', payload: toErrorMessage(error) });
      throw toError(error);
    } finally {
      dispatch({ type: 'operation/end' });
    }
  }, []);

  const setDriveFolderId = useCallback<
    TransactionDataActions['setDriveFolderId']
  >(async folderId => {
    dispatch({ type: 'operation/start' });
    try {
      await withDatabase(db => dbSetSetting(db, DRIVE_FOLDER_ID_KEY, folderId));
      dispatch({ type: 'settings/set-drive-folder', payload: folderId });
    } catch (error) {
      dispatch({ type: 'operation/error', payload: toErrorMessage(error) });
      throw toError(error);
    } finally {
      dispatch({ type: 'operation/end' });
    }
  }, []);

  const persistExportDirectoryUri = useCallback(
    async (directoryUri: string | null) => {
      await withDatabase(db =>
        dbSetSetting(db, EXPORT_DIRECTORY_URI_KEY, directoryUri),
      );
      dispatch({
        type: 'settings/set-export-directory',
        payload: directoryUri,
      });
    },
    [],
  );

  const setExportDirectoryUri = useCallback<
    TransactionDataActions['setExportDirectoryUri']
  >(
    async directoryUri => {
      dispatch({ type: 'operation/start' });
      try {
        await persistExportDirectoryUri(directoryUri);
      } catch (error) {
        dispatch({ type: 'operation/error', payload: toErrorMessage(error) });
        throw toError(error);
      } finally {
        dispatch({ type: 'operation/end' });
      }
    },
    [persistExportDirectoryUri],
  );

  const ensureExportDirectoryUri = useCallback(async (): Promise<string> => {
    if (state.settings.exportDirectoryUri) {
      return state.settings.exportDirectoryUri;
    }

    const selection = await requestDirectorySelection();
    if (!selection.ok) {
      if (selection.cancelled) {
        throw new Error(
          selection.message ?? 'Export directory selection was cancelled.',
        );
      }
      throw new Error(
        selection.message ?? 'Unable to obtain export directory access.',
      );
    }

    await persistExportDirectoryUri(selection.uri);
    return selection.uri;
  }, [persistExportDirectoryUri, state.settings.exportDirectoryUri]);

  const setDriveFolderIdState = useCallback((folderId: string | null) => {
    dispatch({ type: 'settings/set-drive-folder', payload: folderId });
  }, []);

  const beginOperation = useCallback(() => {
    dispatch({ type: 'operation/start' });
  }, []);

  const endOperation = useCallback(() => {
    dispatch({ type: 'operation/end' });
  }, []);

  const failOperation = useCallback((message: string) => {
    dispatch({ type: 'operation/error', payload: message });
  }, []);

  const {
    exportQueue,
    queueExport,
    retryExport,
    removeExport,
    clearCompletedExports,
    uploadQueuedExports,
  } = useExportSync({
    isInitialised: state.isInitialised,
    transactions: state.transactions,
    categories: state.categories,
    funds: state.funds,
    initialQueueRecords: loadedQueueRecords,
    ensureExportDirectoryUri,
    setDriveFolderId: setDriveFolderIdState,
    beginOperation,
    endOperation,
    failOperation,
  });

  const setFilters = useCallback<TransactionDataActions['setFilters']>(
    filters => {
      dispatch({ type: 'filters/set', payload: filters });
    },
    [],
  );

  const clearFilters = useCallback(() => {
    dispatch({ type: 'filters/clear' });
  }, []);

  const clearError = useCallback(() => {
    dispatch({ type: 'error/clear' });
    clearBiometricError();
  }, [clearBiometricError]);

  const refresh = useCallback(() => loadFromDatabase(), [loadFromDatabase]);

  const importTransactions = useCallback<
    TransactionDataActions['importTransactions']
  >(
    async (preview, acceptedRates, options) => {
      dispatch({ type: 'operation/start' });
      try {
        const summary = await commitImport(preview, acceptedRates, options);
        await loadFromDatabase();
        return summary;
      } catch (error) {
        dispatch({ type: 'operation/error', payload: toErrorMessage(error) });
        throw toError(error);
      } finally {
        dispatch({ type: 'operation/end' });
      }
    },
    [loadFromDatabase],
  );

  // Independent of `filters`, under the rule on `suspectTransferIds`, so the
  // banner counting them and the filter narrowing to them read one value.
  const suspectTransferIds = useMemo(
    () =>
      calculateSuspectTransferIds(
        state.transactions,
        state.funds,
        state.settings.baseCurrency,
      ),
    [state.transactions, state.funds, state.settings.baseCurrency],
  );

  // Independent of `filters`, under the rule on `unconfirmedIds`.
  const unconfirmedIds = useMemo(() => {
    const unconfirmed = new Set<number>();
    state.transactions.forEach(transaction => {
      if (!transaction.isConfirmed) {
        unconfirmed.add(transaction.id);
      }
    });
    return unconfirmed;
  }, [state.transactions]);

  const filteredTransactions = useMemo(
    () => applyFilters(state.transactions, state.filters, suspectTransferIds),
    [state.transactions, state.filters, suspectTransferIds],
  );

  const totals = useMemo(
    () => calculateTotals(filteredTransactions),
    [filteredTransactions],
  );

  const categoryUsageCounts = useMemo(
    () => buildCategoryUsageCounts(state.transactions),
    [state.transactions],
  );

  const currentFxRates = useMemo(
    () => currentFxRatesOf(state.fxRateSeries),
    [state.fxRateSeries],
  );

  // Independent of `filters` and `filteredTransactions`, under the rule on
  // `FundBalance`.
  const fundBalances = useMemo(
    () =>
      calculateFundBalances({
        funds: state.funds,
        transactions: state.transactions,
        baseCurrency: state.settings.baseCurrency,
        cachedRates: currentFxRates,
      }),
    [
      state.funds,
      state.transactions,
      state.settings.baseCurrency,
      currentFxRates,
    ],
  );

  const selectors = useMemo<TransactionDataSelectors>(
    () => ({
      filteredTransactions,
      totals,
      fundBalances,
      currentFxRates,
      suspectTransferIds,
      unconfirmedIds,
      hasActiveFilters: hasActiveFilters(state.filters),
      categoryUsageCounts,
    }),
    [
      filteredTransactions,
      totals,
      fundBalances,
      currentFxRates,
      suspectTransferIds,
      unconfirmedIds,
      state.filters,
      categoryUsageCounts,
    ],
  );

  const actions = useMemo<TransactionDataActions>(() => {
    const raw: TransactionDataActions = {
      refresh,
      createTransaction,
      updateTransaction,
      deleteTransaction,
      setTransactionConfirmed,
      createCategory,
      updateCategory,
      deleteCategory,
      createFund,
      updateFund,
      deleteFund,
      setBaseCurrency,
      setBiometricGateEnabled,
      setDriveFolderId,
      setExportDirectoryUri,
      setFilters,
      clearFilters,
      clearError,
      queueExport,
      retryExport,
      removeExport,
      clearCompletedExports,
      uploadQueuedExports,
      importTransactions,
      unlockWithBiometrics,
      unlockWithPin,
      setAppPin,
      changeAppPin,
      turnOffAppLock,
      appPinUsable,
      completePinSetup,
      declinePinSetup,
      unlockWithDeviceCredential,
      openScreenLockSettings,
      refreshLockAvailability,
      setAutoLockMinutes,
    };
    return lockGuard.apply(raw, TRANSACTION_ACTION_LOCK_POLICY);
  }, [
    lockGuard,
    refresh,
    createTransaction,
    updateTransaction,
    deleteTransaction,
    setTransactionConfirmed,
    createCategory,
    updateCategory,
    deleteCategory,
    createFund,
    updateFund,
    deleteFund,
    setBaseCurrency,
    setBiometricGateEnabled,
    setDriveFolderId,
    setExportDirectoryUri,
    setFilters,
    clearFilters,
    clearError,
    queueExport,
    retryExport,
    removeExport,
    clearCompletedExports,
    uploadQueuedExports,
    importTransactions,
    unlockWithBiometrics,
    unlockWithPin,
    setAppPin,
    changeAppPin,
    turnOffAppLock,
    appPinUsable,
    completePinSetup,
    declinePinSetup,
    unlockWithDeviceCredential,
    refreshLockAvailability,
    setAutoLockMinutes,
  ]);

  const aggregateState = useMemo<TransactionDataState>(
    () => ({
      ...state,
      exportQueue,
      biometric: {
        isLocked: biometricIsLocked,
        lastError: biometricLastError,
        lockout: biometricLockout,
        biometricsAvailable,
        pinUsable,
      },
      gatePresentation,
      pinSetupRequired,
    }),
    [
      state,
      exportQueue,
      biometricIsLocked,
      biometricLastError,
      biometricLockout,
      biometricsAvailable,
      pinUsable,
      gatePresentation,
      pinSetupRequired,
    ],
  );

  const value = useMemo<TransactionDataContextValue>(
    () => ({
      state: aggregateState,
      actions,
      selectors,
    }),
    [aggregateState, actions, selectors],
  );

  return (
    <TransactionDataContext.Provider value={value}>
      <FocusBlockView
        style={styles.app}
        collapsable={false}
        blocked={gatePresentation !== 'hidden'}
        importantForAccessibility={
          gatePresentation === 'hidden' ? 'auto' : 'no-hide-descendants'
        }
      >
        <Portal.Host>
          {state.isInitialised ? (
            children
          ) : (
            <Surface style={styles.loading}>
              <ActivityIndicator animating size="large" />
            </Surface>
          )}
        </Portal.Host>
      </FocusBlockView>
      {/* Outside FocusBlockView, so the lock screen portals into
          PaperProvider's host above the app; inside, it would be sealed too. */}
      {gatePresentation !== 'hidden' ? (
        <BiometricGateModal
          key={biometricBackgroundNonce}
          presentation={gatePresentation}
          lastError={biometricLastError}
          lockout={biometricLockout}
          biometricsAvailable={biometricsAvailable}
          pinUsable={pinUsable}
          onRetry={() => void unlockWithBiometrics()}
          onSubmitPin={unlockWithPin}
          onSetUpPin={completePinSetup}
          onDeclineSetup={declinePinSetup}
          onConfirmCredential={unlockWithDeviceCredential}
          onOpenScreenLockSettings={openScreenLockSettings}
          onCheckAgain={refreshLockAvailability}
        />
      ) : null}
    </TransactionDataContext.Provider>
  );
};

export const useTransactionData = (): TransactionDataContextValue => {
  const context = useContext(TransactionDataContext);
  if (!context) {
    throw new Error(
      'useTransactionData must be used within TransactionDataProvider',
    );
  }
  return context;
};

export const AppProvider = TransactionDataProvider;
