import React from 'react';
import {
  renderWithProviders,
  screen,
  fireEvent,
} from '../../__tests__/test-utils/renderWithProviders';
import CurrencyPickerDialog from '../CurrencyPickerDialog';

describe('CurrencyPickerDialog', () => {
  it('renders the title and description when visible', () => {
    renderWithProviders(
      <CurrencyPickerDialog
        visible
        onDismiss={jest.fn()}
        onSelect={jest.fn()}
        title="Choose currency"
        description="Pick one"
      />,
    );
    expect(screen.getByText('Choose currency')).toBeOnTheScreen();
    expect(screen.getByText('Pick one')).toBeOnTheScreen();
  });

  it('filters the options by code via the search box', () => {
    renderWithProviders(
      <CurrencyPickerDialog
        visible
        onDismiss={jest.fn()}
        onSelect={jest.fn()}
      />,
    );
    fireEvent.changeText(screen.getByLabelText('Search currency'), 'usd');
    expect(screen.getByText('USD')).toBeOnTheScreen();
    expect(screen.queryByText('EUR')).toBeNull();
  });

  it('invokes onSelect when an option is chosen', () => {
    const onSelect = jest.fn();
    renderWithProviders(
      <CurrencyPickerDialog
        visible
        onDismiss={jest.fn()}
        onSelect={onSelect}
      />,
    );
    fireEvent.changeText(screen.getByLabelText('Search currency'), 'usd');
    fireEvent.press(screen.getByText('USD'));
    expect(onSelect).toHaveBeenCalledWith(
      expect.objectContaining({ code: 'USD' }),
    );
  });

  it('does not dismiss when dismissable is false', () => {
    const onDismiss = jest.fn();
    renderWithProviders(
      <CurrencyPickerDialog
        visible
        dismissable={false}
        showCancelButton={false}
        onDismiss={onDismiss}
        onSelect={jest.fn()}
      />,
    );
    expect(screen.queryByLabelText('Cancel currency selection')).toBeNull();
  });

  it('dismisses via the cancel button when allowed', () => {
    const onDismiss = jest.fn();
    renderWithProviders(
      <CurrencyPickerDialog
        visible
        onDismiss={onDismiss}
        onSelect={jest.fn()}
      />,
    );
    fireEvent.press(screen.getByLabelText('Cancel currency selection'));
    expect(onDismiss).toHaveBeenCalled();
  });
});
