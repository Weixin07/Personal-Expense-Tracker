import React from 'react';
import { render, type RenderOptions } from '@testing-library/react-native';
import { MD3LightTheme, Provider as PaperProvider } from 'react-native-paper';
import type {
  TransactionDataActions,
  TransactionDataContextValue,
  TransactionDataSelectors,
  TransactionDataState,
} from '../../context/AppContext';
import { makeImportSummary } from './importFixtures';
import type { FundRecord } from '../../database';
import { EMPTY_CATEGORY_USAGE_COUNTS } from '../../utils/suggestions';

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

export const makeFund = (overrides: Partial<FundRecord> = {}): FundRecord => ({
  id: 1,
  name: 'General',
  currencyCode: null,
  openingBalance: 0,
  notes: null,
  createdAt: '2025-01-01T00:00:00.000Z',
  updatedAt: '2025-01-01T00:00:00.000Z',
  ...overrides,
});

export type StateOverrides = Partial<Omit<TransactionDataState, 'settings'>> & {
  settings?: Partial<TransactionDataState['settings']>;
};

export const makeContextState = (
  overrides: StateOverrides = {},
): TransactionDataState => {
  const { settings, ...rest } = overrides;
  return {
    transactions: [],
    categories: [],
    // Seeding and the schema together guarantee a fund always exists, so a
    // fixture with none would exercise a state the app cannot reach.
    funds: [makeFund()],
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
      biometricCredentialVersion: 0,
      driveFolderId: null,
      exportDirectoryUri: null,
      ...settings,
    },
  };
};

export const makeContextSelectors = (
  overrides: Partial<TransactionDataSelectors> = {},
): TransactionDataSelectors => ({
  filteredTransactions: [],
  totals: [],
  fundBalances: [],
  suspectTransferIds: new Set<number>(),
  hasActiveFilters: false,
  categoryUsageCounts: EMPTY_CATEGORY_USAGE_COUNTS,
  ...overrides,
});

export const makeContextActions = (
  overrides: Partial<TransactionDataActions> = {},
): TransactionDataActions => ({
  refresh: jest.fn().mockResolvedValue(undefined),
  createTransaction: jest.fn().mockResolvedValue(undefined),
  updateTransaction: jest.fn().mockResolvedValue(undefined),
  deleteTransaction: jest.fn().mockResolvedValue(undefined),
  createCategory: jest.fn().mockResolvedValue(undefined),
  updateCategory: jest.fn().mockResolvedValue(undefined),
  deleteCategory: jest.fn().mockResolvedValue(undefined),
  createFund: jest.fn().mockResolvedValue(undefined),
  updateFund: jest.fn().mockResolvedValue(undefined),
  deleteFund: jest.fn().mockResolvedValue(undefined),
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
  importTransactions: jest.fn().mockResolvedValue(makeImportSummary()),
  unlockWithBiometrics: jest.fn().mockResolvedValue(true),
  ...overrides,
});

export const makeContextValue = (
  overrides: Partial<{
    state: StateOverrides;
    selectors: Partial<TransactionDataSelectors>;
    actions: Partial<TransactionDataActions>;
  }> = {},
): TransactionDataContextValue => ({
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
