import { act, renderHook } from '@testing-library/react-native';
import { useDebouncedValue } from '../useDebouncedValue';

describe('useDebouncedValue', () => {
  beforeEach(() => {
    jest.useFakeTimers();
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  it('returns the initial value before any delay has elapsed', () => {
    const { result } = renderHook(() => useDebouncedValue('cof', 250));

    expect(result.current).toBe('cof');
  });

  it('settles on the latest value once the delay elapses', () => {
    const { result, rerender } = renderHook<string, { value: string }>(
      ({ value }) => useDebouncedValue(value, 250),
      { initialProps: { value: '' } },
    );

    rerender({ value: 'coffee' });
    expect(result.current).toBe('');

    act(() => {
      jest.advanceTimersByTime(250);
    });
    expect(result.current).toBe('coffee');
  });

  it('settles once for a rapid sequence rather than for every step', () => {
    const { result, rerender } = renderHook<string, { value: string }>(
      ({ value }) => useDebouncedValue(value, 250),
      { initialProps: { value: '' } },
    );

    ['c', 'co', 'cof'].forEach(value => {
      rerender({ value });
      act(() => {
        jest.advanceTimersByTime(100);
      });
    });
    expect(result.current).toBe('');

    act(() => {
      jest.advanceTimersByTime(250);
    });
    expect(result.current).toBe('cof');
  });

  it('cancels a pending value when the input is cleared before it lands', () => {
    const { result, rerender } = renderHook<string, { value: string }>(
      ({ value }) => useDebouncedValue(value, 250),
      { initialProps: { value: '' } },
    );

    rerender({ value: 'cof' });
    act(() => {
      jest.advanceTimersByTime(100);
    });

    rerender({ value: '' });
    act(() => {
      jest.advanceTimersByTime(250);
    });

    expect(result.current).toBe('');
  });

  it('cancels the pending timer on unmount', () => {
    const clearTimeoutSpy = jest.spyOn(global, 'clearTimeout');
    const { rerender, unmount } = renderHook<string, { value: string }>(
      ({ value }) => useDebouncedValue(value, 250),
      { initialProps: { value: '' } },
    );

    rerender({ value: 'coffee' });
    unmount();

    expect(clearTimeoutSpy).toHaveBeenCalled();
    expect(jest.getTimerCount()).toBe(0);

    clearTimeoutSpy.mockRestore();
  });
});
