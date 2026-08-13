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

  it('describes each option with a human label, not the stored enum', () => {
    renderWithProviders(
      <CategoryPickerDialog
        visible
        categories={typedCategories}
        selectedId={null}
        onSelect={jest.fn()}
        onDismiss={jest.fn()}
      />,
    );
    expect(screen.getByText('Expense only')).toBeOnTheScreen();
    expect(screen.getByText('Income only')).toBeOnTheScreen();
    expect(screen.getByText('Expense and income')).toBeOnTheScreen();
    expect(screen.queryByText('expense')).toBeNull();
    expect(screen.queryByText('income')).toBeNull();
    expect(screen.queryByText('both')).toBeNull();
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

  describe('usageCounts', () => {
    const rankableCategories: CategoryRecord[] = [
      { ...categories[0], id: 1, name: 'Alpha' },
      { ...categories[0], id: 2, name: 'Bravo' },
      { ...categories[0], id: 3, name: 'Charlie' },
    ];

    const renderedOrder = () =>
      screen
        .getAllByLabelText(/^Select /)
        .map(node =>
          String(node.props.accessibilityLabel).replace('Select ', ''),
        );

    it('orders by name when no usage is supplied', () => {
      renderWithProviders(
        <CategoryPickerDialog
          visible
          categories={rankableCategories}
          selectedId={null}
          onSelect={jest.fn()}
          onDismiss={jest.fn()}
        />,
      );
      expect(renderedOrder()).toEqual([
        'No category',
        'Alpha',
        'Bravo',
        'Charlie',
      ]);
    });

    it('orders by recent usage ahead of name', () => {
      renderWithProviders(
        <CategoryPickerDialog
          visible
          categories={rankableCategories}
          selectedId={null}
          usageCounts={
            new Map([
              [2, { inWindow: 5, older: 0 }],
              [3, { inWindow: 2, older: 0 }],
            ])
          }
          onSelect={jest.fn()}
          onDismiss={jest.fn()}
        />,
      );
      expect(renderedOrder()).toEqual([
        'No category',
        'Bravo',
        'Charlie',
        'Alpha',
      ]);
    });

    it('ranks any recent use above older use', () => {
      renderWithProviders(
        <CategoryPickerDialog
          visible
          categories={rankableCategories}
          selectedId={null}
          usageCounts={
            new Map([
              [1, { inWindow: 0, older: 9 }],
              [3, { inWindow: 1, older: 0 }],
            ])
          }
          onSelect={jest.fn()}
          onDismiss={jest.fn()}
        />,
      );
      expect(renderedOrder()).toEqual([
        'No category',
        'Charlie',
        'Alpha',
        'Bravo',
      ]);
    });

    it('keeps never-used categories in the list, alphabetically last', () => {
      renderWithProviders(
        <CategoryPickerDialog
          visible
          categories={rankableCategories}
          selectedId={null}
          usageCounts={new Map([[3, { inWindow: 4, older: 0 }]])}
          onSelect={jest.fn()}
          onDismiss={jest.fn()}
        />,
      );
      expect(renderedOrder()).toEqual([
        'No category',
        'Charlie',
        'Alpha',
        'Bravo',
      ]);
    });
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
