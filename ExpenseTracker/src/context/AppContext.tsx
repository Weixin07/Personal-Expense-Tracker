import NetInfo from '@react-native-community/netinfo';
import { AppState, type AppStateStatus } from 'react-native';
import RNFS from 'react-native-fs';
import { Button, Modal, Portal, Text, useTheme } from 'react-native-paper';
import * as Keychain from 'react-native-keychain';
import { writeExportFile, uploadPendingExports } from '../export';
import type { UploadPendingExportsResult } from '../export';

import React, {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useReducer,
  useRef,
  useState,
} from 'react';
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
  insertExportQueueItem as dbInsertExportQueueItem,
  updateExportQueueStatus as dbUpdateExportQueueStatus,
  removeExportQueueItem as dbRemoveExportQueueItem,
  clearCompletedExportQueueItems as dbClearCompletedExportQueueItems,
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
} from '../database';
import { bankersRound } from '../utils/math';

export type ExportQueueItem = {
  id: string;
  filename: string;
  filePath: string;
  status: 'pending' | 'uploading' | 'completed' | 'failed';
  createdAt: string;
  updatedAt: string;
  uploadedAt?: string;
  driveFileId?: string;
  lastError?: string | null;
};

export type ExpenseFilters = {
  categoryId?: number | null;
  startDate?: string;
  endDate?: string;
};

export type ExpenseDataState = {
  expenses: ExpenseRecord[];
  categories: CategoryRecord[];
  settings: {
    baseCurrency: string | null;
    biometricGateEnabled: boolean;
    driveFolderId: string | null;
  };
  exportQueue: ExportQueueItem[];
  filters: ExpenseFilters;
  isInitialised: boolean;
  isLoading: boolean;
  error: string | null;
  biometric: {
    isLocked: boolean;
    lastError: string | null;
  };
};

export type TotalsByCategory = {
  categoryId: number | null;
  rawTotal: number;
  total: number;
};

export type ExpenseTotals = {
  rawBaseAmount: number;
  baseAmount: number;
  byCategory: TotalsByCategory[];
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
  setFilters: (filters: ExpenseFilters) => void;
  clearFilters: () => void;
  clearError: () => void;
  queueExport: () => Promise<void>;
  retryExport: (id: string) => Promise<void>;
  removeExport: (id: string) => Promise<void>;
  clearCompletedExports: () => Promise<void>;
  uploadQueuedExports: (options?: { interactive?: boolean }) => Promise<UploadPendingExportsResult | null>;
};

export type ExpenseDataContextValue = {
  state: ExpenseDataState;
  actions: ExpenseDataActions;
  selectors: ExpenseDataSelectors;
};

