import React from 'react';
import {
  fireEvent,
  renderWithProviders,
  screen,
} from '../../__tests__/test-utils/renderWithProviders';
import { LoadErrorScreen } from '../LoadErrorScreen';

const DETAIL = '(code 14 SQLITE_CANTOPEN): Permission denied';

describe('LoadErrorScreen', () => {
  it('shows the title, body and detail', () => {
    renderWithProviders(
      <LoadErrorScreen detail={DETAIL} busy={false} onRetry={jest.fn()} />,
    );
    expect(screen.getByText("Couldn't open your data")).toBeOnTheScreen();
    expect(screen.getByText(/Nothing has been deleted/)).toBeOnTheScreen();
    expect(screen.getByText(DETAIL)).toBeOnTheScreen();
  });

  it('calls onRetry', () => {
    const onRetry = jest.fn();
    renderWithProviders(
      <LoadErrorScreen detail={DETAIL} busy={false} onRetry={onRetry} />,
    );
    fireEvent.press(screen.getByLabelText('Try opening your data again'));
    expect(onRetry).toHaveBeenCalledTimes(1);
  });

  it('disables Try again while busy', () => {
    const onRetry = jest.fn();
    renderWithProviders(
      <LoadErrorScreen detail={DETAIL} busy onRetry={onRetry} />,
    );
    const retry = screen.getByLabelText('Try opening your data again');
    expect(retry).toBeDisabled();
    fireEvent.press(retry);
    expect(onRetry).not.toHaveBeenCalled();
  });

  it('keeps the last detail when detail clears while busy', () => {
    const { rerender } = renderWithProviders(
      <LoadErrorScreen detail={DETAIL} busy={false} onRetry={jest.fn()} />,
    );
    rerender(<LoadErrorScreen detail={null} busy onRetry={jest.fn()} />);
    expect(screen.getByText(DETAIL)).toBeOnTheScreen();
  });

  it('shows no detail line before any detail arrives', () => {
    renderWithProviders(
      <LoadErrorScreen detail={null} busy={false} onRetry={jest.fn()} />,
    );
    expect(screen.queryByText(DETAIL)).toBeNull();
    expect(screen.getByText("Couldn't open your data")).toBeOnTheScreen();
  });

  it('marks the title as a header', () => {
    renderWithProviders(
      <LoadErrorScreen detail={DETAIL} busy={false} onRetry={jest.fn()} />,
    );
    expect(
      screen.getByRole('header', { name: "Couldn't open your data" }),
    ).toBeOnTheScreen();
  });
});
