import React from 'react';
import { Alert } from 'react-native';
import {
  renderWithProviders,
  makeContextValue,
  createNavigationMock,
  screen,
  fireEvent,
  waitFor,
  act,
} from '../../__tests__/test-utils/renderWithProviders';
import AddTransactionScreen from '../AddTransactionScreen';
import { useTransactionData } from '../../context/AppContext';
import type { CategoryRecord, TransactionRecord } from '../../database';
import { localIsoDateOffset } from '../../utils/date';

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

const makeCategory = (
  overrides: Partial<CategoryRecord> = {},
): CategoryRecord => ({
  type: 'both',
  id: 1,
  name: 'Food',
  createdAt: '2025-01-10T00:00:00.000Z',
  updatedAt: '2025-01-10T00:00:00.000Z',
  ...overrides,
});

type ScreenProps = React.ComponentProps<typeof AddTransactionScreen>;

const renderScreen = (
  params: { transactionId?: number } | undefined,
  contextOverrides: Parameters<typeof makeContextValue>[0] = {},
) => {
  const value = makeContextValue(contextOverrides);
  mockedUseExpenseData.mockReturnValue(value);
  const navigation = createNavigationMock();
  const props = {
    route: { params },
    navigation,
  } as unknown as ScreenProps;
  renderWithProviders(<AddTransactionScreen {...props} />);
  return { navigation, value };
};

