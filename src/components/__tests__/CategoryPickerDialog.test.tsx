import React from 'react';
import {
  renderWithProviders,
  screen,
  fireEvent,
} from '../../__tests__/test-utils/renderWithProviders';
import CategoryPickerDialog from '../CategoryPickerDialog';
import type { CategoryRecord } from '../../database';

const categories: CategoryRecord[] = [
  {
    type: 'both',
    id: 1,
    name: 'Food',
    createdAt: '2025-01-10T00:00:00.000Z',
    updatedAt: '2025-01-10T00:00:00.000Z',
  },
  {
    type: 'both',
    id: 2,
    name: 'Travel',
    createdAt: '2025-01-10T00:00:00.000Z',
    updatedAt: '2025-01-10T00:00:00.000Z',
  },
];

const typedCategories: CategoryRecord[] = [
  { ...categories[0], id: 10, name: 'Groceries', type: 'expense' },
  { ...categories[0], id: 11, name: 'Salary', type: 'income' },
  { ...categories[0], id: 12, name: 'Gifts', type: 'both' },
];

describe('CategoryPickerDialog', () => {
  it('lists categories plus the "No category" option when visible', () => {
    renderWithProviders(
      <CategoryPickerDialog
        visible
        categories={categories}
        selectedId={null}
        onSelect={jest.fn()}
        onDismiss={jest.fn()}
      />,
    );
    expect(screen.getByText('No category')).toBeOnTheScreen();
    expect(screen.getByText('Food')).toBeOnTheScreen();
    expect(screen.getByText('Travel')).toBeOnTheScreen();
  });

  it('filters the list by the search query', () => {
    renderWithProviders(
      <CategoryPickerDialog
        visible
        categories={categories}
        selectedId={null}
        onSelect={jest.fn()}
        onDismiss={jest.fn()}
      />,
    );
    fireEvent.changeText(screen.getByLabelText('Search category'), 'trav');
    expect(screen.queryByText('Food')).toBeNull();
    expect(screen.getByText('Travel')).toBeOnTheScreen();
  });

  it('invokes onSelect and onDismiss when an option is chosen', () => {
    const onSelect = jest.fn();
    const onDismiss = jest.fn();
    renderWithProviders(
      <CategoryPickerDialog
        visible
        categories={categories}
        selectedId={null}
        onSelect={onSelect}
        onDismiss={onDismiss}
      />,
    );
    fireEvent.press(screen.getByLabelText('Select Food'));
    expect(onSelect).toHaveBeenCalledWith(1);
    expect(onDismiss).toHaveBeenCalled();
  });

  it('dismisses via the cancel button', () => {
    const onDismiss = jest.fn();
    renderWithProviders(
      <CategoryPickerDialog
        visible
        categories={categories}
        selectedId={2}
        onSelect={jest.fn()}
        onDismiss={onDismiss}
      />,
    );
    fireEvent.press(screen.getByLabelText('Cancel category selection'));
    expect(onDismiss).toHaveBeenCalled();
  });

  describe('directionFilter', () => {
    it('offers every category when no direction is given', () => {
      renderWithProviders(
        <CategoryPickerDialog
          visible
          categories={typedCategories}
          selectedId={null}
          onSelect={jest.fn()}
          onDismiss={jest.fn()}
        />,
      );
      expect(screen.getByText('Groceries')).toBeOnTheScreen();
      expect(screen.getByText('Salary')).toBeOnTheScreen();
      expect(screen.getByText('Gifts')).toBeOnTheScreen();
    });

    it('keeps matching and both-typed categories for an expense', () => {
      renderWithProviders(
        <CategoryPickerDialog
          visible
          categories={typedCategories}
          selectedId={null}
          directionFilter="expense"
          onSelect={jest.fn()}
          onDismiss={jest.fn()}
        />,
      );
      expect(screen.getByText('Groceries')).toBeOnTheScreen();
      expect(screen.getByText('Gifts')).toBeOnTheScreen();
      expect(screen.queryByText('Salary')).toBeNull();
    });

    it('keeps matching and both-typed categories for income', () => {
      renderWithProviders(
        <CategoryPickerDialog
          visible
          categories={typedCategories}
          selectedId={null}
          directionFilter="income"
          onSelect={jest.fn()}
          onDismiss={jest.fn()}
        />,
      );
      expect(screen.getByText('Salary')).toBeOnTheScreen();
      expect(screen.getByText('Gifts')).toBeOnTheScreen();
      expect(screen.queryByText('Groceries')).toBeNull();
    });
  });
});
