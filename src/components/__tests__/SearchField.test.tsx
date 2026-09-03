import React from 'react';
import SearchField from '../SearchField';
import {
  renderWithProviders,
  screen,
  fireEvent,
} from '../../__tests__/test-utils/renderWithProviders';

describe('SearchField', () => {
  it('renders the placeholder and is found by its accessibility label', () => {
    renderWithProviders(
      <SearchField
        value=""
        onChangeText={jest.fn()}
        placeholder="Search transactions"
        accessibilityLabel="Search transactions"
      />,
    );

    expect(screen.getByLabelText('Search transactions')).toBeTruthy();
    expect(screen.getByPlaceholderText('Search transactions')).toBeTruthy();
  });

  it('shows the value it is given', () => {
    renderWithProviders(
      <SearchField
        value="costa"
        onChangeText={jest.fn()}
        placeholder="Search transactions"
        accessibilityLabel="Search transactions"
      />,
    );

    expect(screen.getByLabelText('Search transactions').props.value).toBe(
      'costa',
    );
  });

  it('reports every keystroke as it happens', () => {
    const onChangeText = jest.fn();
    renderWithProviders(
      <SearchField
        value=""
        onChangeText={onChangeText}
        placeholder="Search fund"
        accessibilityLabel="Search fund"
      />,
    );

    fireEvent.changeText(screen.getByLabelText('Search fund'), 'tra');

    expect(onChangeText).toHaveBeenCalledWith('tra');
  });
});