type ExpenseDataAction =
  | { type: 'load/start' }
  | {
      type: 'load/success';
      payload: {
        expenses: ExpenseRecord[];
        categories: CategoryRecord[];
        settings: ExpenseDataState['settings'];
        exportQueue: ExportQueueItem[];
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
  | { type: 'settings/set-base-currency'; payload: string | null }
  | { type: 'settings/set-biometric'; payload: boolean }
  | { type: 'settings/set-drive-folder'; payload: string | null }
  | { type: 'exportQueue/set-all'; payload: ExportQueueItem[] }
  | { type: 'exportQueue/add'; payload: ExportQueueItem }
  | { type: 'exportQueue/update'; payload: ExportQueueItem }
  | { type: 'exportQueue/remove'; payload: string }
  | { type: 'biometric/lock' }
  | { type: 'biometric/unlock' }
  | { type: 'biometric/error'; payload: string | null };

const BASE_CURRENCY_KEY = 'base_currency';
const BIOMETRIC_GATE_KEY = 'biometric_gate_enabled';
const DRIVE_FOLDER_ID_KEY = 'drive_folder_id';
const BIOMETRIC_TIMEOUT_MS = 5 * 60 * 1000;
const BIOMETRIC_KEYCHAIN_SERVICE = 'expense-tracker-biometric-gate';

const mapExportQueueRecords = (records: readonly ExportQueueRecord[]): ExportQueueItem[] =>
  records.map(record => ({
    id: record.id,
    filename: record.filename,
    filePath: record.filePath,
    status: record.status,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    uploadedAt: record.uploadedAt ?? undefined,
    driveFileId: record.driveFileId ?? undefined,
    lastError: record.lastError,
  }));

const generateExportQueueId = (): string => {
  const timestamp = new Date().toISOString().replace(/[^0-9]/g, '');
  const random = Math.random().toString(36).slice(2, 8);
  return `exp-${timestamp}-${random}`;
};

const removeQueueFileIfExists = async (filePath: string): Promise<void> => {
  try {
    const exists = await RNFS.exists(filePath);
    if (exists) {
      await RNFS.unlink(filePath);
    }
  } catch {
    // ignore unlink errors
  }
};

const initialState: ExpenseDataState = {
  expenses: [],
  categories: [],
  settings: {
    baseCurrency: null,
    biometricGateEnabled: false,
    driveFolderId: null,
  },
  exportQueue: [],
  filters: {},
  isInitialised: false,
  isLoading: false,
  error: null,
  biometric: {
    isLocked: false,
    lastError: null,
  },
};

const ExpenseDataContext = createContext<ExpenseDataContextValue | undefined>(undefined);

const toErrorMessage = (error: unknown): string => {
  if (error instanceof Error && error.message) {
    return error.message;
  }
  if (typeof error === 'string') {
    return error;
  }
  return 'Unexpected error occurred';
};

const toError = (error: unknown): Error => {
  if (error instanceof Error) {
    return error;
  }
  return new Error(toErrorMessage(error));
};

const parseSettings = (records: AppSettingRecord[]): ExpenseDataState['settings'] => {
  const baseCurrency = records.find(setting => setting.key === BASE_CURRENCY_KEY)?.value ?? null;
  const biometricGateSetting = records.find(setting => setting.key === BIOMETRIC_GATE_KEY)?.value;
  const driveFolderId = records.find(setting => setting.key === DRIVE_FOLDER_ID_KEY)?.value ?? null;
  const biometricGateEnabled = biometricGateSetting === 'true';
  return { baseCurrency, biometricGateEnabled, driveFolderId };
};

const normalizeFilters = (
  current: ExpenseFilters,
  update: ExpenseFilters,
): ExpenseFilters => {
  const next: ExpenseFilters = { ...current, ...update };

  if (Object.prototype.hasOwnProperty.call(update, 'categoryId') && update.categoryId === undefined) {
    delete next.categoryId;
  }
  if (Object.prototype.hasOwnProperty.call(update, 'startDate') && update.startDate === undefined) {
    delete next.startDate;
  }
  if (Object.prototype.hasOwnProperty.call(update, 'endDate') && update.endDate === undefined) {
    delete next.endDate;
  }

  return next;
};

const expenseDataReducer = (
  state: ExpenseDataState,
  action: ExpenseDataAction,
): ExpenseDataState => {
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
        exportQueue: action.payload.exportQueue,
        settings: action.payload.settings,
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
        expenses: state.expenses.filter(expense => expense.id !== action.payload),
      };
    case 'categories/set-all':
      return {
        ...state,
        categories: action.payload,
      };
    case 'exportQueue/set-all':
      return {
        ...state,
        exportQueue: action.payload,
      };
    case 'exportQueue/add':
      return {
        ...state,
        exportQueue: [action.payload, ...state.exportQueue],
      };
    case 'exportQueue/update':
      return {
        ...state,
        exportQueue: state.exportQueue.map(item => (item.id === action.payload.id ? action.payload : item)),
      };
    case 'exportQueue/remove':
      return {
        ...state,
        exportQueue: state.exportQueue.filter(item => item.id !== action.payload),
      };
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
    case 'biometric/lock':
      return {
        ...state,
        biometric: {
          isLocked: true,
          lastError: null,
        },
      };
    case 'biometric/unlock':
      return {
        ...state,
        biometric: {
          isLocked: false,
          lastError: null,
        },
      };
    case 'biometric/error':
      return {
        ...state,
        biometric: {
          ...state.biometric,
          lastError: action.payload,
        },
      };
    default:
      return state;
  }
};

