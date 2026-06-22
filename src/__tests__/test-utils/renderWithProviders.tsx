import React from 'react';
import { render, type RenderOptions } from '@testing-library/react-native';
import { MD3LightTheme, Provider as PaperProvider } from 'react-native-paper';
import type {
  ExpenseDataActions,
  ExpenseDataContextValue,
  ExpenseDataSelectors,
  ExpenseDataState,
} from '../../context/AppContext';

// react-native maps requestAnimationFrame to setTimeout; Paper's transition
// animations would otherwise leave timers that fire after env teardown. Fake
// timers (scoped to files that render via this helper) keep those off the real
// event loop. Perf/reducer suites that do not import this helper keep real timers.
jest.useFakeTimers();
afterEach(() => {
  jest.clearAllTimers();
});

const testTheme = {
  ...MD3LightTheme,
  animation: { ...MD3LightTheme.animation, scale: 0 },
};

const AllProviders: React.FC<React.PropsWithChildren> = ({ children }) => (
  <PaperProvider theme={testTheme}>{children}</PaperProvider>
);

export const renderWithProviders = (
  ui: React.ReactElement,
  options?: Omit<RenderOptions, 'wrapper'>,
) => render(ui, { wrapper: AllProviders, ...options });

export type StateOverrides = Partial<Omit<ExpenseDataState, 'settings'>> & {
  settings?: Partial<ExpenseDataState['settings']>;
};

export const makeContextState = (
  overrides: StateOverrides = {},
): ExpenseDataState => {
  const { settings, ...rest } = overrides;
  return {
    expenses: [],
    categories: [],
    exportQueue: [],
    fxRateCache: [],
    filters: {},
    isInitialised: true,
    isLoading: false,
    error: null,
    biometric: { isLocked: false, lastError: null },
    ...rest,
    settings: {
      baseCurrency: 'USD',
      biometricGateEnabled: false,
      driveFolderId: null,
      exportDirectoryUri: null,
      ...settings,
    },
  };
};

export const makeContextSelectors = (
  overrides: Partial<ExpenseDataSelectors> = {},
): ExpenseDataSelectors => ({
  filteredExpenses: [],
  totals: {
    rawBaseAmount: 0,
    baseAmount: 0,
    byCategory: [],
    byBaseCurrency: [],
    mixedBase: false,
  },
  hasActiveFilters: false,
  ...overrides,
});

export const makeContextActions = (
  overrides: Partial<ExpenseDataActions> = {},
): ExpenseDataActions => ({
  refresh: jest.fn().mockResolvedValue(undefined),
  createExpense: jest.fn().mockResolvedValue(undefined),
  updateExpense: jest.fn().mockResolvedValue(undefined),
  deleteExpense: jest.fn().mockResolvedValue(undefined),
  createCategory: jest.fn().mockResolvedValue(undefined),
  updateCategory: jest.fn().mockResolvedValue(undefined),
  deleteCategory: jest.fn().mockResolvedValue(undefined),
  setBaseCurrency: jest.fn().mockResolvedValue(undefined),
  setBiometricGateEnabled: jest.fn().mockResolvedValue(undefined),
  setDriveFolderId: jest.fn().mockResolvedValue(undefined),
  setExportDirectoryUri: jest.fn().mockResolvedValue(undefined),
  setFilters: jest.fn(),
  clearFilters: jest.fn(),
  clearError: jest.fn(),
  queueExport: jest.fn().mockResolvedValue(undefined),
  retryExport: jest.fn().mockResolvedValue(undefined),
  removeExport: jest.fn().mockResolvedValue(undefined),
  clearCompletedExports: jest.fn().mockResolvedValue(undefined),
  uploadQueuedExports: jest.fn().mockResolvedValue(null),
  unlockWithBiometrics: jest.fn().mockResolvedValue(true),
  ...overrides,
});

export const makeContextValue = (
  overrides: Partial<{
    state: StateOverrides;
    selectors: Partial<ExpenseDataSelectors>;
    actions: Partial<ExpenseDataActions>;
  }> = {},
): ExpenseDataContextValue => ({
  state: makeContextState(overrides.state),
  selectors: makeContextSelectors(overrides.selectors),
  actions: makeContextActions(overrides.actions),
});

export const createNavigationMock = () => ({
  navigate: jest.fn(),
  goBack: jest.fn(),
  setOptions: jest.fn(),
  addListener: jest.fn(() => jest.fn()),
});

export * from '@testing-library/react-native';
