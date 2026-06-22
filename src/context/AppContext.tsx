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
import { requestDirectorySelection } from '../security/storageAccess';
import {
  withDatabase,
  listExpenses as dbListExpenses,
  createExpense as dbCreateExpense,
  updateExpense as dbUpdateExpense,
  deleteExpense as dbDeleteExpense,
  listCategories as dbListCategories,
  createCategory as dbCreateCategory,
  updateCategory as dbUpdateCategory,
  deleteCategory as dbDeleteCategory,
  getAllSettings as dbGetAllSettings,
  setSetting as dbSetSetting,
  listExportQueue as dbListExportQueue,
  listCurrencyFxRates as dbListCurrencyFxRates,
  upsertCurrencyFxRate as dbUpsertCurrencyFxRate,
} from '../database';
import type {
  ExpenseRecord,
  CategoryRecord,
  NewExpenseRecord,
  UpdateExpenseRecord,
  NewCategoryRecord,
  UpdateCategoryRecord,
  AppSettingRecord,
  ExportQueueRecord,
  CurrencyFxRateRecord,
} from '../database';
import { bankersRound } from '../utils/math';
import { toError, toErrorMessage } from '../utils/errors';
import { useBiometricGate, useExportSync } from '../hooks';
import type { BiometricGateState, ExportQueueItem } from '../hooks';
import { BiometricGateModal } from '../components/BiometricGateModal';

export type { ExportQueueItem } from '../hooks';

export type ExpenseFilters = {
  categoryId?: number | null;
  startDate?: string;
  endDate?: string;
};

export type ExpenseDataSettings = {
  baseCurrency: string | null;
  biometricGateEnabled: boolean;
  driveFolderId: string | null;
  exportDirectoryUri: string | null;
};

type CoreState = {
  expenses: ExpenseRecord[];
  categories: CategoryRecord[];
  settings: ExpenseDataSettings;
  fxRateCache: CurrencyFxRateRecord[];
  filters: ExpenseFilters;
  isInitialised: boolean;
  isLoading: boolean;
  error: string | null;
};

export type ExpenseDataState = CoreState & {
  exportQueue: ExportQueueItem[];
  biometric: BiometricGateState;
};

export type TotalsByCategory = {
  categoryId: number | null;
  rawTotal: number;
  total: number;
};

export type TotalsByBaseCurrency = {
  baseCurrencyCode: string | null;
  rawTotal: number;
  total: number;
};

export type ExpenseTotals = {
  rawBaseAmount: number;
  baseAmount: number;
  byCategory: TotalsByCategory[];
  byBaseCurrency: TotalsByBaseCurrency[];
  mixedBase: boolean;
};

export type ExpenseDataSelectors = {
  filteredExpenses: ExpenseRecord[];
  totals: ExpenseTotals;
  hasActiveFilters: boolean;
};

export type ExpenseDataActions = {
  refresh: () => Promise<void>;
  createExpense: (payload: NewExpenseRecord) => Promise<ExpenseRecord>;
  updateExpense: (payload: UpdateExpenseRecord) => Promise<ExpenseRecord>;
  deleteExpense: (id: number) => Promise<void>;
  createCategory: (payload: NewCategoryRecord) => Promise<CategoryRecord>;
  updateCategory: (payload: UpdateCategoryRecord) => Promise<CategoryRecord>;
  deleteCategory: (id: number) => Promise<void>;
  setBaseCurrency: (currencyCode: string | null) => Promise<void>;
  setBiometricGateEnabled: (enabled: boolean) => Promise<void>;
  setDriveFolderId: (folderId: string | null) => Promise<void>;
  setExportDirectoryUri: (directoryUri: string | null) => Promise<void>;
  setFilters: (filters: ExpenseFilters) => void;
  clearFilters: () => void;
  clearError: () => void;
  queueExport: () => Promise<void>;
  retryExport: (id: string) => Promise<void>;
  removeExport: (id: string) => Promise<void>;
  clearCompletedExports: () => Promise<void>;
  uploadQueuedExports: (options?: {
    interactive?: boolean;
  }) => Promise<UploadPendingExportsResult | null>;
  unlockWithBiometrics: () => Promise<boolean>;
};

