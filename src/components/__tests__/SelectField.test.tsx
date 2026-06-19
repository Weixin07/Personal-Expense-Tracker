import React from 'react';
import {
  renderWithProviders,
  screen,
  fireEvent,
} from '../../__tests__/test-utils/renderWithProviders';
import SelectField from '../SelectField';

describe('SelectField', () => {
  it('exposes the field as an accessible button and shows its value', () => {
    renderWithProviders(
      <SelectField
        label="Currency"
        value="USD"
        onPress={jest.fn()}
        accessibilityLabel="Select currency"
      />,
    );
    expect(screen.getByLabelText('Select currency')).toBeOnTheScreen();
    expect(screen.getByDisplayValue('USD')).toBeOnTheScreen();
  });

  it('invokes onPress when the field is tapped', () => {
    const onPress = jest.fn();
    renderWithProviders(
      <SelectField
        label="Category"
        value="No category"
        onPress={onPress}
        accessibilityLabel="Select category"
      />,
    );
    fireEvent.press(screen.getByLabelText('Select category'));
    expect(onPress).toHaveBeenCalledTimes(1);
  });
});
