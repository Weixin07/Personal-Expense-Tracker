import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useState,
} from 'react';
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
  TransactionType,
} from '../database';
import { bankersRound } from '../utils/math';
import { resolveTransferCurrency } from '../utils/funds';
import { calculateFundBalances } from '../utils/fundBalances';
import type { FundBalance } from '../utils/fundBalances';
import { isSuspectTransferRate, ratesForTransaction } from '../utils/fxRates';
import { buildCategoryUsageCounts } from '../utils/suggestions';
import type { CategoryUsageCounts } from '../utils/suggestions';
import { toError, toErrorMessage } from '../utils/errors';
import {
  useBiometricGate,
  useExportSync,
  biometricCredentialExists,
} from '../hooks';
import type { BiometricGateState, ExportQueueItem } from '../hooks';
import { BiometricGateModal } from '../components/BiometricGateModal';

export type { ExportQueueItem } from '../hooks';
export type {
  FundBalance,
  FundBalanceBasis,
  FundBalanceFigure,
} from '../utils/fundBalances';

export type TransactionFilters = {
  /**
   * Unlike `categoryId`, this has no null form: every transaction carries a
   * direction, so there is no "untyped" set to filter for.
   */
  type?: TransactionType;
  categoryId?: number | null;
  /**
   * Matches either side of a transfer, so money moved into the fund is part of
   * what the filter shows.
   */
  fundId?: number;
  /**
   * Narrows to transfers whose recorded amounts imply a rate their currencies
   * contradict. Has no false form: a filter that is not wanted is absent, which
   * is what every other member here means by omission.
   */
  needsReview?: true;
  startDate?: string;
  endDate?: string;
};

export type TransactionDataSettings = {
  baseCurrency: string | null;
  biometricGateEnabled: boolean;
  biometricCredentialVersion: number;
  driveFolderId: string | null;
  exportDirectoryUri: string | null;
};

type CoreState = {
  transactions: TransactionRecord[];
  categories: CategoryRecord[];
  funds: FundRecord[];
  settings: TransactionDataSettings;
  fxRateCache: CurrencyFxRateRecord[];
  filters: TransactionFilters;
  isInitialised: boolean;
  isLoading: boolean;
  error: string | null;
};

export type TransactionDataState = CoreState & {
  exportQueue: ExportQueueItem[];
  biometric: BiometricGateState;
};