export type ExpenseDataContextValue = {
  state: ExpenseDataState;
  actions: ExpenseDataActions;
  selectors: ExpenseDataSelectors;
};

export type ExpenseDataAction =
  | { type: 'load/start' }
  | {
      type: 'load/success';
      payload: {
        expenses: ExpenseRecord[];
        categories: CategoryRecord[];
        settings: ExpenseDataSettings;
        fxRateCache: CurrencyFxRateRecord[];
      };
    }
  | { type: 'load/error'; payload: string }
  | { type: 'operation/start' }
  | { type: 'operation/end' }
  | { type: 'operation/error'; payload: string }
  | { type: 'error/clear' }
  | { type: 'filters/set'; payload: ExpenseFilters }
  | { type: 'filters/clear' }
  | { type: 'expenses/set-all'; payload: ExpenseRecord[] }
  | { type: 'expense/add'; payload: ExpenseRecord }
  | { type: 'expense/update'; payload: ExpenseRecord }
  | { type: 'expense/delete'; payload: number }
  | { type: 'categories/set-all'; payload: CategoryRecord[] }
  | { type: 'fx-cache/upsert'; payload: CurrencyFxRateRecord }
  | { type: 'settings/set-base-currency'; payload: string | null }
  | { type: 'settings/set-biometric'; payload: boolean }
  | { type: 'settings/set-drive-folder'; payload: string | null }
  | { type: 'settings/set-export-directory'; payload: string | null };

const BASE_CURRENCY_KEY = 'base_currency';
const BIOMETRIC_GATE_KEY = 'biometric_gate_enabled';
const DRIVE_FOLDER_ID_KEY = 'drive_folder_id';
const EXPORT_DIRECTORY_URI_KEY = 'export_directory_uri';

export const initialState: CoreState = {
  expenses: [],
  categories: [],
  settings: {
    baseCurrency: null,
    biometricGateEnabled: false,
    driveFolderId: null,
    exportDirectoryUri: null,
  },
  fxRateCache: [],
  filters: {},
  isInitialised: false,
  isLoading: false,
  error: null,
};

const ExpenseDataContext = createContext<ExpenseDataContextValue | undefined>(
  undefined,
);

const parseSettings = (records: AppSettingRecord[]): ExpenseDataSettings => {
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
  return {
    baseCurrency,
    biometricGateEnabled,
    driveFolderId,
    exportDirectoryUri,
  };
};

