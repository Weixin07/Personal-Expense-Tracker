import React from 'react';
import { AppState } from 'react-native';
import {
  renderWithProviders,
  screen,
  fireEvent,
  waitFor,
  act,
} from '../../__tests__/test-utils/renderWithProviders';
import PinEntryDialog, { type PinEntryDialogProps } from '../PinEntryDialog';

const renderDialog = (overrides: Partial<PinEntryDialogProps> = {}) =>
  renderWithProviders(
    <PinEntryDialog
      visible
      mode="enrol"
      onDismiss={jest.fn()}
      onSubmit={jest.fn()}
      {...overrides}
    />,
  );

describe('PinEntryDialog', () => {
  it('collects a PIN and its confirmation when enrolling', async () => {
    const onSubmit = jest.fn();
    renderDialog({ onSubmit });
    fireEvent.changeText(screen.getByLabelText('New PIN'), '846207');
    fireEvent.changeText(screen.getByLabelText('Confirm new PIN'), '846207');
    fireEvent.press(screen.getByLabelText('Save'));
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({ pin: '846207' }),
    );
  });

  it('asks for a single PIN when verifying', () => {
    renderDialog({ mode: 'verify' });
    expect(screen.getByLabelText('PIN')).toBeOnTheScreen();
    expect(screen.queryByLabelText('Confirm new PIN')).toBeNull();
  });

  it('asks for the current PIN when changing', async () => {
    const onSubmit = jest.fn();
    renderDialog({ mode: 'change', onSubmit });
    fireEvent.changeText(screen.getByLabelText('Current PIN'), '111213');
    fireEvent.changeText(screen.getByLabelText('New PIN'), '846207');
    fireEvent.changeText(screen.getByLabelText('Confirm new PIN'), '846207');
    fireEvent.press(screen.getByLabelText('Save'));
    await waitFor(() =>
      expect(onSubmit).toHaveBeenCalledWith({
        pin: '846207',
        currentPin: '111213',
      }),
    );
  });

  it('refuses a mismatched confirmation', () => {
    const onSubmit = jest.fn();
    renderDialog({ onSubmit });
    fireEvent.changeText(screen.getByLabelText('New PIN'), '846207');
    fireEvent.changeText(screen.getByLabelText('Confirm new PIN'), '846208');
    fireEvent.press(screen.getByLabelText('Save'));
    expect(screen.getByText('The two PINs do not match.')).toBeOnTheScreen();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('refuses a PIN that fails the strength rule', () => {
    const onSubmit = jest.fn();
    renderDialog({ onSubmit });
    fireEvent.changeText(screen.getByLabelText('New PIN'), '123456');
    fireEvent.changeText(screen.getByLabelText('Confirm new PIN'), '123456');
    fireEvent.press(screen.getByLabelText('Save'));
    expect(
      screen.getByText('PIN cannot be a run of consecutive digits.'),
    ).toBeOnTheScreen();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('names the broken rule without echoing the input', () => {
    renderDialog();
    fireEvent.changeText(screen.getByLabelText('New PIN'), '111111');
    fireEvent.changeText(screen.getByLabelText('Confirm new PIN'), '111111');
    fireEvent.press(screen.getByLabelText('Save'));
    expect(
      screen.getByText('PIN cannot be the same digit repeated.'),
    ).toBeOnTheScreen();
    expect(screen.queryByText('111111')).toBeNull();
  });

  it('requires the current PIN before changing', () => {
    const onSubmit = jest.fn();
    renderDialog({ mode: 'change', onSubmit });
    fireEvent.changeText(screen.getByLabelText('New PIN'), '846207');
    fireEvent.changeText(screen.getByLabelText('Confirm new PIN'), '846207');
    fireEvent.press(screen.getByLabelText('Save'));
    expect(screen.getByText('Enter your current PIN.')).toBeOnTheScreen();
    expect(onSubmit).not.toHaveBeenCalled();
  });

  it('discards every entered PIN when the app goes to the background', () => {
    let handler: ((status: string) => void) | undefined;
    jest
      .spyOn(AppState, 'addEventListener')
      .mockImplementationOnce((event, listener) => {
        if (event === 'change') {
          handler = listener as (status: string) => void;
        }
        return { remove: jest.fn() } as ReturnType<
          typeof AppState.addEventListener
        >;
      });
    renderDialog({ mode: 'change' });
    fireEvent.changeText(screen.getByLabelText('Current PIN'), '111213');
    fireEvent.changeText(screen.getByLabelText('New PIN'), '846207');
    fireEvent.changeText(screen.getByLabelText('Confirm new PIN'), '846207');

    act(() => handler?.('background'));

    expect(screen.getByLabelText('Current PIN').props.value).toBe('');
    expect(screen.getByLabelText('New PIN').props.value).toBe('');
    expect(screen.getByLabelText('Confirm new PIN').props.value).toBe('');
  });

  it('surfaces an error raised by the caller', () => {
    renderDialog({ errorMessage: 'Current PIN is incorrect.' });
    expect(screen.getByText('Current PIN is incorrect.')).toBeOnTheScreen();
  });
});
