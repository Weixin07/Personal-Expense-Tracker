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
import AddExpenseScreen from '../AddExpenseScreen';
import { useExpenseData } from '../../context/AppContext';
import type { CategoryRecord, ExpenseRecord } from '../../database';

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

const makeCategory = (
  overrides: Partial<CategoryRecord> = {},
): CategoryRecord => ({
  id: 1,
  name: 'Food',
  createdAt: '2025-01-10T00:00:00.000Z',
  updatedAt: '2025-01-10T00:00:00.000Z',
  ...overrides,
});

type ScreenProps = React.ComponentProps<typeof AddExpenseScreen>;

const renderScreen = (
  params: { expenseId?: number } | undefined,
  contextOverrides: Parameters<typeof makeContextValue>[0] = {},
) => {
  const value = makeContextValue(contextOverrides);
  mockedUseExpenseData.mockReturnValue(value);
  const navigation = createNavigationMock();
  const props = {
    route: { params },
    navigation,
  } as unknown as ScreenProps;
  renderWithProviders(<AddExpenseScreen {...props} />);
  return { navigation, value };
};

const openPickerField = (label: string) => {
  fireEvent.press(screen.getByLabelText(label));
};

beforeEach(() => {
  jest.clearAllMocks();
});

describe('AddExpenseScreen', () => {
  it('renders the create form by default', () => {
    renderScreen(undefined);
    expect(screen.getByText('Save expense')).toBeOnTheScreen();
    expect(screen.getByLabelText('Expense description')).toBeOnTheScreen();
    expect(screen.getByLabelText('Expense payee')).toBeOnTheScreen();
  });

  it('shows a spinner until the data is initialised', () => {
    renderScreen(undefined, { state: { isInitialised: false } });
    expect(screen.queryByText('Save expense')).toBeNull();
  });

  it('shows a not-found message for a missing expense id', () => {
    renderScreen({ expenseId: 99 });
    expect(screen.getByText('Expense not found')).toBeOnTheScreen();
  });

  it('renders the edit form for an existing expense', () => {
    const expense = makeExpense({ id: 1, description: 'Lunch' });
    renderScreen({ expenseId: 1 }, { state: { expenses: [expense] } });
    expect(screen.getByText('Update expense')).toBeOnTheScreen();
    expect(screen.getByLabelText('Delete expense')).toBeOnTheScreen();
  });

  it('creates an expense and navigates back on valid submit', async () => {
    const createExpense = jest.fn().mockResolvedValue(makeExpense());
    const { navigation } = renderScreen(undefined, {
      actions: { createExpense },
    });

    fireEvent.changeText(
      screen.getByLabelText('Expense description'),
      'Groceries',
    );
    fireEvent.changeText(
      screen.getByLabelText('Expense payee'),
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
    fireEvent.press(screen.getByLabelText('Create expense'));

    await waitFor(() => expect(createExpense).toHaveBeenCalledTimes(1));
    expect(createExpense).toHaveBeenCalledWith(
      expect.objectContaining({ payee: 'Local Market' }),
    );
    expect(navigation.goBack).toHaveBeenCalled();
  });

  it('blocks submit when description, payee and category are all empty', () => {
    const createExpense = jest.fn();
    renderScreen(undefined, { actions: { createExpense } });
    fireEvent.changeText(
      screen.getByLabelText('Amount in native currency'),
      '12.50',
    );
    fireEvent.changeText(
      screen.getByLabelText('FX rate to base currency'),
      '1',
    );
    fireEvent.press(screen.getByLabelText('Create expense'));
    expect(createExpense).not.toHaveBeenCalled();
    expect(
      screen.getByText('Add a description, payee, or category.'),
    ).toBeOnTheScreen();
  });

  it('saves a category-only expense with no description or payee', async () => {
    const createExpense = jest.fn().mockResolvedValue(makeExpense());
    const { navigation } = renderScreen(undefined, {
      state: { categories: [makeCategory({ id: 1, name: 'Food' })] },
      actions: { createExpense },
    });
    fireEvent.changeText(
      screen.getByLabelText('Amount in native currency'),
      '12.50',
    );
    fireEvent.changeText(
      screen.getByLabelText('FX rate to base currency'),
      '1',
    );
    fireEvent.press(screen.getByLabelText('Create expense'));
    await waitFor(() => expect(createExpense).toHaveBeenCalledTimes(1));
    expect(createExpense).toHaveBeenCalledWith(
      expect.objectContaining({ description: '', payee: '' }),
    );
    expect(navigation.goBack).toHaveBeenCalled();
  });

  it('blocks submit and surfaces a validation error when amount is empty', () => {
    const createExpense = jest.fn();
    renderScreen(undefined, { actions: { createExpense } });
    fireEvent.press(screen.getByLabelText('Create expense'));
    expect(createExpense).not.toHaveBeenCalled();
    expect(
      screen.getByText('Amount must be greater than zero.'),
    ).toBeOnTheScreen();
  });

  it('updates an existing expense on submit', async () => {
    const updateExpense = jest.fn().mockResolvedValue(makeExpense());
    const expense = makeExpense({ id: 1, description: 'Old' });
    const { navigation } = renderScreen(
      { expenseId: 1 },
      { state: { expenses: [expense] }, actions: { updateExpense } },
    );
    fireEvent.changeText(
      screen.getByLabelText('Expense description'),
      'Updated',
    );
    fireEvent.press(screen.getByLabelText('Update expense'));
    await waitFor(() => expect(updateExpense).toHaveBeenCalledTimes(1));
    expect(navigation.goBack).toHaveBeenCalled();
  });

  it('edits secondary fields and recomputes the base amount', () => {
    renderScreen(undefined);
    fireEvent.changeText(screen.getByLabelText('Expense notes'), 'a note');
    fireEvent.changeText(screen.getByLabelText('Expense date'), '15/01/2025');
    fireEvent.changeText(
      screen.getByLabelText('Amount in native currency'),
      '10',
    );
    fireEvent.changeText(
      screen.getByLabelText('FX rate to base currency'),
      '1.5',
    );
    expect(screen.getByDisplayValue('15.00')).toBeOnTheScreen();
  });

  it('shows a context error as a form error', () => {
    renderScreen(undefined, { state: { error: 'Something failed' } });
    expect(screen.getByText('Something failed')).toBeOnTheScreen();
  });

  it('confirms before deleting an existing expense', async () => {
    const deleteExpense = jest.fn().mockResolvedValue(undefined);
    const alertSpy = jest.spyOn(Alert, 'alert');
    const expense = makeExpense({ id: 1 });
    renderScreen(
      { expenseId: 1 },
      { state: { expenses: [expense] }, actions: { deleteExpense } },
    );

    fireEvent.press(screen.getByLabelText('Delete expense'));
    expect(alertSpy).toHaveBeenCalledWith(
      'Delete expense',
      expect.any(String),
      expect.any(Array),
    );

    const buttons = alertSpy.mock.calls[0][2] as Array<{
      text?: string;
      onPress?: () => void;
    }>;
    const confirm = buttons.find(button => button.text === 'Delete');
    confirm?.onPress?.();
    await waitFor(() => expect(deleteExpense).toHaveBeenCalledWith(1));
  });

  it('surfaces a form error when saving fails', async () => {
    const createExpense = jest.fn().mockRejectedValue(new Error('Save failed'));
    renderScreen(undefined, { actions: { createExpense } });
    fireEvent.changeText(
      screen.getByLabelText('Expense description'),
      'Groceries',
    );
    fireEvent.changeText(
      screen.getByLabelText('Expense payee'),
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
    fireEvent.press(screen.getByLabelText('Create expense'));
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
    fireEvent.press(screen.getByLabelText('Create expense'));
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
    fireEvent.press(screen.getByLabelText('Create expense'));
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
    fireEvent.changeText(screen.getByLabelText('Expense date'), 'not a date');
    fireEvent.press(screen.getByLabelText('Create expense'));
    expect(screen.getByText('Date is required.')).toBeOnTheScreen();
    fireEvent.changeText(screen.getByLabelText('Expense date'), '15/01/2025');
    expect(screen.queryByText('Date is required.')).toBeNull();
  });

  it('alerts when deleting an existing expense fails', async () => {
    const deleteExpense = jest.fn().mockRejectedValue(new Error('boom'));
    const alertSpy = jest.spyOn(Alert, 'alert');
    const expense = makeExpense({ id: 1 });
    renderScreen(
      { expenseId: 1 },
      { state: { expenses: [expense] }, actions: { deleteExpense } },
    );

    fireEvent.press(screen.getByLabelText('Delete expense'));
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
    const { navigation } = renderScreen({ expenseId: 99 });
    expect(screen.getByText('Expense not found')).toBeOnTheScreen();
    fireEvent.press(screen.getByText('Go back'));
    expect(navigation.goBack).toHaveBeenCalled();
  });
});
