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
import { useTransactionData } from '../../context/AppContext';
import type { TransactionRecord } from '../../database';

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate, goBack: jest.fn() }),
}));

jest.mock('../../context/AppContext', () => ({
  useTransactionData: jest.fn(),
}));

const mockedUseExpenseData = useTransactionData as unknown as jest.Mock;

const makeTransaction = (
  overrides: Partial<TransactionRecord> = {},
): TransactionRecord => ({
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
  it('renders the base currency readout', () => {
    renderWithProviders(<HomeScreen />);
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
    expect(screen.getByText('No transactions found')).toBeOnTheScreen();
  });

  it('renders the payee as the row title when expenses are present', () => {
    const transaction = makeTransaction({
      payee: 'Corner Cafe',
      description: 'Lunch',
    });
    mockedUseExpenseData.mockReturnValue(
      makeContextValue({
        state: { transactions: [transaction] },
        selectors: { filteredTransactions: [transaction] },
      }),
    );
    renderWithProviders(<HomeScreen />);
    expect(screen.getByText('Corner Cafe')).toBeOnTheScreen();
  });

  it('falls back to the description for the title when payee is blank', () => {
    const transaction = makeTransaction({ payee: '', description: 'Lunch' });
    mockedUseExpenseData.mockReturnValue(
      makeContextValue({
        state: { transactions: [transaction] },
        selectors: { filteredTransactions: [transaction] },
      }),
    );
    renderWithProviders(<HomeScreen />);
    expect(screen.getByText('Lunch')).toBeOnTheScreen();
  });

  it('shows a placeholder title when payee and description are both blank', () => {
    const transaction = makeTransaction({ payee: '', description: '' });
    mockedUseExpenseData.mockReturnValue(
      makeContextValue({
        state: { transactions: [transaction] },
        selectors: { filteredTransactions: [transaction] },
      }),
    );
    renderWithProviders(<HomeScreen />);
    expect(screen.getByText('(no payee)')).toBeOnTheScreen();
  });

  it('navigates to AddExpense when the add button is pressed', () => {
    renderWithProviders(<HomeScreen />);
    fireEvent.press(screen.getAllByText('Add transaction')[0]);
    expect(mockNavigate).toHaveBeenCalledWith('AddTransaction');
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
      type: 'both',
      id: 1,
      name: 'Food',
      createdAt: '2025-01-10T00:00:00.000Z',
      updatedAt: '2025-01-10T00:00:00.000Z',
    };
    const transaction = makeTransaction({
      id: 7,
      payee: 'Bean Bar',
      description: 'Coffee',
      categoryId: 1,
    });
    mockedUseExpenseData.mockReturnValue(
      makeContextValue({
        state: {
          transactions: [transaction],
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
        selectors: {
          filteredTransactions: [transaction],
          hasActiveFilters: true,
        },
        actions: { refresh, setFilters },
      }),
    );
    renderWithProviders(<HomeScreen />);

    fireEvent.press(screen.getByLabelText('Refresh transactions'));
    await waitFor(() => expect(refresh).toHaveBeenCalled());

    fireEvent.press(screen.getByLabelText('Reset filters'));
    expect(setFilters).toHaveBeenCalled();

    fireEvent.press(screen.getByLabelText('Filter by category'));
    fireEvent.press(screen.getByLabelText('Select Food'));
    expect(setFilters).toHaveBeenCalledWith({ categoryId: 1 });

    fireEvent.press(screen.getByLabelText('Open expense Bean Bar'));
    expect(mockNavigate).toHaveBeenCalledWith('AddTransaction', {
      transactionId: 7,
    });

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

  describe('totals and direction', () => {
    const figure = (total: number, count: number) => ({
      rawTotal: total,
      total,
      count,
    });

    const withTotals = (
      entries: {
        baseCurrencyCode: string | null;
        expense: ReturnType<typeof figure>;
        income: ReturnType<typeof figure>;
        net: ReturnType<typeof figure>;
      }[],
      transactions: TransactionRecord[] = [makeTransaction()],
    ) =>
      makeContextValue({
        state: { transactions },
        selectors: {
          filteredTransactions: transactions,
          totals: {
            byBaseCurrency: entries,
            mixedBase: entries.length > 1,
          },
        },
      });

    it('renders no summary card when nothing matches', () => {
      renderWithProviders(<HomeScreen />);
      expect(screen.queryByText('Spent')).toBeNull();
      expect(screen.queryByText('Received')).toBeNull();
      expect(screen.queryByText('Net')).toBeNull();
    });

    it('shows all three figures for an expense-only ledger', () => {
      mockedUseExpenseData.mockReturnValue(
        withTotals([
          {
            baseCurrencyCode: 'USD',
            expense: figure(30, 1),
            income: figure(0, 0),
            net: figure(-30, 1),
          },
        ]),
      );
      renderWithProviders(<HomeScreen />);

      expect(screen.getByText('Spent')).toBeOnTheScreen();
      expect(screen.getByText('Received')).toBeOnTheScreen();
      expect(screen.getByText('Net')).toBeOnTheScreen();
      expect(screen.getByText('-30.00')).toBeOnTheScreen();
      expect(screen.getByText('+0.00')).toBeOnTheScreen();
      expect(screen.getByText('-30.00 USD')).toBeOnTheScreen();
    });

    it('shows all three figures for an income-only ledger', () => {
      mockedUseExpenseData.mockReturnValue(
        withTotals([
          {
            baseCurrencyCode: 'USD',
            expense: figure(0, 0),
            income: figure(100, 1),
            net: figure(100, 1),
          },
        ]),
      );
      renderWithProviders(<HomeScreen />);

      expect(screen.getByText('-0.00')).toBeOnTheScreen();
      expect(screen.getByText('+100.00')).toBeOnTheScreen();
      expect(screen.getByText('+100.00 USD')).toBeOnTheScreen();
    });

    it('renders a break-even net unsigned', () => {
      mockedUseExpenseData.mockReturnValue(
        withTotals([
          {
            baseCurrencyCode: 'USD',
            expense: figure(50, 1),
            income: figure(50, 1),
            net: figure(0, 2),
          },
        ]),
      );
      renderWithProviders(<HomeScreen />);

      expect(screen.getByText('0.00 USD')).toBeOnTheScreen();
    });

    it('groups thousands and reports per-direction counts', () => {
      mockedUseExpenseData.mockReturnValue(
        withTotals([
          {
            baseCurrencyCode: 'MYR',
            expense: figure(1234.56, 3),
            income: figure(987, 1),
            net: figure(-247.56, 4),
          },
        ]),
      );
      renderWithProviders(<HomeScreen />);

      expect(screen.getByText('-1,234.56')).toBeOnTheScreen();
      expect(screen.getByText('3 txn')).toBeOnTheScreen();
      expect(screen.getByText('1 txn')).toBeOnTheScreen();
      expect(screen.getByText('-247.56 MYR')).toBeOnTheScreen();
    });

    it('separates a null-base group from a same-coded group', () => {
      mockedUseExpenseData.mockReturnValue(
        withTotals([
          {
            baseCurrencyCode: 'USD',
            expense: figure(5, 1),
            income: figure(0, 0),
            net: figure(-5, 1),
          },
          {
            baseCurrencyCode: null,
            expense: figure(7, 1),
            income: figure(0, 0),
            net: figure(-7, 1),
          },
        ]),
      );
      renderWithProviders(<HomeScreen />);

      expect(screen.getByText('USD')).toBeOnTheScreen();
      expect(screen.getByText('No base currency recorded')).toBeOnTheScreen();
      expect(screen.getByText('-5.00 USD')).toBeOnTheScreen();
      // Spent and Net of the uncoded group, neither carrying a currency.
      expect(screen.getAllByText('-7.00')).toHaveLength(2);
      expect(screen.queryByText(/multiple base currencies/)).toBeNull();
    });

    it('marks an income row with a plus sign and labels its direction', () => {
      const income = makeTransaction({ type: 'income', payee: 'Employer' });
      mockedUseExpenseData.mockReturnValue(
        makeContextValue({
          state: { transactions: [income] },
          selectors: { filteredTransactions: [income] },
        }),
      );
      renderWithProviders(<HomeScreen />);
      expect(screen.getByLabelText('Open income Employer')).toBeOnTheScreen();
      expect(screen.getByText(/^\+/)).toBeOnTheScreen();
    });

    it('filters by direction from the chips row', () => {
      const value = makeContextValue();
      mockedUseExpenseData.mockReturnValue(value);
      renderWithProviders(<HomeScreen />);

      fireEvent.press(screen.getByLabelText('Filter Income'));
      expect(value.actions.setFilters).toHaveBeenCalledWith({ type: 'income' });
    });
  });

  describe('row date and time', () => {
    const renderRow = (transaction: ReturnType<typeof makeTransaction>) => {
      mockedUseExpenseData.mockReturnValue(
        makeContextValue({
          state: { transactions: [transaction] },
          selectors: { filteredTransactions: [transaction] },
        }),
      );
      renderWithProviders(<HomeScreen />);
    };

    it('shows the time beside the date when one was recorded', () => {
      renderRow(makeTransaction({ date: '2026-08-08', time: '14:30' }));
      expect(screen.getByText(/08\/08\/2026 14:30/)).toBeOnTheScreen();
    });

    it('shows the date alone when no time was recorded', () => {
      renderRow(makeTransaction({ date: '2026-08-08', time: null }));
      const row = screen.getByText(/08\/08\/2026/);
      expect(row).toBeOnTheScreen();
      expect(row.props.children).not.toMatch(/\d{2}:\d{2}/);
    });
  });
});
