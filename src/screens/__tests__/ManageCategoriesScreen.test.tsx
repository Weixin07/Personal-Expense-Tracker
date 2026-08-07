import React from 'react';
import { Alert } from 'react-native';
import {
  renderWithProviders,
  makeContextValue,
  screen,
  fireEvent,
  waitFor,
} from '../../__tests__/test-utils/renderWithProviders';
import ManageCategoriesScreen from '../ManageCategoriesScreen';
import { useTransactionData } from '../../context/AppContext';
import type { CategoryRecord, TransactionRecord } from '../../database';

jest.mock('../../context/AppContext', () => ({
  useTransactionData: jest.fn(),
}));

const mockedUseExpenseData = useTransactionData as unknown as jest.Mock;

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
  categoryId: 1,
  notes: null,
  createdAt: '2025-01-10T00:00:00.000Z',
  updatedAt: '2025-01-10T00:00:00.000Z',
  ...overrides,
});

beforeEach(() => {
  jest.clearAllMocks();
  mockedUseExpenseData.mockReturnValue(makeContextValue());
});

describe('ManageCategoriesScreen', () => {
  it('shows the empty state when there are no categories', () => {
    renderWithProviders(<ManageCategoriesScreen />);
    expect(screen.getByText('No categories yet')).toBeOnTheScreen();
  });

  it('lists existing categories', () => {
    mockedUseExpenseData.mockReturnValue(
      makeContextValue({ state: { categories: [makeCategory()] } }),
    );
    renderWithProviders(<ManageCategoriesScreen />);
    expect(screen.getByText('Food')).toBeOnTheScreen();
  });

  it('creates a new category', async () => {
    const createCategory = jest.fn().mockResolvedValue(makeCategory());
    mockedUseExpenseData.mockReturnValue(
      makeContextValue({ actions: { createCategory } }),
    );
    renderWithProviders(<ManageCategoriesScreen />);
    fireEvent.press(screen.getByLabelText('Add category'));
    fireEvent.changeText(screen.getByLabelText('Category name'), 'Travel');
    fireEvent.press(screen.getByLabelText('Create category'));
    await waitFor(() =>
      expect(createCategory).toHaveBeenCalledWith({
        name: 'Travel',
        type: 'both',
      }),
    );
  });

  it('rejects an empty category name', () => {
    const createCategory = jest.fn();
    mockedUseExpenseData.mockReturnValue(
      makeContextValue({ actions: { createCategory } }),
    );
    renderWithProviders(<ManageCategoriesScreen />);
    fireEvent.press(screen.getByLabelText('Add category'));
    fireEvent.press(screen.getByLabelText('Create category'));
    expect(createCategory).not.toHaveBeenCalled();
    expect(screen.getByText('Category name is required.')).toBeOnTheScreen();
  });

  it('rejects a duplicate category name', () => {
    const createCategory = jest.fn();
    mockedUseExpenseData.mockReturnValue(
      makeContextValue({
        state: { categories: [makeCategory({ name: 'Food' })] },
        actions: { createCategory },
      }),
    );
    renderWithProviders(<ManageCategoriesScreen />);
    fireEvent.press(screen.getByLabelText('Add category'));
    fireEvent.changeText(screen.getByLabelText('Category name'), 'food');
    fireEvent.press(screen.getByLabelText('Create category'));
    expect(createCategory).not.toHaveBeenCalled();
    expect(screen.getByText('Category name must be unique.')).toBeOnTheScreen();
  });

  it('renames an existing category', async () => {
    const updateCategory = jest.fn().mockResolvedValue(makeCategory());
    mockedUseExpenseData.mockReturnValue(
      makeContextValue({
        state: { categories: [makeCategory({ id: 1, name: 'Food' })] },
        actions: { updateCategory },
      }),
    );
    renderWithProviders(<ManageCategoriesScreen />);
    fireEvent.press(screen.getByLabelText('Rename Food'));
    fireEvent.changeText(screen.getByLabelText('Category name'), 'Dining');
    fireEvent.press(screen.getByLabelText('Save category name'));
    await waitFor(() =>
      expect(updateCategory).toHaveBeenCalledWith({
        id: 1,
        name: 'Dining',
        type: 'both',
      }),
    );
  });

  it('confirms before deleting an unused category', async () => {
    const deleteCategory = jest.fn().mockResolvedValue(undefined);
    const alertSpy = jest.spyOn(Alert, 'alert');
    mockedUseExpenseData.mockReturnValue(
      makeContextValue({
        state: { categories: [makeCategory({ id: 1, name: 'Food' })] },
        actions: { deleteCategory },
      }),
    );
    renderWithProviders(<ManageCategoriesScreen />);
    fireEvent.press(screen.getByLabelText('Delete Food'));
    const buttons = alertSpy.mock.calls[0][2] as Array<{
      text?: string;
      onPress?: () => void;
    }>;
    buttons.find(button => button.text === 'Delete')?.onPress?.();
    await waitFor(() => expect(deleteCategory).toHaveBeenCalledWith(1));
  });

  it('blocks deletion of a category that is in use', () => {
    const deleteCategory = jest.fn();
    const alertSpy = jest.spyOn(Alert, 'alert');
    mockedUseExpenseData.mockReturnValue(
      makeContextValue({
        state: {
          categories: [makeCategory({ id: 1, name: 'Food' })],
          transactions: [makeTransaction({ categoryId: 1 })],
        },
        actions: { deleteCategory },
      }),
    );
    renderWithProviders(<ManageCategoriesScreen />);
    fireEvent.press(screen.getByLabelText('Delete Food'));
    expect(alertSpy).toHaveBeenCalledWith(
      'Cannot delete category',
      expect.any(String),
    );
    expect(deleteCategory).not.toHaveBeenCalled();
  });

  describe('usage summary', () => {
    it('counts both directions with agreeing nouns', () => {
      const category = makeCategory({ id: 6, name: 'Gifts', type: 'both' });
      mockedUseExpenseData.mockReturnValue(
        makeContextValue({
          state: {
            categories: [category],
            transactions: [
              makeTransaction({ id: 40, type: 'expense', categoryId: 6 }),
              makeTransaction({ id: 41, type: 'expense', categoryId: 6 }),
              makeTransaction({ id: 42, type: 'income', categoryId: 6 }),
            ],
          },
        }),
      );
      renderWithProviders(<ManageCategoriesScreen />);

      expect(
        screen.getByText('Expense and income · 2 expenses, 1 income entry'),
      ).toBeOnTheScreen();
    });

    it('pluralises income usage beyond one', () => {
      const category = makeCategory({ id: 7, name: 'Salary', type: 'income' });
      mockedUseExpenseData.mockReturnValue(
        makeContextValue({
          state: {
            categories: [category],
            transactions: [
              makeTransaction({ id: 50, type: 'income', categoryId: 7 }),
              makeTransaction({ id: 51, type: 'income', categoryId: 7 }),
            ],
          },
        }),
      );
      renderWithProviders(<ManageCategoriesScreen />);

      expect(
        screen.getByText('Income only · 2 income entries'),
      ).toBeOnTheScreen();
    });

    it('marks a category with no transactions as unused', () => {
      const category = makeCategory({ id: 8, name: 'Travel', type: 'both' });
      mockedUseExpenseData.mockReturnValue(
        makeContextValue({
          state: { categories: [category], transactions: [] },
        }),
      );
      renderWithProviders(<ManageCategoriesScreen />);

      expect(screen.getByText('Expense and income · Unused')).toBeOnTheScreen();
    });
  });

  describe('category type', () => {
    it('preloads the stored type when renaming and keeps it on save', async () => {
      const category = makeCategory({ id: 4, name: 'Salary', type: 'income' });
      const updateCategory = jest.fn().mockResolvedValue(category);
      mockedUseExpenseData.mockReturnValue(
        makeContextValue({
          state: { categories: [category] },
          actions: { updateCategory },
        }),
      );
      renderWithProviders(<ManageCategoriesScreen />);

      fireEvent.press(screen.getByLabelText('Rename Salary'));
      fireEvent.press(screen.getByLabelText('Save category name'));

      await waitFor(() =>
        expect(updateCategory).toHaveBeenCalledWith({
          id: 4,
          name: 'Salary',
          type: 'income',
        }),
      );
    });

    it('warns before narrowing a type that still has usage on the other side', () => {
      const alertSpy = jest.spyOn(Alert, 'alert').mockImplementation(() => {});
      const category = makeCategory({ id: 5, name: 'Gifts', type: 'both' });
      const income = makeTransaction({
        id: 30,
        type: 'income',
        categoryId: 5,
      });
      const updateCategory = jest.fn();
      mockedUseExpenseData.mockReturnValue(
        makeContextValue({
          state: { categories: [category], transactions: [income] },
          actions: { updateCategory },
        }),
      );
      renderWithProviders(<ManageCategoriesScreen />);

      fireEvent.press(screen.getByLabelText('Rename Gifts'));
      fireEvent.press(screen.getByText('Expense'));
      fireEvent.press(screen.getByLabelText('Save category name'));

      expect(alertSpy).toHaveBeenCalledWith(
        'Change category type?',
        expect.stringContaining('1 transaction'),
        expect.any(Array),
      );
      expect(updateCategory).not.toHaveBeenCalled();
      alertSpy.mockRestore();
    });
  });
});