const ensureBiometricCredential = async (): Promise<void> => {
  try {
    await Keychain.resetGenericPassword({ service: BIOMETRIC_KEYCHAIN_SERVICE });
  } catch {
    // ignore reset errors
  }
  try {
    await Keychain.setGenericPassword('expense-tracker', 'biometric-lock', {
      service: BIOMETRIC_KEYCHAIN_SERVICE,
      accessControl: Keychain.ACCESS_CONTROL.BIOMETRY_CURRENT_SET,
      accessible: Keychain.ACCESSIBLE.WHEN_PASSCODE_SET_THIS_DEVICE_ONLY,
      securityLevel: Keychain.SECURITY_LEVEL.SECURE_HARDWARE,
    });
  } catch (error) {
    await Keychain.resetGenericPassword({ service: BIOMETRIC_KEYCHAIN_SERVICE });
    throw error;
  }
};

const applyFilters = (expenses: ExpenseRecord[], filters: ExpenseFilters): ExpenseRecord[] => {
  if (!expenses.length) {
    return expenses;
  }

  const hasCategoryFilter = Object.prototype.hasOwnProperty.call(filters, 'categoryId');
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
    };
  }

  const rawBaseAmount = expenses.reduce((total, expense) => total + expense.baseAmount, 0);
  const baseAmount = bankersRound(rawBaseAmount, 2);
  const categoryTotals = new Map<number | null, number>();

  expenses.forEach(expense => {
    const key = expense.categoryId ?? null;
    const current = categoryTotals.get(key) ?? 0;
    categoryTotals.set(key, current + expense.baseAmount);
  });

  const byCategory: TotalsByCategory[] = Array.from(categoryTotals.entries()).map(
    ([categoryId, value]) => ({
      categoryId,
      rawTotal: value,
      total: bankersRound(value, 2),
    }),
  );

  return {
    rawBaseAmount,
    baseAmount,
    byCategory,
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

export const ExpenseDataProvider: React.FC<React.PropsWithChildren> = ({ children }) => {
  const [state, dispatch] = useReducer(expenseDataReducer, initialState);
  const theme = useTheme();
  const lastBackgroundAtRef = useRef<number | null>(null);

  const syncExportQueue = useCallback(async () => {
    const records = await withDatabase(db => dbListExportQueue(db));
    dispatch({ type: 'exportQueue/set-all', payload: mapExportQueueRecords(records) });
  }, [dispatch]);

  const loadFromDatabase = useCallback(async () => {
    dispatch({ type: 'load/start' });
    try {
      const snapshot = await withDatabase(async db => {
        const [expenses, categories, settings, exportQueueRecords] = await Promise.all([
          dbListExpenses(db),
          dbListCategories(db),
          dbGetAllSettings(db),
          dbListExportQueue(db),
        ]);
        return { expenses, categories, settings, exportQueueRecords };
      });

      dispatch({
        type: 'load/success',
        payload: {
          expenses: snapshot.expenses,
          categories: snapshot.categories,
          settings: parseSettings(snapshot.settings),
          exportQueue: mapExportQueueRecords(snapshot.exportQueueRecords),
        },
      });
    } catch (error) {
      dispatch({ type: 'load/error', payload: toErrorMessage(error) });
    }
  }, [dispatch]);

  useEffect(() => {
    void loadFromDatabase();
  }, [loadFromDatabase]);

  const createExpense = useCallback<ExpenseDataActions['createExpense']>(
    async payload => {
      dispatch({ type: 'operation/start' });
      try {
        const expense = await withDatabase(db => dbCreateExpense(db, payload));
        dispatch({ type: 'expense/add', payload: expense });
        return expense;
      } catch (error) {
        dispatch({ type: 'operation/error', payload: toErrorMessage(error) });
        throw toError(error);
      } finally {
        dispatch({ type: 'operation/end' });
      }
    },
  );

  const updateExpense = useCallback<ExpenseDataActions['updateExpense']>(
    async payload => {
      dispatch({ type: 'operation/start' });
      try {
        const expense = await withDatabase(db => dbUpdateExpense(db, payload));
        dispatch({ type: 'expense/update', payload: expense });
        return expense;
      } catch (error) {
        dispatch({ type: 'operation/error', payload: toErrorMessage(error) });
        throw toError(error);
      } finally {
        dispatch({ type: 'operation/end' });
      }
    },
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
  );

  const setBaseCurrency = useCallback<ExpenseDataActions['setBaseCurrency']>(
    async currencyCode => {
      dispatch({ type: 'operation/start' });
      try {
        await withDatabase(db => dbSetSetting(db, BASE_CURRENCY_KEY, currencyCode));
        dispatch({ type: 'settings/set-base-currency', payload: currencyCode });
      } catch (error) {
        dispatch({ type: 'operation/error', payload: toErrorMessage(error) });
        throw toError(error);
      } finally {
        dispatch({ type: 'operation/end' });
      }
    },
  );

  const setBiometricGateEnabled = useCallback<ExpenseDataActions['setBiometricGateEnabled']>(
    async enabled => {
      dispatch({ type: 'operation/start' });
      try {
        if (enabled) {
          await ensureBiometricCredential();
        } else {
          try {
            await Keychain.resetGenericPassword({ service: BIOMETRIC_KEYCHAIN_SERVICE });
          } catch {
            // ignore reset failures
          }
          lastBackgroundAtRef.current = null;
          biometricPromptInFlightRef.current = false;
          dispatch({ type: 'biometric/unlock' });
          dispatch({ type: 'biometric/error', payload: null });
        }
        await withDatabase(db => dbSetSetting(db, BIOMETRIC_GATE_KEY, enabled ? 'true' : 'false'));
        dispatch({ type: 'settings/set-biometric', payload: enabled });
        if (enabled) {
          lastBackgroundAtRef.current = Date.now();
          biometricPromptInFlightRef.current = false;
          dispatch({ type: 'biometric/unlock' });
          dispatch({ type: 'biometric/error', payload: null });
        }
      } catch (error) {
        dispatch({ type: 'operation/error', payload: toErrorMessage(error) });
        throw toError(error);
      } finally {
        dispatch({ type: 'operation/end' });
      }
    },
  );

  const setDriveFolderId = useCallback<ExpenseDataActions['setDriveFolderId']>(
    async folderId => {
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
    },
  );

  const unlockWithBiometrics = useCallback<ExpenseDataActions['unlockWithBiometrics']>(async () => {
    if (!state.settings.biometricGateEnabled) {
      dispatch({ type: 'biometric/unlock' });
      return true;
    }
    try {
      const credentials = await Keychain.getGenericPassword({
        service: BIOMETRIC_KEYCHAIN_SERVICE,
        authenticationPrompt: {
          title: 'Unlock Expense Tracker',
          subtitle: 'Authenticate to continue',
          description: 'Use biometrics or device credentials',
        },
      });
      const success = Boolean(credentials);
      if (success) {
        dispatch({ type: 'biometric/unlock' });
        dispatch({ type: 'biometric/error', payload: null });
      } else {
        dispatch({ type: 'biometric/error', payload: 'Authentication cancelled. Tap Try again to retry.' });
      }
      return success;
    } catch (error) {
      dispatch({ type: 'biometric/error', payload: toErrorMessage(error) });
      return false;
    }
  }, [dispatch, state.settings.biometricGateEnabled]);

  const setFilters = useCallback<ExpenseDataActions['setFilters']>(filters => {
    dispatch({ type: 'filters/set', payload: filters });
  }, []);

  const clearFilters = useCallback(() => {
    dispatch({ type: 'filters/clear' });
  }, []);

  const clearError = useCallback(() => {
    dispatch({ type: 'error/clear' });
    dispatch({ type: 'biometric/error', payload: null });
  }, []);

  const isUploadingExportsRef = useRef(false);
  const isOnlineRef = useRef(false);
  const biometricPromptInFlightRef = useRef(false);
  const [isOnline, setIsOnline] = useState(false);

  const runDriveUpload = useCallback(
    async (options: { interactive?: boolean; silent?: boolean } = {}): Promise<UploadPendingExportsResult | null> => {
      if (isUploadingExportsRef.current) {
        return null;
      }
      isUploadingExportsRef.current = true;
      try {
        const result = await uploadPendingExports({ interactive: options.interactive ?? false });
        if (result.updatedFolderId !== undefined) {
          dispatch({ type: 'settings/set-drive-folder', payload: result.updatedFolderId });
        }
        await syncExportQueue();
        return result;
      } catch (error) {
        await syncExportQueue();
        if (options.silent) {
          console.error('Drive upload failed', error);
          return null;
        }
        throw toError(error);
      } finally {
        isUploadingExportsRef.current = false;
      }
    },
    [dispatch, syncExportQueue],
  );

  const uploadQueuedExports = useCallback<ExpenseDataActions['uploadQueuedExports']>(
    async options => runDriveUpload({ interactive: options?.interactive ?? false, silent: false }),
    [runDriveUpload],
  );

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(stateInfo => {
      const online = Boolean(stateInfo.isConnected && (stateInfo.isInternetReachable ?? true));
      isOnlineRef.current = online;
      setIsOnline(online);
    });
    return unsubscribe;
  }, []);

  useEffect(() => {
    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        const last = lastBackgroundAtRef.current;
        if (state.settings.biometricGateEnabled && last !== null) {
          const elapsed = Date.now() - last;
          if (elapsed >= BIOMETRIC_TIMEOUT_MS) {
            dispatch({ type: 'biometric/lock' });
          }
        }
        lastBackgroundAtRef.current = null;
      } else if (nextState === 'background' || nextState === 'inactive') {
        lastBackgroundAtRef.current = Date.now();
      }
    };
    const subscription = AppState.addEventListener('change', handleAppStateChange);
    return () => subscription.remove();
  }, [dispatch, state.settings.biometricGateEnabled]);

  useEffect(() => {
    if (!state.settings.biometricGateEnabled) {
      return;
    }
    if (!state.biometric.isLocked || state.biometric.lastError) {
      return;
    }
    if (biometricPromptInFlightRef.current) {
      return;
    }
    biometricPromptInFlightRef.current = true;
    void (async () => {
      await unlockWithBiometrics();
      biometricPromptInFlightRef.current = false;
    })();
  }, [state.biometric.isLocked, state.biometric.lastError, state.settings.biometricGateEnabled, unlockWithBiometrics]);

  const queueExport = useCallback<ExpenseDataActions['queueExport']>(async () => {
    if (!state.isInitialised) {
      throw new Error('Data is not ready yet. Try again shortly.');
    }
    dispatch({ type: 'operation/start' });
    try {
      const { filename, filePath } = await writeExportFile({
        expenses: state.expenses,
        categories: state.categories,
      });
      await withDatabase(db =>
        dbInsertExportQueueItem(db, {
          id: generateExportQueueId(),
          filename,
          filePath,
          status: 'pending',
          lastError: null,
        }),
      );
      await syncExportQueue();
      if (isOnlineRef.current) {
        void runDriveUpload({ interactive: false, silent: true });
      }
    } catch (error) {
      dispatch({ type: 'operation/error', payload: toErrorMessage(error) });
      throw toError(error);
    } finally {
      dispatch({ type: 'operation/end' });
    }
  }, [dispatch, runDriveUpload, state.categories, state.expenses, state.isInitialised, syncExportQueue]);

  const retryExport = useCallback<ExpenseDataActions['retryExport']>(
    async id => {
      const existing = state.exportQueue.find(item => item.id === id);
      if (!existing) {
        throw new Error('Export item not found.');
      }
      dispatch({ type: 'operation/start' });
      try {
        let targetFilename = existing.filename;
        let targetFilePath = existing.filePath;
        const fileExists = await RNFS.exists(existing.filePath);

        if (!fileExists) {
          const regenerated = await writeExportFile({
            expenses: state.expenses,
            categories: state.categories,
          });
          targetFilename = regenerated.filename;
          targetFilePath = regenerated.filePath;
        }

        await withDatabase(db =>
          dbUpdateExportQueueStatus(db, id, 'pending', {
            lastError: null,
            uploadedAt: null,
            driveFileId: null,
            filePath: targetFilePath,
            filename: targetFilename,
          }),
        );

        if (!fileExists && existing.filePath !== targetFilePath) {
          await removeQueueFileIfExists(existing.filePath);
        }

        await syncExportQueue();
        if (isOnlineRef.current) {
          void runDriveUpload({ interactive: false, silent: true });
        }
      } catch (error) {
        dispatch({ type: 'operation/error', payload: toErrorMessage(error) });
        throw toError(error);
      } finally {
        dispatch({ type: 'operation/end' });
      }
    },
    [dispatch, runDriveUpload, state.categories, state.expenses, state.exportQueue, syncExportQueue],
  );

  const removeExport = useCallback<ExpenseDataActions['removeExport']>(
    async id => {
      const existing = state.exportQueue.find(item => item.id === id);
      dispatch({ type: 'operation/start' });
      try {
        await withDatabase(db => dbRemoveExportQueueItem(db, id));
        if (existing) {
          await removeQueueFileIfExists(existing.filePath);
        }
        await syncExportQueue();
      } catch (error) {
        dispatch({ type: 'operation/error', payload: toErrorMessage(error) });
        throw toError(error);
      } finally {
        dispatch({ type: 'operation/end' });
      }
    },
    [dispatch, state.exportQueue, syncExportQueue],
  );

  const clearCompletedExports = useCallback<ExpenseDataActions['clearCompletedExports']>(async () => {
    const removable = state.exportQueue.filter(
      item => item.status === 'completed' || item.status === 'failed',
    );
    if (!removable.length) {
      return;
    }

    dispatch({ type: 'operation/start' });
    try {
      await withDatabase(db => dbClearCompletedExportQueueItems(db));
      await Promise.all(removable.map(item => removeQueueFileIfExists(item.filePath)));
      await syncExportQueue();
    } catch (error) {
      dispatch({ type: 'operation/error', payload: toErrorMessage(error) });
      throw toError(error);
    } finally {
      dispatch({ type: 'operation/end' });
    }
  }, [dispatch, state.exportQueue, syncExportQueue]);

  const refresh = useCallback(() => loadFromDatabase(), [loadFromDatabase]);

  useEffect(() => {
    if (!isOnline) {
      return;
    }
    if (!state.exportQueue.some(item => item.status === 'pending')) {
      return;
    }
    void runDriveUpload({ interactive: false, silent: true });
  }, [isOnline, runDriveUpload, state.exportQueue]);

  const filteredExpenses = useMemo(
    () => applyFilters(state.expenses, state.filters),
    [state.expenses, state.filters],
  );

  const totals = useMemo(() => calculateTotals(filteredExpenses), [filteredExpenses]);

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

  const biometricModalContainerStyle = useMemo(
    () => ({
      backgroundColor: theme.colors.surface,
      marginHorizontal: 24,
      padding: 24,
      borderRadius: 16,
      elevation: 6,
    }),
    [theme.colors.surface],
  );

  const value = useMemo<ExpenseDataContextValue>(
    () => ({
      state,
      actions,
      selectors,
    }),
    [state, actions, selectors],
  );

  return (
    <ExpenseDataContext.Provider value={value}>
      {children}
      {state.settings.biometricGateEnabled && state.biometric.isLocked ? (
        <Portal>
          <Modal visible dismissable={false} contentContainerStyle={biometricModalContainerStyle}>
            <Text variant="titleLarge" style={{ marginBottom: 12 }}>Unlock required</Text>
            <Text variant="bodyMedium" style={{ marginBottom: 16 }}>
              Authenticate with biometrics or your device credentials to continue.
            </Text>
            {state.biometric.lastError ? (
              <Text variant="bodySmall" style={{ color: theme.colors.error, marginBottom: 16 }}>
                {state.biometric.lastError}
              </Text>
            ) : null}
            <Button mode="contained" onPress={() => void unlockWithBiometrics()}>
              Try again
            </Button>
          </Modal>
        </Portal>
      ) : null}
    </ExpenseDataContext.Provider>
  );
};

export const useExpenseData = (): ExpenseDataContextValue => {
  const context = useContext(ExpenseDataContext);
  if (!context) {
    throw new Error('useExpenseData must be used within ExpenseDataProvider');
  }
  return context;
};

export const AppProvider = ExpenseDataProvider;
export const useAppContext = useExpenseData;
