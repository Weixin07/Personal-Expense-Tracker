import {
  expenseDataReducer,
  initialState,
  type ExpenseDataAction,
} from '../AppContext';
import type { ExpenseRecord, CategoryRecord } from '../../database';

const makeExpense = (
  overrides: Partial<ExpenseRecord> = {},
): ExpenseRecord => ({
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
  ...overrides,
});

const makeCategory = (
  overrides: Partial<CategoryRecord> = {},
): CategoryRecord => ({
  id: 1,
  name: 'Food',
  createdAt: '2025-01-10T00:00:00.000Z',
  updatedAt: '2025-01-10T00:00:00.000Z',
  ...overrides,
});

describe('expenseDataReducer', () => {
  describe('load lifecycle', () => {
    it('load/start sets loading and clears error', () => {
      const next = expenseDataReducer(
        { ...initialState, error: 'boom' },
        { type: 'load/start' },
      );
      expect(next.isLoading).toBe(true);
      expect(next.error).toBeNull();
    });

    it('load/success populates data and marks initialised', () => {
      const payload = {
        expenses: [makeExpense()],
        categories: [makeCategory()],
        settings: {
          baseCurrency: 'USD',
          biometricGateEnabled: true,
          biometricCredentialVersion: 2,
          driveFolderId: 'folder-1',
          exportDirectoryUri: 'content://dir',
        },
        fxRateCache: [],
      };
      const next = expenseDataReducer(
        { ...initialState, isLoading: true },
        { type: 'load/success', payload },
      );
      expect(next.expenses).toEqual(payload.expenses);
      expect(next.categories).toEqual(payload.categories);
      expect(next.settings).toEqual(payload.settings);
      expect(next.isInitialised).toBe(true);
      expect(next.isLoading).toBe(false);
      expect(next.error).toBeNull();
    });

    it('load/error records the message and stops loading', () => {
      const next = expenseDataReducer(
        { ...initialState, isLoading: true },
        {
          type: 'load/error',
          payload: { error: 'db failed', biometricGateEnabled: false },
        },
      );
      expect(next.error).toBe('db failed');
      expect(next.isInitialised).toBe(true);
      expect(next.isLoading).toBe(false);
    });

    it('load/error applies the fail-closed biometric flag', () => {
      const next = expenseDataReducer(
        { ...initialState, isLoading: true },
        {
          type: 'load/error',
          payload: { error: 'db failed', biometricGateEnabled: true },
        },
      );
      expect(next.settings.biometricGateEnabled).toBe(true);
    });
  });

  describe('operation lifecycle', () => {
    it('operation/start sets loading and clears error', () => {
      const next = expenseDataReducer(
        { ...initialState, error: 'old' },
        { type: 'operation/start' },
      );
      expect(next.isLoading).toBe(true);
      expect(next.error).toBeNull();
    });

    it('operation/end stops loading', () => {
      const next = expenseDataReducer(
        { ...initialState, isLoading: true },
        { type: 'operation/end' },
      );
      expect(next.isLoading).toBe(false);
    });

    it('operation/error records the message and stops loading', () => {
      const next = expenseDataReducer(
        { ...initialState, isLoading: true },
        { type: 'operation/error', payload: 'nope' },
      );
      expect(next.error).toBe('nope');
      expect(next.isLoading).toBe(false);
    });

    it('error/clear nulls the error', () => {
      const next = expenseDataReducer(
        { ...initialState, error: 'boom' },
        { type: 'error/clear' },
      );
      expect(next.error).toBeNull();
    });
  });

  describe('filters', () => {
    it('filters/set merges into existing filters', () => {
      const next = expenseDataReducer(
        { ...initialState, filters: { startDate: '2025-01-01' } },
        { type: 'filters/set', payload: { categoryId: 5 } },
      );
      expect(next.filters).toEqual({ startDate: '2025-01-01', categoryId: 5 });
    });

    it('filters/set deletes categoryId when explicitly undefined', () => {
      const next = expenseDataReducer(
        {
          ...initialState,
          filters: { categoryId: 5, startDate: '2025-01-01' },
        },
        { type: 'filters/set', payload: { categoryId: undefined } },
      );
      expect(next.filters).not.toHaveProperty('categoryId');
      expect(next.filters.startDate).toBe('2025-01-01');
    });

    it('filters/set deletes startDate when explicitly undefined', () => {
      const next = expenseDataReducer(
        { ...initialState, filters: { startDate: '2025-01-01' } },
        { type: 'filters/set', payload: { startDate: undefined } },
      );
      expect(next.filters).not.toHaveProperty('startDate');
    });

    it('filters/set deletes endDate when explicitly undefined', () => {
      const next = expenseDataReducer(
        { ...initialState, filters: { endDate: '2025-01-31' } },
        { type: 'filters/set', payload: { endDate: undefined } },
      );
      expect(next.filters).not.toHaveProperty('endDate');
    });

    it('filters/clear resets to empty', () => {
      const next = expenseDataReducer(
        { ...initialState, filters: { categoryId: 1 } },
        { type: 'filters/clear' },
      );
      expect(next.filters).toEqual({});
    });
  });

  describe('expenses', () => {
    it('expenses/set-all replaces the list', () => {
      const expenses = [makeExpense({ id: 9 })];
      const next = expenseDataReducer(initialState, {
        type: 'expenses/set-all',
        payload: expenses,
      });
      expect(next.expenses).toEqual(expenses);
    });

    it('expense/add prepends', () => {
      const existing = makeExpense({ id: 1 });
      const added = makeExpense({ id: 2 });
      const next = expenseDataReducer(
        { ...initialState, expenses: [existing] },
        { type: 'expense/add', payload: added },
      );
      expect(next.expenses).toEqual([added, existing]);
    });

    it('expense/update replaces matching id only', () => {
      const a = makeExpense({ id: 1, description: 'A' });
      const b = makeExpense({ id: 2, description: 'B' });
      const updated = makeExpense({ id: 2, description: 'B2' });
      const next = expenseDataReducer(
        { ...initialState, expenses: [a, b] },
        { type: 'expense/update', payload: updated },
      );
      expect(next.expenses).toEqual([a, updated]);
    });

    it('expense/delete removes matching id', () => {
      const a = makeExpense({ id: 1 });
      const b = makeExpense({ id: 2 });
      const next = expenseDataReducer(
        { ...initialState, expenses: [a, b] },
        { type: 'expense/delete', payload: 1 },
      );
      expect(next.expenses).toEqual([b]);
    });
  });

  describe('categories', () => {
    it('categories/set-all replaces the list', () => {
      const categories = [makeCategory({ id: 3, name: 'Travel' })];
      const next = expenseDataReducer(initialState, {
        type: 'categories/set-all',
        payload: categories,
      });
      expect(next.categories).toEqual(categories);
    });
  });

  describe('settings', () => {
    it('settings/set-base-currency updates only baseCurrency', () => {
      const next = expenseDataReducer(initialState, {
        type: 'settings/set-base-currency',
        payload: 'EUR',
      });
      expect(next.settings.baseCurrency).toBe('EUR');
      expect(next.settings.biometricGateEnabled).toBe(false);
    });

    it('settings/set-biometric updates only biometricGateEnabled', () => {
      const next = expenseDataReducer(initialState, {
        type: 'settings/set-biometric',
        payload: true,
      });
      expect(next.settings.biometricGateEnabled).toBe(true);
    });

    it('settings/set-cred-version updates only biometricCredentialVersion', () => {
      const next = expenseDataReducer(initialState, {
        type: 'settings/set-cred-version',
        payload: 2,
      });
      expect(next.settings.biometricCredentialVersion).toBe(2);
    });

    it('settings/set-drive-folder updates only driveFolderId', () => {
      const next = expenseDataReducer(initialState, {
        type: 'settings/set-drive-folder',
        payload: 'folder-9',
      });
      expect(next.settings.driveFolderId).toBe('folder-9');
    });

    it('settings/set-export-directory updates only exportDirectoryUri', () => {
      const next = expenseDataReducer(initialState, {
        type: 'settings/set-export-directory',
        payload: 'content://dir',
      });
      expect(next.settings.exportDirectoryUri).toBe('content://dir');
    });
  });

  it('returns the same state for an unknown action', () => {
    const next = expenseDataReducer(initialState, {
      type: 'totally/unknown',
    } as unknown as ExpenseDataAction);
    expect(next).toBe(initialState);
  });

  it('does not mutate the input state', () => {
    const state = { ...initialState, expenses: [] };
    expenseDataReducer(state, { type: 'expense/add', payload: makeExpense() });
    expect(state.expenses).toEqual([]);
  });
});
