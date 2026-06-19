import { AppState } from 'react-native';
import * as Keychain from 'react-native-keychain';
import { renderHook, act, waitFor } from '@testing-library/react-native';
import { useBiometricGate } from '../useBiometricGate';

let appStateHandler: ((status: string) => void) | undefined;
const emitAppState = (status: string): void => appStateHandler?.(status);

beforeEach(() => {
  jest.clearAllMocks();
  appStateHandler = undefined;
  jest
    .spyOn(AppState, 'addEventListener')
    .mockImplementation((event, listener) => {
      if (event === 'change') {
        appStateHandler = listener as (status: string) => void;
      }
      return { remove: jest.fn() } as ReturnType<
        typeof AppState.addEventListener
      >;
    });
  (Keychain.getGenericPassword as jest.Mock).mockResolvedValue(false);
  (Keychain.setGenericPassword as jest.Mock).mockResolvedValue(true);
  (Keychain.resetGenericPassword as jest.Mock).mockResolvedValue(true);
});

afterEach(() => {
  jest.restoreAllMocks();
});

describe('useBiometricGate', () => {
  it('unlocks immediately when the gate is disabled', async () => {
    const { result } = renderHook(() => useBiometricGate({ enabled: false }));
    let outcome = false;
    await act(async () => {
      outcome = await result.current.unlockWithBiometrics();
    });
    expect(outcome).toBe(true);
    expect(result.current.isLocked).toBe(false);
  });

  it('unlocks when biometric authentication succeeds', async () => {
    (Keychain.getGenericPassword as jest.Mock).mockResolvedValueOnce({
      username: 'expense-tracker',
      password: 'biometric-lock',
    });
    const { result } = renderHook(() => useBiometricGate({ enabled: true }));
    let outcome = false;
    await act(async () => {
      outcome = await result.current.unlockWithBiometrics();
    });
    expect(outcome).toBe(true);
    expect(result.current.isLocked).toBe(false);
    expect(result.current.lastError).toBeNull();
  });

  it('records a cancelled authentication', async () => {
    (Keychain.getGenericPassword as jest.Mock).mockResolvedValue(false);
    const { result } = renderHook(() => useBiometricGate({ enabled: true }));
    let outcome = true;
    await act(async () => {
      outcome = await result.current.unlockWithBiometrics();
    });
    expect(outcome).toBe(false);
    expect(result.current.lastError).toBeTruthy();
  });

  it('records a failed authentication attempt', async () => {
    (Keychain.getGenericPassword as jest.Mock).mockRejectedValueOnce(
      new Error('denied'),
    );
    const { result } = renderHook(() => useBiometricGate({ enabled: true }));
    let outcome = true;
    await act(async () => {
      outcome = await result.current.unlockWithBiometrics();
    });
    expect(outcome).toBe(false);
    expect(result.current.lastError).toBe('denied');
  });

  it('creates a keychain credential on ensureCredential', async () => {
    const { result } = renderHook(() => useBiometricGate({ enabled: true }));
    await act(async () => {
      await result.current.ensureCredential();
    });
    expect(Keychain.setGenericPassword).toHaveBeenCalled();
  });

  it('clears the keychain credential on clearCredential', async () => {
    const { result } = renderHook(() => useBiometricGate({ enabled: true }));
    await act(async () => {
      await result.current.clearCredential();
    });
    expect(Keychain.resetGenericPassword).toHaveBeenCalled();
  });

  it('clears any pending error', async () => {
    (Keychain.getGenericPassword as jest.Mock).mockResolvedValue(false);
    const { result } = renderHook(() => useBiometricGate({ enabled: true }));
    await act(async () => {
      await result.current.unlockWithBiometrics();
    });
    expect(result.current.lastError).toBeTruthy();
    act(() => result.current.clearError());
    expect(result.current.lastError).toBeNull();
  });

  it('locks after the background timeout elapses', async () => {
    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(1_000_000);
    (Keychain.getGenericPassword as jest.Mock).mockResolvedValue(false);

    const { result } = renderHook(() => useBiometricGate({ enabled: true }));

    act(() => emitAppState('background'));
    nowSpy.mockReturnValue(1_000_000 + 6 * 60 * 1000);
    act(() => emitAppState('active'));

    expect(result.current.isLocked).toBe(true);
    await waitFor(() => expect(result.current.lastError).toBeTruthy());
  });

  it('does not lock before the timeout elapses', () => {
    const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(1_000_000);

    const { result } = renderHook(() => useBiometricGate({ enabled: true }));

    act(() => emitAppState('background'));
    nowSpy.mockReturnValue(1_000_000 + 60 * 1000);
    act(() => emitAppState('active'));

    expect(result.current.isLocked).toBe(false);
  });

  it('applyEnabledState resets the lock state', async () => {
    (Keychain.getGenericPassword as jest.Mock).mockResolvedValue(false);
    const { result } = renderHook(() => useBiometricGate({ enabled: true }));
    await act(async () => {
      await result.current.unlockWithBiometrics();
    });
    expect(result.current.lastError).toBeTruthy();
    act(() => result.current.applyEnabledState(false));
    expect(result.current.isLocked).toBe(false);
    expect(result.current.lastError).toBeNull();
  });
});
