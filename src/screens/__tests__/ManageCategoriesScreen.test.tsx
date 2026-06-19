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
import { useExpenseData } from '../../context/AppContext';
import type { CategoryRecord, ExpenseRecord } from '../../database';

jest.mock('../../context/AppContext', () => ({
  useExpenseData: jest.fn(),
}));

const mockedUseExpenseData = useExpenseData as unknown as jest.Mock;

const makeCategory = (
  overrides: Partial<CategoryRecord> = {},
): CategoryRecord => ({
  id: 1,
  name: 'Food',
  createdAt: '2025-01-10T00:00:00.000Z',
  updatedAt: '2025-01-10T00:00:00.000Z',
  ...overrides,
});

const makeExpense = (
  overrides: Partial<ExpenseRecord> = {},
): ExpenseRecord => ({
  id: 1,
  description: 'Coffee',
  amountNative: 3.5,
  currencyCode: 'USD',
  fxRateToBase: 1,
  baseAmount: 3.5,
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
      expect(createCategory).toHaveBeenCalledWith({ name: 'Travel' }),
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
      expect(updateCategory).toHaveBeenCalledWith({ id: 1, name: 'Dining' }),
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
          expenses: [makeExpense({ categoryId: 1 })],
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
});