const openPickerField = (label: string) => {
  fireEvent.press(screen.getByLabelText(label));
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('AddTransactionScreen', () => {
  it('renders the create form by default', () => {
    renderScreen(undefined);
    expect(screen.getByText('Save transaction')).toBeOnTheScreen();
    expect(screen.getByLabelText('Transaction description')).toBeOnTheScreen();
    expect(screen.getByLabelText('Transaction payee')).toBeOnTheScreen();
  });

  it('shows a spinner until the data is initialised', () => {
    renderScreen(undefined, { state: { isInitialised: false } });
    expect(screen.queryByText('Save transaction')).toBeNull();
  });

  it('shows a not-found message for a missing expense id', () => {
    renderScreen({ transactionId: 99 });
    expect(screen.getByText('Transaction not found')).toBeOnTheScreen();
  });

  it('renders the edit form for an existing expense', () => {
    const transaction = makeTransaction({ id: 1, description: 'Lunch' });
    renderScreen(
      { transactionId: 1 },
      { state: { transactions: [transaction] } },
    );
    expect(screen.getByText('Update transaction')).toBeOnTheScreen();
    expect(screen.getByLabelText('Delete transaction')).toBeOnTheScreen();
  });

  it('creates an expense and navigates back on valid submit', async () => {
    const createTransaction = jest.fn().mockResolvedValue(makeTransaction());
    const { navigation } = renderScreen(undefined, {
      actions: { createTransaction },
    });

    fireEvent.changeText(
      screen.getByLabelText('Transaction description'),
      'Groceries',
    );
    fireEvent.changeText(
      screen.getByLabelText('Transaction payee'),
      'Local Market',
    );
    fireEvent.changeText(
      screen.getByLabelText('Amount in native currency'),
      '12.50',
    );
    fireEvent.changeText(
      screen.getByLabelText('FX rate to base currency'),
      '1',
    );
    fireEvent.press(screen.getByLabelText('Create transaction'));

    await waitFor(() => expect(createTransaction).toHaveBeenCalledTimes(1));
    expect(createTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ payee: 'Local Market' }),
    );
    expect(navigation.goBack).toHaveBeenCalled();
  });

  it('blocks submit when description, payee and category are all empty', () => {
    const createTransaction = jest.fn();
    renderScreen(undefined, { actions: { createTransaction } });
    fireEvent.changeText(
      screen.getByLabelText('Amount in native currency'),
      '12.50',
    );
    fireEvent.changeText(
      screen.getByLabelText('FX rate to base currency'),
      '1',
    );
    fireEvent.press(screen.getByLabelText('Create transaction'));
    expect(createTransaction).not.toHaveBeenCalled();
    expect(
      screen.getByText('Add a description, payee, or category.'),
    ).toBeOnTheScreen();
  });

  it('saves a category-only expense with no description or payee', async () => {
    const createTransaction = jest.fn().mockResolvedValue(makeTransaction());
    const { navigation } = renderScreen(undefined, {
      state: { categories: [makeCategory({ id: 1, name: 'Food' })] },
      actions: { createTransaction },
    });
    fireEvent.changeText(
      screen.getByLabelText('Amount in native currency'),
      '12.50',
    );
    fireEvent.changeText(
      screen.getByLabelText('FX rate to base currency'),
      '1',
    );
    fireEvent.press(screen.getByLabelText('Create transaction'));
    await waitFor(() => expect(createTransaction).toHaveBeenCalledTimes(1));
    expect(createTransaction).toHaveBeenCalledWith(
      expect.objectContaining({ description: '', payee: '' }),
    );
    expect(navigation.goBack).toHaveBeenCalled();
  });

  it('blocks submit and surfaces a validation error when amount is empty', () => {
    const createTransaction = jest.fn();
    renderScreen(undefined, { actions: { createTransaction } });
    fireEvent.press(screen.getByLabelText('Create transaction'));
    expect(createTransaction).not.toHaveBeenCalled();
    expect(
      screen.getByText('Amount must be greater than zero.'),
    ).toBeOnTheScreen();
  });

  it('updates an existing expense on submit', async () => {
    const updateTransaction = jest.fn().mockResolvedValue(makeTransaction());
    const transaction = makeTransaction({ id: 1, description: 'Old' });
    const { navigation } = renderScreen(
      { transactionId: 1 },
      {
        state: { transactions: [transaction] },
        actions: { updateTransaction },
      },
    );
    fireEvent.changeText(
      screen.getByLabelText('Transaction description'),
      'Updated',
    );
    fireEvent.press(screen.getByLabelText('Update transaction'));
    await waitFor(() => expect(updateTransaction).toHaveBeenCalledTimes(1));
    expect(navigation.goBack).toHaveBeenCalled();
  });

  it('edits secondary fields and recomputes the base amount', () => {
    renderScreen(undefined);
    fireEvent.changeText(screen.getByLabelText('Transaction notes'), 'a note');
    fireEvent.changeText(
      screen.getByLabelText('Transaction date'),
      '15/01/2025',
    );
    fireEvent.changeText(
      screen.getByLabelText('Amount in native currency'),
      '10',
    );
    fireEvent.changeText(
      screen.getByLabelText('FX rate to base currency'),
      '1.5',
    );
    expect(screen.getByDisplayValue('-15.00 USD')).toBeOnTheScreen();
  });

  it('flips the base amount preview when the direction changes', () => {
    renderScreen(undefined);
    fireEvent.changeText(
      screen.getByLabelText('Amount in native currency'),
      '10',
    );
    fireEvent.changeText(
      screen.getByLabelText('FX rate to base currency'),
      '1.5',
    );
    expect(screen.getByDisplayValue('-15.00 USD')).toBeOnTheScreen();

    fireEvent.press(screen.getByText('Income'));
    expect(screen.getByDisplayValue('+15.00 USD')).toBeOnTheScreen();
  });

  it('shows a context error as a form error', () => {
    renderScreen(undefined, { state: { error: 'Something failed' } });
    expect(screen.getByText('Something failed')).toBeOnTheScreen();
  });

  it('confirms before deleting an existing expense', async () => {
    const deleteTransaction = jest.fn().mockResolvedValue(undefined);
    const alertSpy = jest.spyOn(Alert, 'alert');
    const transaction = makeTransaction({ id: 1 });
    renderScreen(
      { transactionId: 1 },
      {
        state: { transactions: [transaction] },
        actions: { deleteTransaction },
      },
    );

    fireEvent.press(screen.getByLabelText('Delete transaction'));
    expect(alertSpy).toHaveBeenCalledWith(
      'Delete transaction',
      expect.any(String),
      expect.any(Array),
    );

    const buttons = alertSpy.mock.calls[0][2] as Array<{
      text?: string;
      onPress?: () => void;
    }>;
    const confirm = buttons.find(button => button.text === 'Delete');
    confirm?.onPress?.();
    await waitFor(() => expect(deleteTransaction).toHaveBeenCalledWith(1));
  });

  it('surfaces a form error when saving fails', async () => {
    const createTransaction = jest
      .fn()
      .mockRejectedValue(new Error('Save failed'));
    renderScreen(undefined, { actions: { createTransaction } });
    fireEvent.changeText(
      screen.getByLabelText('Transaction description'),
      'Groceries',
    );
    fireEvent.changeText(
      screen.getByLabelText('Transaction payee'),
      'Local Market',
    );
    fireEvent.changeText(
      screen.getByLabelText('Amount in native currency'),
      '12.50',
    );
    fireEvent.changeText(
      screen.getByLabelText('FX rate to base currency'),
      '1',
    );
    fireEvent.press(screen.getByLabelText('Create transaction'));
    await waitFor(() =>
      expect(screen.getByText('Save failed')).toBeOnTheScreen(),
    );
  });

  it('selects a currency from the dialog', async () => {
    renderScreen(undefined);
    openPickerField('USD US Dollar');
    expect(screen.getByText('Choose currency')).toBeOnTheScreen();
    fireEvent.changeText(screen.getByLabelText('Search currency'), 'EUR');
    fireEvent.press(screen.getByText('EUR'));
    await waitFor(() =>
      expect(screen.getByDisplayValue('EUR')).toBeOnTheScreen(),
    );
  });

  it('clears the currency error after selecting a currency', async () => {
    renderScreen(undefined, { state: { settings: { baseCurrency: '' } } });
    fireEvent.press(screen.getByLabelText('Create transaction'));
    expect(screen.getByText('Currency code is required.')).toBeOnTheScreen();
    openPickerField('Select currency');
    fireEvent.changeText(screen.getByLabelText('Search currency'), 'EUR');
    fireEvent.press(screen.getByText('EUR'));
    await waitFor(() =>
      expect(screen.queryByText('Currency code is required.')).toBeNull(),
    );
  });

  it('dismisses the currency dialog on cancel', () => {
    renderScreen(undefined);
    openPickerField('USD US Dollar');
    expect(screen.getByText('Choose currency')).toBeOnTheScreen();
    fireEvent.press(screen.getByLabelText('Cancel currency selection'));
    act(() => {
      jest.runAllTimers();
    });
    expect(screen.queryByText('Choose currency')).toBeNull();
  });

  it('selects a category from the dialog', () => {
    renderScreen(undefined, {
      state: {
        categories: [
          makeCategory({ id: 1, name: 'Food' }),
          makeCategory({ id: 2, name: 'Travel' }),
        ],
      },
    });
    openPickerField('Select category');
    expect(screen.getByText('Choose category')).toBeOnTheScreen();
    fireEvent.press(screen.getByLabelText('Select Travel'));
    expect(screen.getByDisplayValue('Travel')).toBeOnTheScreen();
  });

  it('dismisses the category dialog on cancel', () => {
    renderScreen(undefined, {
      state: { categories: [makeCategory({ id: 1, name: 'Food' })] },
    });
    openPickerField('Select category');
    expect(screen.getByText('Choose category')).toBeOnTheScreen();
    fireEvent.press(screen.getByLabelText('Cancel category selection'));
    act(() => {
      jest.runAllTimers();
    });
    expect(screen.queryByText('Choose category')).toBeNull();
  });

  it('clears a field error after the value is corrected', () => {
    renderScreen(undefined);
    fireEvent.press(screen.getByLabelText('Create transaction'));
    expect(
      screen.getByText('Amount must be greater than zero.'),
    ).toBeOnTheScreen();
    fireEvent.changeText(
      screen.getByLabelText('Amount in native currency'),
      '10',
    );
    expect(screen.queryByText('Amount must be greater than zero.')).toBeNull();
  });

  it('clears the date error after the date is corrected', () => {
    renderScreen(undefined);
    fireEvent.changeText(
      screen.getByLabelText('Transaction date'),
      'not a date',
    );
    fireEvent.press(screen.getByLabelText('Create transaction'));
    expect(screen.getByText('Date is required.')).toBeOnTheScreen();
    fireEvent.changeText(
      screen.getByLabelText('Transaction date'),
      '15/01/2025',
    );
    expect(screen.queryByText('Date is required.')).toBeNull();
  });

  it('alerts when deleting an existing expense fails', async () => {
    const deleteTransaction = jest.fn().mockRejectedValue(new Error('boom'));
    const alertSpy = jest.spyOn(Alert, 'alert');
    const transaction = makeTransaction({ id: 1 });
    renderScreen(
      { transactionId: 1 },
      {
        state: { transactions: [transaction] },
        actions: { deleteTransaction },
      },
    );

    fireEvent.press(screen.getByLabelText('Delete transaction'));
    const buttons = alertSpy.mock.calls[0][2] as Array<{
      text?: string;
      onPress?: () => void | Promise<void>;
    }>;
    const confirm = buttons.find(button => button.text === 'Delete');
    await confirm?.onPress?.();

    await waitFor(() =>
      expect(alertSpy).toHaveBeenCalledWith(
        'Delete failed',
        expect.any(String),
      ),
    );
  });

  it('navigates back from the not-found view', () => {
    const { navigation } = renderScreen({ transactionId: 99 });
    expect(screen.getByText('Transaction not found')).toBeOnTheScreen();
    fireEvent.press(screen.getByText('Go back'));
    expect(navigation.goBack).toHaveBeenCalled();
  });

  describe('transaction direction', () => {
    const expenseOnly = makeCategory({
      id: 7,
      name: 'Groceries',
      type: 'expense',
    });

    it('clears a now-invalid category silently on a new transaction', () => {
      const { value } = renderScreen(undefined, {
        state: { categories: [expenseOnly] },
      });

      fireEvent.press(screen.getByText('Income'));
      fireEvent.changeText(
        screen.getByLabelText('Amount in native currency'),
        '10',
      );
      fireEvent.changeText(
        screen.getByLabelText('Transaction description'),
        'Salary',
      );
      fireEvent.press(screen.getByLabelText('Create transaction'));

      expect(value.actions.createTransaction).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'income', categoryId: null }),
      );
    });

    it('confirms before clearing a category the user chose on an existing transaction', () => {
      const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
      const existing = makeTransaction({ categoryId: expenseOnly.id });
      renderScreen(
        { transactionId: existing.id },
        { state: { transactions: [existing], categories: [expenseOnly] } },
      );

      fireEvent.press(screen.getByText('Income'));

      expect(alertSpy).toHaveBeenCalledWith(
        'Change type?',
        expect.stringContaining('Groceries'),
        expect.any(Array),
      );
      alertSpy.mockRestore();
    });

    it('keeps a category whose type no longer matches when opening an existing transaction', () => {
      const narrowed = makeCategory({
        id: 9,
        name: 'Gifts',
        type: 'expense',
      });
      const existing = makeTransaction({
        type: 'income',
        categoryId: narrowed.id,
      });
      const { value } = renderScreen(
        { transactionId: existing.id },
        { state: { transactions: [existing], categories: [narrowed] } },
      );

      fireEvent.press(screen.getByLabelText('Update transaction'));
      expect(value.actions.updateTransaction).toHaveBeenCalledWith(
        expect.objectContaining({ type: 'income', categoryId: narrowed.id }),
      );
    });
  });

  describe('time of day', () => {
    const fillRequired = () => {
      fireEvent.changeText(
        screen.getByLabelText('Transaction payee'),
        'Local Market',
      );
      fireEvent.changeText(
        screen.getByLabelText('Amount in native currency'),
        '12.50',
      );
      fireEvent.changeText(
        screen.getByLabelText('FX rate to base currency'),
        '1',
      );
    };

    it('renders a time field', () => {
      renderScreen(undefined);
      expect(screen.getByLabelText('Transaction time')).toBeOnTheScreen();
    });

    it('hydrates the field from an existing record', () => {
      renderScreen(
        { transactionId: 1 },
        {
          state: { transactions: [makeTransaction({ id: 1, time: '14:30' })] },
        },
      );
      expect(screen.getByLabelText('Transaction time').props.value).toBe(
        '14:30',
      );
    });

    it('leaves the field empty for a record with no time', () => {
      renderScreen(
        { transactionId: 1 },
        { state: { transactions: [makeTransaction({ id: 1, time: null })] } },
      );
      expect(screen.getByLabelText('Transaction time').props.value).toBe('');
    });

    it('normalises a typed time before saving', async () => {
      const createTransaction = jest.fn().mockResolvedValue(makeTransaction());
      renderScreen(undefined, { actions: { createTransaction } });

      fillRequired();
      fireEvent.changeText(screen.getByLabelText('Transaction time'), '2:30pm');
      fireEvent.press(screen.getByLabelText('Create transaction'));

      await waitFor(() => expect(createTransaction).toHaveBeenCalledTimes(1));
      expect(createTransaction).toHaveBeenCalledWith(
        expect.objectContaining({ time: '14:30' }),
      );
    });

    it('saves no time when the field is cleared', async () => {
      const createTransaction = jest.fn().mockResolvedValue(makeTransaction());
      renderScreen(undefined, { actions: { createTransaction } });

      fillRequired();
      fireEvent.changeText(screen.getByLabelText('Transaction time'), '');
      fireEvent.press(screen.getByLabelText('Create transaction'));

      await waitFor(() => expect(createTransaction).toHaveBeenCalledTimes(1));
      expect(createTransaction).toHaveBeenCalledWith(
        expect.objectContaining({ time: null }),
      );
    });

    it('blocks submit and reports an unreadable time', () => {
      const createTransaction = jest.fn();
      renderScreen(undefined, { actions: { createTransaction } });

      fillRequired();
      fireEvent.changeText(screen.getByLabelText('Transaction time'), 'lunch');
      fireEvent.press(screen.getByLabelText('Create transaction'));

      expect(createTransaction).not.toHaveBeenCalled();
      expect(
        screen.getByText('Time must be in 24-hour format HH:MM.'),
      ).toBeOnTheScreen();
    });
  });

  describe('suggested fills', () => {
    const today = new Date();
    const recent = (daysAgo: number): string =>
      localIsoDateOffset(today, { days: -daysAgo });

    const history: TransactionRecord[] = [
      ...Array.from({ length: 3 }, (_, index) =>
        makeTransaction({
          id: 100 + index,
          payee: 'Tesco',
          description: 'Weekly shop',
          date: recent(index + 1),
        }),
      ),
      makeTransaction({
        id: 200,
        payee: 'The Bistro',
        description: 'Team lunch',
        date: recent(5),
      }),
      makeTransaction({
        id: 300,
        payee: 'Salary Ltd',
        description: 'Monthly pay',
        type: 'income',
        date: recent(6),
      }),
    ];

    const renderWithHistory = (params?: { transactionId?: number }) =>
      renderScreen(params, { state: { transactions: history } });

    const focusAndType = (label: string, text: string) => {
      const field = screen.getByLabelText(label);
      fireEvent(field, 'focus');
      fireEvent.changeText(field, text);
      return field;
    };

    const suggestionLabels = () =>
      screen
        .queryAllByLabelText(/^Use /)
        .map(node => String(node.props.accessibilityLabel).replace('Use ', ''));

    it('offers the most-used values as soon as the field is focused', () => {
      renderWithHistory();
      fireEvent(screen.getByLabelText('Transaction payee'), 'focus');
      expect(suggestionLabels()).toEqual(['Tesco', 'The Bistro']);
    });

    it('narrows the focused list as characters are typed', () => {
      renderWithHistory();
      const field = focusAndType('Transaction payee', 'b');
      expect(suggestionLabels()).toEqual(['The Bistro']);

      fireEvent.changeText(field, '');
      expect(suggestionLabels()).toEqual(['Tesco', 'The Bistro']);
    });

    it('shows nothing on focus when there is no history', () => {
      renderScreen(undefined);
      fireEvent(screen.getByLabelText('Transaction payee'), 'focus');
      expect(suggestionLabels()).toEqual([]);
    });

    it('offers only the selected direction before anything is typed', () => {
      renderWithHistory();
      fireEvent(screen.getByLabelText('Transaction payee'), 'focus');
      expect(suggestionLabels()).not.toContain('Salary Ltd');

      fireEvent.press(screen.getByText('Income'));
      fireEvent(screen.getByLabelText('Transaction payee'), 'focus');
      expect(suggestionLabels()).toEqual(['Salary Ltd']);
    });

    it('suggests matching payees from the first character', () => {
      renderWithHistory();
      focusAndType('Transaction payee', 't');
      expect(suggestionLabels()).toEqual(['Tesco', 'The Bistro']);
    });

    it('orders suggestions by frequency, not alphabetically', () => {
      renderWithHistory();
      focusAndType('Transaction payee', 'e');
      expect(suggestionLabels()).toEqual(['Tesco', 'The Bistro']);
    });

    it('matches anywhere in the value', () => {
      renderWithHistory();
      focusAndType('Transaction payee', 'bistro');
      expect(suggestionLabels()).toEqual(['The Bistro']);
    });

    // Nothing else in the suite can observe this: the native focus machinery
    // that would blur the field is not simulated here, so the prop guarding
    // against it has to be asserted directly.
    it('persists taps through the scroll view so a row survives the press', () => {
      renderWithHistory();
      expect(
        screen.getByTestId('transaction-form-scroll').props
          .keyboardShouldPersistTaps,
      ).toBe('handled');
    });

    it('fills only the tapped field and closes the list', () => {
      renderWithHistory();
      focusAndType('Transaction payee', 'te');
      fireEvent.press(screen.getByLabelText('Use Tesco'));

      expect(screen.getByLabelText('Transaction payee').props.value).toBe(
        'Tesco',
      );
      expect(screen.getByLabelText('Transaction description').props.value).toBe(
        '',
      );
      expect(suggestionLabels()).toEqual([]);
    });

    it('closes the list when the field loses focus', () => {
      renderWithHistory();
      const field = focusAndType('Transaction payee', 'te');
      expect(suggestionLabels()).toEqual(['Tesco']);

      fireEvent(field, 'blur');
      expect(suggestionLabels()).toEqual([]);
    });

    it('keeps the description and payee lists independent', () => {
      renderWithHistory();
      focusAndType('Transaction description', 'week');
      expect(suggestionLabels()).toEqual(['Weekly shop']);

      focusAndType('Transaction payee', 'tes');
      expect(suggestionLabels()).toEqual(['Tesco']);
    });

    it('offers only values used in the selected direction', () => {
      renderWithHistory();
      focusAndType('Transaction payee', 'salary');
      expect(suggestionLabels()).toEqual([]);

      fireEvent.press(screen.getByText('Income'));
      focusAndType('Transaction payee', 'salary');
      expect(suggestionLabels()).toEqual(['Salary Ltd']);
    });

    it('suggests nothing when there is no history', () => {
      renderScreen(undefined);
      focusAndType('Transaction payee', 't');
      expect(suggestionLabels()).toEqual([]);
    });

    it('excludes the transaction being edited from its own suggestions', () => {
      renderScreen(
        { transactionId: 200 },
        { state: { transactions: history } },
      );
      focusAndType('Transaction payee', 'bistro');
      expect(suggestionLabels()).toEqual([]);
    });

    it('caps the list at six rows', () => {
      const many = Array.from({ length: 9 }, (_, index) =>
        makeTransaction({
          id: 400 + index,
          payee: `Payee ${index}`,
          date: recent(index + 1),
        }),
      );
      renderScreen(undefined, { state: { transactions: many } });
      focusAndType('Transaction payee', 'payee');
      expect(suggestionLabels()).toHaveLength(6);
    });
  });
});
