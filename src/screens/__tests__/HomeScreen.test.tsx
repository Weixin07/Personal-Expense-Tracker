import React from 'react';
import {
  renderWithProviders,
  makeContextValue,
  screen,
  fireEvent,
  waitFor,
} from '../../__tests__/test-utils/renderWithProviders';
import type { CategoryRecord } from '../../database';
import HomeScreen from '../HomeScreen';
import { useExpenseData } from '../../context/AppContext';
import type { ExpenseRecord } from '../../database';

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate, goBack: jest.fn() }),
}));

jest.mock('../../context/AppContext', () => ({
  useExpenseData: jest.fn(),
}));

const mockedUseExpenseData = useExpenseData as unknown as jest.Mock;

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

beforeEach(() => {
  mockNavigate.mockClear();
  mockedUseExpenseData.mockReturnValue(makeContextValue());
});

describe('HomeScreen', () => {
  it('renders the overview header and totals', () => {
    renderWithProviders(<HomeScreen />);
    expect(screen.getByText('Expense Overview')).toBeOnTheScreen();
    expect(screen.getByText(/Base currency:/)).toBeOnTheScreen();
  });

  it('shows the loading spinner before initialisation', () => {
    mockedUseExpenseData.mockReturnValue(
      makeContextValue({ state: { isInitialised: false, isLoading: true } }),
    );
    renderWithProviders(<HomeScreen />);
    expect(screen.queryByText('Expense Overview')).toBeNull();
  });

  it('shows the empty state when initialised with no expenses', () => {
    renderWithProviders(<HomeScreen />);
    expect(screen.getByText('No expenses found')).toBeOnTheScreen();
  });

  it('renders the payee as the row title when expenses are present', () => {
    const expense = makeExpense({ payee: 'Corner Cafe', description: 'Lunch' });
    mockedUseExpenseData.mockReturnValue(
      makeContextValue({
        state: { expenses: [expense] },
        selectors: { filteredExpenses: [expense] },
      }),
    );
    renderWithProviders(<HomeScreen />);
    expect(screen.getByText('Corner Cafe')).toBeOnTheScreen();
  });

  it('falls back to the description for the title when payee is blank', () => {
    const expense = makeExpense({ payee: '', description: 'Lunch' });
    mockedUseExpenseData.mockReturnValue(
      makeContextValue({
        state: { expenses: [expense] },
        selectors: { filteredExpenses: [expense] },
      }),
    );
    renderWithProviders(<HomeScreen />);
    expect(screen.getByText('Lunch')).toBeOnTheScreen();
  });

  it('shows a placeholder title when payee and description are both blank', () => {
    const expense = makeExpense({ payee: '', description: '' });
    mockedUseExpenseData.mockReturnValue(
      makeContextValue({
        state: { expenses: [expense] },
        selectors: { filteredExpenses: [expense] },
      }),
    );
    renderWithProviders(<HomeScreen />);
    expect(screen.getByText('(no payee)')).toBeOnTheScreen();
  });

  it('navigates to AddExpense when the add button is pressed', () => {
    renderWithProviders(<HomeScreen />);
    fireEvent.press(screen.getAllByText('Add expense')[0]);
    expect(mockNavigate).toHaveBeenCalledWith('AddExpense');
  });

  it('applies a preset filter when a quick-filter chip is pressed', () => {
    const setFilters = jest.fn();
    mockedUseExpenseData.mockReturnValue(
      makeContextValue({ actions: { setFilters } }),
    );
    renderWithProviders(<HomeScreen />);
    fireEvent.press(screen.getByLabelText('Filter Last 7 days'));
    expect(setFilters).toHaveBeenCalled();
  });

  it('opens the base-currency dialog on first run when no currency is set', () => {
    mockedUseExpenseData.mockReturnValue(
      makeContextValue({ state: { settings: { baseCurrency: null } } }),
    );
    renderWithProviders(<HomeScreen />);
    expect(screen.getByText('Choose base currency')).toBeOnTheScreen();
  });

  it('refreshes, resets filters, filters by category, opens a row and the queue', async () => {
    const refresh = jest.fn().mockResolvedValue(undefined);
    const setFilters = jest.fn();
    const category: CategoryRecord = {
      id: 1,
      name: 'Food',
      createdAt: '2025-01-10T00:00:00.000Z',
      updatedAt: '2025-01-10T00:00:00.000Z',
    };
    const expense = makeExpense({
      id: 7,
      payee: 'Bean Bar',
      description: 'Coffee',
      categoryId: 1,
    });
    mockedUseExpenseData.mockReturnValue(
      makeContextValue({
        state: {
          expenses: [expense],
          categories: [category],
          filters: { categoryId: 1 },
          exportQueue: Array.from({ length: 6 }, (_, index) => ({
            id: `e${index}`,
            filename: 'f.csv',
            filePath: 'p',
            status: 'pending' as const,
            createdAt: '2025-01-10T00:00:00.000Z',
            updatedAt: '2025-01-10T00:00:00.000Z',
          })),
        },
        selectors: { filteredExpenses: [expense], hasActiveFilters: true },
        actions: { refresh, setFilters },
      }),
    );
    renderWithProviders(<HomeScreen />);

    fireEvent.press(screen.getByLabelText('Refresh expenses'));
    await waitFor(() => expect(refresh).toHaveBeenCalled());

    fireEvent.press(screen.getByLabelText('Reset filters'));
    expect(setFilters).toHaveBeenCalled();

    fireEvent.press(screen.getByLabelText('Filter by category'));
    fireEvent.press(screen.getByLabelText('Select Food'));
    expect(setFilters).toHaveBeenCalledWith({ categoryId: 1 });

    fireEvent.press(screen.getByLabelText('Open expense Bean Bar'));
    expect(mockNavigate).toHaveBeenCalledWith('AddExpense', { expenseId: 7 });

    fireEvent.press(screen.getByLabelText('View export queue'));
    expect(mockNavigate).toHaveBeenCalledWith('ExportQueue');
  });

  it('selects a base currency on first run', async () => {
    const setBaseCurrency = jest.fn().mockResolvedValue(undefined);
    mockedUseExpenseData.mockReturnValue(
      makeContextValue({
        state: { settings: { baseCurrency: null } },
        actions: { setBaseCurrency },
      }),
    );
    renderWithProviders(<HomeScreen />);
    fireEvent.changeText(screen.getByLabelText('Search currency'), 'EUR');
    fireEvent.press(screen.getByText('EUR'));
    await waitFor(() => expect(setBaseCurrency).toHaveBeenCalledWith('EUR'));
  });

  it('shows the pending-export banner when many exports are queued', () => {
    mockedUseExpenseData.mockReturnValue(
      makeContextValue({
        state: {
          exportQueue: Array.from({ length: 6 }, (_, index) => ({
            id: `e${index}`,
            filename: 'f.csv',
            filePath: 'p',
            status: 'pending' as const,
            createdAt: '2025-01-10T00:00:00.000Z',
            updatedAt: '2025-01-10T00:00:00.000Z',
          })),
        },
      }),
    );
    renderWithProviders(<HomeScreen />);
    expect(screen.getByLabelText('View export queue')).toBeOnTheScreen();
  });
});