export type TotalsFigure = {
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
export type TransactionTotals = {
  byBaseCurrency: TotalsByBaseCurrency[];
  mixedBase: boolean;
};

export type TransactionDataSelectors = {
  filteredTransactions: TransactionRecord[];
  totals: TransactionTotals;
  fundBalances: FundBalance[];
  /**
   * Transfers whose recorded amounts imply a rate their currencies contradict.
   * Spans the whole history rather than the filtered view, for the same reason
   * `fundBalances` does: a count that moved with the date filter would describe
   * a period rather than the state of the ledger.
   */
  suspectTransferIds: ReadonlySet<number>;
  hasActiveFilters: boolean;
  /**
   * Counted over the whole history rather than the filtered view: a picker
   * whose order depended on the filter it sets would reorder itself between
   * one opening and the next.
   */
  categoryUsageCounts: CategoryUsageCounts;
};

export type TransactionDataActions = {
  refresh: () => Promise<void>;
  createTransaction: (
    payload: NewTransactionRecord,
  ) => Promise<TransactionRecord>;
  updateTransaction: (
    payload: UpdateTransactionRecord,
  ) => Promise<TransactionRecord>;
  deleteTransaction: (id: number) => Promise<void>;
  createCategory: (payload: NewCategoryRecord) => Promise<CategoryRecord>;
  updateCategory: (payload: UpdateCategoryRecord) => Promise<CategoryRecord>;
  deleteCategory: (id: number) => Promise<void>;
  createFund: (payload: NewFundRecord) => Promise<FundRecord>;
  updateFund: (payload: UpdateFundRecord) => Promise<FundRecord>;
  /** Rejected by the database while any transaction still references the fund. */
  deleteFund: (id: number) => Promise<void>;
  setBaseCurrency: (currencyCode: string | null) => Promise<void>;
  setBiometricGateEnabled: (enabled: boolean) => Promise<void>;
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
        fxRateCache: CurrencyFxRateRecord[];
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
  | { type: 'fx-cache/upsert'; payload: CurrencyFxRateRecord }
  | { type: 'settings/set-base-currency'; payload: string | null }
  | { type: 'settings/set-biometric'; payload: boolean }
  | { type: 'settings/set-cred-version'; payload: number }
  | { type: 'settings/set-drive-folder'; payload: string | null }
  | { type: 'settings/set-export-directory'; payload: string | null };

const BASE_CURRENCY_KEY = 'base_currency';
const BIOMETRIC_GATE_KEY = 'biometric_gate_enabled';
const BIOMETRIC_CRED_VERSION_KEY = 'biometric_cred_version';
const DRIVE_FOLDER_ID_KEY = 'drive_folder_id';
const EXPORT_DIRECTORY_URI_KEY = 'export_directory_uri';

const BIOMETRIC_CRED_VERSION = 2;

export const initialState: CoreState = {
  transactions: [],
  categories: [],
  funds: [],
  settings: {
    baseCurrency: null,
    biometricGateEnabled: false,
    biometricCredentialVersion: 0,
    driveFolderId: null,
    exportDirectoryUri: null,
  },
  fxRateCache: [],
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
  return {
    baseCurrency,
    biometricGateEnabled,
    biometricCredentialVersion,
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
    Object.prototype.hasOwnProperty.call(update, 'needsReview') &&
    update.needsReview === undefined
  ) {
    delete next.needsReview;
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
        fxRateCache: action.payload.fxRateCache,
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
    case 'fx-cache/upsert': {
      const next = state.fxRateCache.filter(
        rate =>
          !(
            rate.baseCurrencyCode === action.payload.baseCurrencyCode &&
            rate.currencyCode === action.payload.currencyCode
          ),
      );
      next.push(action.payload);
      return {
        ...state,
        fxRateCache: next,
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

const applyFilters = (
  transactions: TransactionRecord[],
  filters: TransactionFilters,
  suspectTransferIds: ReadonlySet<number>,
): TransactionRecord[] => {
  if (!transactions.length) {
    return transactions;
  }

  const hasCategoryFilter = Object.prototype.hasOwnProperty.call(
    filters,
    'categoryId',
  );
  const { type, categoryId, fundId, needsReview, startDate, endDate } = filters;

  return transactions.filter(transaction => {
    if (type !== undefined && transaction.type !== type) {
      return false;
    }

    if (needsReview && !suspectTransferIds.has(transaction.id)) {
      return false;
    }

    if (
      fundId !== undefined &&
      transaction.fundId !== fundId &&
      transaction.counterpartFundId !== fundId
    ) {
      return false;
    }

    if (hasCategoryFilter) {
      if (categoryId == null) {
        if (
          transaction.categoryId !== null &&
          transaction.categoryId !== undefined
        ) {
          return false;
        }
      } else if (transaction.categoryId !== categoryId) {
        return false;
      }
    }

    if (startDate && transaction.date < startDate) {
      return false;
    }

    if (endDate && transaction.date > endDate) {
      return false;
    }

    return true;
  });
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

  const byBaseCurrency: TotalsByBaseCurrency[] = Array.from(
    perBaseCurrency.entries(),
  ).map(([baseCurrencyCode, accumulator]) => ({
    baseCurrencyCode,
    expense: toFigure(accumulator.expenseRaw, accumulator.expenseCount),
    income: toFigure(accumulator.incomeRaw, accumulator.incomeCount),
    net: toFigure(
      accumulator.incomeRaw - accumulator.expenseRaw,
      accumulator.expenseCount + accumulator.incomeCount,
    ),
  }));

  return {
    byBaseCurrency,
    mixedBase: byBaseCurrency.length > 1,
  };
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
  if (filters.needsReview !== undefined) {
    return true;
  }
  if (filters.startDate || filters.endDate) {
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
          fxRateCache,
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
          fxRateCache,
        };
      });

      dispatch({
        type: 'load/success',
        payload: {
          transactions: snapshot.transactions,
          categories: snapshot.categories,
          funds: snapshot.funds,
          settings: parseSettings(snapshot.settings),
          fxRateCache: snapshot.fxRateCache,
        },
      });
      setLoadedQueueRecords(snapshot.exportQueueRecords);
    } catch (error) {
      let biometricGateEnabled: boolean;
      try {
        biometricGateEnabled = await biometricCredentialExists();
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
    unlockWithBiometrics,
    clearError: clearBiometricError,
    ensureCredential: ensureBiometricCredential,
    clearCredential: clearBiometricCredential,
    applyEnabledState: applyBiometricEnabledState,
  } = useBiometricGate({
    enabled: state.settings.biometricGateEnabled,
    isInitialised: state.isInitialised,
  });

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
          );
        }
        return { transaction: created, rates: derived };
      });
      dispatch({ type: 'transaction/add', payload: transaction });
      rates.forEach(rate => {
        dispatch({
          type: 'fx-cache/upsert',
          payload: { ...rate, updatedAt: transaction.updatedAt },
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
          );
        }
        return { transaction: updated, rates: derived };
      });
      dispatch({ type: 'transaction/update', payload: transaction });
      rates.forEach(rate => {
        dispatch({
          type: 'fx-cache/upsert',
          payload: { ...rate, updatedAt: transaction.updatedAt },
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
          await ensureBiometricCredential();
        } else {
          await clearBiometricCredential();
          applyBiometricEnabledState(false);
        }
        await withDatabase(db =>
          dbSetSetting(db, BIOMETRIC_GATE_KEY, enabled ? 'true' : 'false'),
        );
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
      applyBiometricEnabledState,
      clearBiometricCredential,
      ensureBiometricCredential,
    ],
  );

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

  // Independent of `filters` and `filteredTransactions`, under the rule on
  // `FundBalance`.
  const fundBalances = useMemo(
    () =>
      calculateFundBalances({
        funds: state.funds,
        transactions: state.transactions,
        baseCurrency: state.settings.baseCurrency,
        cachedRates: state.fxRateCache,
      }),
    [
      state.funds,
      state.transactions,
      state.settings.baseCurrency,
      state.fxRateCache,
    ],
  );

  const selectors = useMemo<TransactionDataSelectors>(
    () => ({
      filteredTransactions,
      totals,
      fundBalances,
      suspectTransferIds,
      hasActiveFilters: hasActiveFilters(state.filters),
      categoryUsageCounts,
    }),
    [
      filteredTransactions,
      totals,
      fundBalances,
      suspectTransferIds,
      state.filters,
      categoryUsageCounts,
    ],
  );

  const actions = useMemo<TransactionDataActions>(
    () => ({
      refresh,
      createTransaction,
      updateTransaction,
      deleteTransaction,
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
    }),
    [
      refresh,
      createTransaction,
      updateTransaction,
      deleteTransaction,
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
    ],
  );

  const aggregateState = useMemo<TransactionDataState>(
    () => ({
      ...state,
      exportQueue,
      biometric: {
        isLocked: biometricIsLocked,
        lastError: biometricLastError,
      },
    }),
    [state, exportQueue, biometricIsLocked, biometricLastError],
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
      {children}
      {state.settings.biometricGateEnabled && biometricIsLocked ? (
        <BiometricGateModal
          lastError={biometricLastError}
          onRetry={() => void unlockWithBiometrics()}
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