const normalizeFilters = (
  current: ExpenseFilters,
  update: ExpenseFilters,
): ExpenseFilters => {
  const next: ExpenseFilters = { ...current, ...update };

  if (
    Object.prototype.hasOwnProperty.call(update, 'categoryId') &&
    update.categoryId === undefined
  ) {
    delete next.categoryId;
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

export const expenseDataReducer = (
  state: CoreState,
  action: ExpenseDataAction,
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
        expenses: action.payload.expenses,
        categories: action.payload.categories,
        settings: action.payload.settings,
        fxRateCache: action.payload.fxRateCache,
        isInitialised: true,
        isLoading: false,
        error: null,
      };
    case 'load/error':
      return {
        ...state,
        isInitialised: true,
        isLoading: false,
        error: action.payload,
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
    case 'expenses/set-all':
      return {
        ...state,
        expenses: action.payload,
      };
    case 'expense/add':
      return {
        ...state,
        expenses: [action.payload, ...state.expenses],
      };
    case 'expense/update':
      return {
        ...state,
        expenses: state.expenses.map(expense =>
          expense.id === action.payload.id ? action.payload : expense,
        ),
      };
    case 'expense/delete':
      return {
        ...state,
        expenses: state.expenses.filter(
          expense => expense.id !== action.payload,
        ),
      };
    case 'categories/set-all':
      return {
        ...state,
        categories: action.payload,
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
  expenses: ExpenseRecord[],
  filters: ExpenseFilters,
): ExpenseRecord[] => {
  if (!expenses.length) {
    return expenses;
  }

  const hasCategoryFilter = Object.prototype.hasOwnProperty.call(
    filters,
    'categoryId',
  );
  const { categoryId, startDate, endDate } = filters;

  return expenses.filter(expense => {
    if (hasCategoryFilter) {
      if (categoryId == null) {
        if (expense.categoryId !== null && expense.categoryId !== undefined) {
          return false;
        }
      } else if (expense.categoryId !== categoryId) {
        return false;
      }
    }

    if (startDate && expense.date < startDate) {
      return false;
    }

    if (endDate && expense.date > endDate) {
      return false;
    }

    return true;
  });
};

const calculateTotals = (expenses: ExpenseRecord[]): ExpenseTotals => {
  if (!expenses.length) {
    return {
      rawBaseAmount: 0,
      baseAmount: 0,
      byCategory: [],
      byBaseCurrency: [],
      mixedBase: false,
    };
  }

  const rawBaseAmount = expenses.reduce(
    (total, expense) => total + expense.baseAmount,
    0,
  );
  const baseAmount = bankersRound(rawBaseAmount, 2);
  const categoryTotals = new Map<number | null, number>();
  const baseCurrencyTotals = new Map<string | null, number>();

  expenses.forEach(expense => {
    const key = expense.categoryId ?? null;
    const current = categoryTotals.get(key) ?? 0;
    categoryTotals.set(key, current + expense.baseAmount);

    const baseKey = expense.baseCurrencyCode ?? null;
    const baseCurrent = baseCurrencyTotals.get(baseKey) ?? 0;
    baseCurrencyTotals.set(baseKey, baseCurrent + expense.baseAmount);
  });

  const byCategory: TotalsByCategory[] = Array.from(
    categoryTotals.entries(),
  ).map(([categoryId, value]) => ({
    categoryId,
    rawTotal: value,
    total: bankersRound(value, 2),
  }));

  const byBaseCurrency: TotalsByBaseCurrency[] = Array.from(
    baseCurrencyTotals.entries(),
  ).map(([baseCurrencyCode, value]) => ({
    baseCurrencyCode,
    rawTotal: value,
    total: bankersRound(value, 2),
  }));

  return {
    rawBaseAmount,
    baseAmount,
    byCategory,
    byBaseCurrency,
    mixedBase: byBaseCurrency.length > 1,
  };
};

const hasActiveFilters = (filters: ExpenseFilters): boolean => {
  if (Object.prototype.hasOwnProperty.call(filters, 'categoryId')) {
    return true;
  }
  if (filters.startDate || filters.endDate) {
    return true;
  }
  return false;
};

export const ExpenseDataProvider: React.FC<React.PropsWithChildren> = ({
  children,
}) => {
  const [state, dispatch] = useReducer(expenseDataReducer, initialState);
  const [loadedQueueRecords, setLoadedQueueRecords] = useState<
    readonly ExportQueueRecord[]
  >([]);

  const loadFromDatabase = useCallback(async () => {
    dispatch({ type: 'load/start' });
    try {
      const snapshot = await withDatabase(async db => {
        const [
          expenses,
          categories,
          settings,
          exportQueueRecords,
          fxRateCache,
        ] = await Promise.all([
          dbListExpenses(db),
          dbListCategories(db),
          dbGetAllSettings(db),
          dbListExportQueue(db),
          dbListCurrencyFxRates(db),
        ]);
        return {
          expenses,
          categories,
          settings,
          exportQueueRecords,
          fxRateCache,
        };
      });

      dispatch({
        type: 'load/success',
        payload: {
          expenses: snapshot.expenses,
          categories: snapshot.categories,
          settings: parseSettings(snapshot.settings),
          fxRateCache: snapshot.fxRateCache,
        },
      });
      setLoadedQueueRecords(snapshot.exportQueueRecords);
    } catch (error) {
      dispatch({ type: 'load/error', payload: toErrorMessage(error) });
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
  } = useBiometricGate({ enabled: state.settings.biometricGateEnabled });

  const createExpense = useCallback<ExpenseDataActions['createExpense']>(
    async payload => {
      dispatch({ type: 'operation/start' });
      try {
        const expense = await withDatabase(async db => {
          const created = await dbCreateExpense(db, payload);
          if (created.baseCurrencyCode) {
            await dbUpsertCurrencyFxRate(
              db,
              created.baseCurrencyCode,
              created.currencyCode,
              created.fxRateToBase,
            );
          }
          return created;
        });
        dispatch({ type: 'expense/add', payload: expense });
        if (expense.baseCurrencyCode) {
          dispatch({
            type: 'fx-cache/upsert',
            payload: {
              baseCurrencyCode: expense.baseCurrencyCode,
              currencyCode: expense.currencyCode,
              fxRateToBase: expense.fxRateToBase,
              updatedAt: expense.updatedAt,
            },
          });
        }
        return expense;
      } catch (error) {
        dispatch({ type: 'operation/error', payload: toErrorMessage(error) });
        throw toError(error);
      } finally {
        dispatch({ type: 'operation/end' });
      }
    },
    [],
  );

  const updateExpense = useCallback<ExpenseDataActions['updateExpense']>(
    async payload => {
      dispatch({ type: 'operation/start' });
      try {
        const expense = await withDatabase(async db => {
          const updated = await dbUpdateExpense(db, payload);
          if (updated.baseCurrencyCode) {
            await dbUpsertCurrencyFxRate(
              db,
              updated.baseCurrencyCode,
              updated.currencyCode,
              updated.fxRateToBase,
            );
          }
          return updated;
        });
        dispatch({ type: 'expense/update', payload: expense });
        if (expense.baseCurrencyCode) {
          dispatch({
            type: 'fx-cache/upsert',
            payload: {
              baseCurrencyCode: expense.baseCurrencyCode,
              currencyCode: expense.currencyCode,
              fxRateToBase: expense.fxRateToBase,
              updatedAt: expense.updatedAt,
            },
          });
        }
        return expense;
      } catch (error) {
        dispatch({ type: 'operation/error', payload: toErrorMessage(error) });
        throw toError(error);
      } finally {
        dispatch({ type: 'operation/end' });
      }
    },
    [],
  );

  const deleteExpense = useCallback<ExpenseDataActions['deleteExpense']>(
    async id => {
      dispatch({ type: 'operation/start' });
      try {
        await withDatabase(db => dbDeleteExpense(db, id));
        dispatch({ type: 'expense/delete', payload: id });
      } catch (error) {
        dispatch({ type: 'operation/error', payload: toErrorMessage(error) });
        throw toError(error);
      } finally {
        dispatch({ type: 'operation/end' });
      }
    },
    [],
  );

  const createCategory = useCallback<ExpenseDataActions['createCategory']>(
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

  const updateCategory = useCallback<ExpenseDataActions['updateCategory']>(
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

  const deleteCategory = useCallback<ExpenseDataActions['deleteCategory']>(
    async id => {
      dispatch({ type: 'operation/start' });
      try {
        const { categories, expenses } = await withDatabase(async db => {
          await dbDeleteCategory(db, id);
          const [allCategories, allExpenses] = await Promise.all([
            dbListCategories(db),
            dbListExpenses(db),
          ]);
          return { categories: allCategories, expenses: allExpenses };
        });
        dispatch({ type: 'categories/set-all', payload: categories });
        dispatch({ type: 'expenses/set-all', payload: expenses });
      } catch (error) {
        dispatch({ type: 'operation/error', payload: toErrorMessage(error) });
        throw toError(error);
      } finally {
        dispatch({ type: 'operation/end' });
      }
    },
    [],
  );

  const setBaseCurrency = useCallback<ExpenseDataActions['setBaseCurrency']>(
    async currencyCode => {
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
    },
    [],
  );

  const setBiometricGateEnabled = useCallback<
    ExpenseDataActions['setBiometricGateEnabled']
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

  const setDriveFolderId = useCallback<ExpenseDataActions['setDriveFolderId']>(
    async folderId => {
      dispatch({ type: 'operation/start' });
      try {
        await withDatabase(db =>
          dbSetSetting(db, DRIVE_FOLDER_ID_KEY, folderId),
        );
        dispatch({ type: 'settings/set-drive-folder', payload: folderId });
      } catch (error) {
        dispatch({ type: 'operation/error', payload: toErrorMessage(error) });
        throw toError(error);
      } finally {
        dispatch({ type: 'operation/end' });
      }
    },
    [],
  );

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
    ExpenseDataActions['setExportDirectoryUri']
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
    expenses: state.expenses,
    categories: state.categories,
    initialQueueRecords: loadedQueueRecords,
    ensureExportDirectoryUri,
    setDriveFolderId: setDriveFolderIdState,
    beginOperation,
    endOperation,
    failOperation,
  });

  const setFilters = useCallback<ExpenseDataActions['setFilters']>(filters => {
    dispatch({ type: 'filters/set', payload: filters });
  }, []);

  const clearFilters = useCallback(() => {
    dispatch({ type: 'filters/clear' });
  }, []);

  const clearError = useCallback(() => {
    dispatch({ type: 'error/clear' });
    clearBiometricError();
  }, [clearBiometricError]);

  const refresh = useCallback(() => loadFromDatabase(), [loadFromDatabase]);

  const filteredExpenses = useMemo(
    () => applyFilters(state.expenses, state.filters),
    [state.expenses, state.filters],
  );

  const totals = useMemo(
    () => calculateTotals(filteredExpenses),
    [filteredExpenses],
  );

  const selectors = useMemo<ExpenseDataSelectors>(
    () => ({
      filteredExpenses,
      totals,
      hasActiveFilters: hasActiveFilters(state.filters),
    }),
    [filteredExpenses, totals, state.filters],
  );

  const actions = useMemo<ExpenseDataActions>(
    () => ({
      refresh,
      createExpense,
      updateExpense,
      deleteExpense,
      createCategory,
      updateCategory,
      deleteCategory,
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
      unlockWithBiometrics,
    }),
    [
      refresh,
      createExpense,
      updateExpense,
      deleteExpense,
      createCategory,
      updateCategory,
      deleteCategory,
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
      unlockWithBiometrics,
    ],
  );

  const aggregateState = useMemo<ExpenseDataState>(
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

  const value = useMemo<ExpenseDataContextValue>(
    () => ({
      state: aggregateState,
      actions,
      selectors,
    }),
    [aggregateState, actions, selectors],
  );

  return (
    <ExpenseDataContext.Provider value={value}>
      {children}
      {state.settings.biometricGateEnabled && biometricIsLocked ? (
        <BiometricGateModal
          lastError={biometricLastError}
          onRetry={() => void unlockWithBiometrics()}
        />
      ) : null}
    </ExpenseDataContext.Provider>
  );
};

/**
 * @deprecated Prefer the focused hooks `useExportSync` and `useBiometricGate`
 * for export-queue and biometric-gate concerns.
 */
export const useExpenseData = (): ExpenseDataContextValue => {
  const context = useContext(ExpenseDataContext);
  if (!context) {
    throw new Error('useExpenseData must be used within ExpenseDataProvider');
  }
  return context;
};

export const AppProvider = ExpenseDataProvider;

/** @deprecated Prefer `useExportSync` / `useBiometricGate`. */
export const useAppContext = useExpenseData;
