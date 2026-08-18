import React from 'react';
import FundPickerDialog from '../FundPickerDialog';
import {
  renderWithProviders,
  screen,
  fireEvent,
} from '../../__tests__/test-utils/renderWithProviders';
import type { FundRecord } from '../../database';

const fund = (id: number, name: string, currencyCode: string | null = null) =>
  ({
    id,
    name,
    currencyCode,
    openingBalance: 0,
    notes: null,
    createdAt: '2025-01-01T00:00:00.000Z',
    updatedAt: '2025-01-01T00:00:00.000Z',
  }) satisfies FundRecord;

const funds = [fund(1, 'General'), fund(2, 'Travel', 'EUR'), fund(3, 'Rainy')];

const renderDialog = (
  props: Partial<React.ComponentProps<typeof FundPickerDialog>> = {},
) => {
  const onSelect = jest.fn();
  const onDismiss = jest.fn();
  renderWithProviders(
    <FundPickerDialog
      visible
      funds={funds}
      selectedId={null}
      onSelect={onSelect}
      onDismiss={onDismiss}
      {...props}
    />,
  );
  return { onSelect, onDismiss };
};

describe('FundPickerDialog', () => {
  it('offers no "none" option, because every transaction needs a fund', () => {
    renderDialog();
    expect(screen.queryByText('No fund')).toBeNull();
    expect(screen.getByText('General')).toBeOnTheScreen();
  });

  it('reports the chosen fund and closes', () => {
    const { onSelect, onDismiss } = renderDialog();

    fireEvent.press(screen.getByLabelText('Select Travel'));

    expect(onSelect).toHaveBeenCalledWith(2);
    expect(onDismiss).toHaveBeenCalled();
  });

  it('omits the excluded fund so a transfer cannot pick one on both sides', () => {
    renderDialog({ excludeId: 2 });

    expect(screen.queryByText('Travel')).toBeNull();
    expect(screen.getByText('General')).toBeOnTheScreen();
  });

  it('narrows the list as the query is typed', () => {
    renderDialog();

    fireEvent.changeText(screen.getByLabelText('Search fund'), 'trav');

    expect(screen.getByText('Travel')).toBeOnTheScreen();
    expect(screen.queryByText('Rainy')).toBeNull();
  });

  it('shows the currency a fund is held in', () => {
    renderDialog();
    expect(screen.getByText('EUR')).toBeOnTheScreen();
  });

  it('orders by usage when counts are supplied', () => {
    renderDialog({
      usageCounts: new Map([
        [3, { inWindow: 9, older: 0 }],
        [1, { inWindow: 1, older: 0 }],
      ]),
    });

    const rendered = screen
      .getAllByRole('button')
      .map(node => node.props.accessibilityLabel);
    expect(rendered.indexOf('Select Rainy')).toBeLessThan(
      rendered.indexOf('Select General'),
    );
  });
});
