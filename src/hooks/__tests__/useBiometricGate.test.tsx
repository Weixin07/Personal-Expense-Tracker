import { AppState } from 'react-native';
import * as Keychain from 'react-native-keychain';
import { renderHook, act, waitFor } from '@testing-library/react-native';
import {
  useBiometricGate,
  biometricCredentialExists,
} from '../useBiometricGate';
import { PIN_LOCKOUT_ATTEMPTS } from '../../security/lockoutPolicy';

const BIOMETRIC_SERVICE = 'expense-tracker-biometric-gate';
const APP_PIN_SERVICE = 'expense-tracker-app-pin';
const LOCKOUT_SERVICE = 'expense-tracker-app-pin-lockout';

let appStateHandler: ((status: string) => void) | undefined;
const emitAppState = (status: string): void => appStateHandler?.(status);

/**
 * The gate reads three Keychain entries — the biometric credential, the PIN and
 * the lockout counter — so a bare mockResolvedValue would answer whichever
 * happened to be read first. Each is stubbed by its own service.
 */
type StoredCredential = { username: string; password: string } | false;
let credentialsByService: Record<string, StoredCredential>;

const stubCredential = (service: string, value: StoredCredential): void => {
  credentialsByService[service] = value;
};

/**
 * Writes a real record through the production encoder, so what is stubbed back
 * verifies against the same derive the hook calls rather than a hand-built blob.
 */
const storePin = async (pin: string): Promise<void> => {
  const { setPin } = jest.requireActual('../../security/pinCredential');
  const written: string[] = [];
  (Keychain.setGenericPassword as jest.Mock).mockImplementation(
    (_username: string, password: string, options: { service: string }) => {
      if (options.service === APP_PIN_SERVICE) {
        written.push(password);
      }
      return Promise.resolve(true);
    },
  );
  await setPin(pin, 150_000);
  stubCredential(APP_PIN_SERVICE, {
    username: 'expense-tracker',
    password: written[written.length - 1],
  });
  (Keychain.setGenericPassword as jest.Mock).mockResolvedValue(true);
};

beforeEach(() => {
  jest.clearAllMocks();
  appStateHandler = undefined;
  credentialsByService = {};
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
  (Keychain.getGenericPassword as jest.Mock).mockImplementation(
    ({ service }: { service: string }) =>
      Promise.resolve(credentialsByService[service] ?? false),
  );
  (Keychain.setGenericPassword as jest.Mock).mockResolvedValue(true);
  (Keychain.resetGenericPassword as jest.Mock).mockResolvedValue(true);
  (Keychain.hasGenericPassword as jest.Mock).mockImplementation(
    ({ service }: { service: string }) =>
      Promise.resolve(Boolean(credentialsByService[service])),
  );
  // clearAllMocks clears calls but not implementations, so without this the
  // no-biometric suites below leak their null into every test that follows.
  (Keychain.getSupportedBiometryType as jest.Mock).mockResolvedValue(
    'Fingerprint',
  );
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
    stubCredential(BIOMETRIC_SERVICE, {
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
    (Keychain.getGenericPassword as jest.Mock).mockImplementation(
      ({ service }: { service: string }) =>
        service === BIOMETRIC_SERVICE
          ? Promise.reject(new Error('denied'))
          : Promise.resolve(false),
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

  it('creates the credential with device-passcode fallback access control', async () => {
    const { result } = renderHook(() => useBiometricGate({ enabled: true }));
    await act(async () => {
      await result.current.ensureCredential();
    });
    expect(Keychain.setGenericPassword).toHaveBeenCalledWith(
      expect.anything(),
      expect.anything(),
      expect.objectContaining({
        accessControl:
          Keychain.ACCESS_CONTROL.BIOMETRY_CURRENT_SET_OR_DEVICE_PASSCODE,
      }),
    );
  });

  it('biometricCredentialExists reflects hasGenericPassword', async () => {
    stubCredential(BIOMETRIC_SERVICE, {
      username: 'expense-tracker',
      password: 'biometric-lock',
    });
    await expect(biometricCredentialExists()).resolves.toBe(true);
    expect(Keychain.hasGenericPassword).toHaveBeenCalled();
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
    stubCredential(BIOMETRIC_SERVICE, {
      username: 'expense-tracker',
      password: 'biometric-lock',
    });
    await storePin('846207');
    // The entry exists but the read comes back empty, which is what a cancelled
    // prompt looks like; the other services must still answer normally.
    (Keychain.getGenericPassword as jest.Mock).mockImplementation(
      ({ service }: { service: string }) =>
        Promise.resolve(
          service === BIOMETRIC_SERVICE
            ? false
            : (credentialsByService[service] ?? false),
        ),
    );

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

  it('locks on cold start once settings have hydrated with the gate enabled', async () => {
    (Keychain.getGenericPassword as jest.Mock).mockResolvedValue(false);
    const { result } = renderHook(() =>
      useBiometricGate({ enabled: true, isInitialised: true }),
    );
    await waitFor(() => expect(result.current.isLocked).toBe(true));
    expect(Keychain.getGenericPassword).toHaveBeenCalled();
  });

  it('does not lock on cold start when the gate is disabled', async () => {
    const { result } = renderHook(() =>
      useBiometricGate({ enabled: false, isInitialised: true }),
    );
    await waitFor(() => expect(result.current.isLocked).toBe(false));
    expect(Keychain.getGenericPassword).not.toHaveBeenCalledWith(
      expect.objectContaining({ service: BIOMETRIC_SERVICE }),
    );
  });

  it('does not cold-lock when the gate is enabled after the initial hydration', async () => {
    (Keychain.getGenericPassword as jest.Mock).mockResolvedValue(false);
    const { result, rerender } = renderHook(
      ({ enabled }: { enabled: boolean }) =>
        useBiometricGate({ enabled, isInitialised: true }),
      { initialProps: { enabled: false } },
    );
    await waitFor(() => expect(result.current.isLocked).toBe(false));
    rerender({ enabled: true });
    await waitFor(() => expect(result.current.isLocked).toBe(false));
    expect(Keychain.getGenericPassword).not.toHaveBeenCalledWith(
      expect.objectContaining({ service: BIOMETRIC_SERVICE }),
    );
  });

  describe('the PIN path', () => {
    it('unlocks with the correct PIN', async () => {
      await storePin('846207');
      const { result } = renderHook(() => useBiometricGate({ enabled: true }));
      let unlocked = false;
      await act(async () => {
        unlocked = await result.current.unlockWithPin('846207');
      });
      expect(unlocked).toBe(true);
      expect(result.current.isLocked).toBe(false);
    });

    it('rejects a wrong PIN and counts the failure', async () => {
      await storePin('846207');
      const { result } = renderHook(() => useBiometricGate({ enabled: true }));
      await act(async () => {
        await result.current.unlockWithPin('111213');
      });
      await waitFor(() =>
        expect(result.current.lockout.attemptsRemaining).toBe(9),
      );
    });

    /**
     * A prompt fired under a throttle would talk to hardware the user cannot
     * answer with, and its dismissal would set lastError over the countdown.
     */
    it('does not auto-prompt for biometrics while throttled', async () => {
      await storePin('846207');
      stubCredential(LOCKOUT_SERVICE, {
        username: 'expense-tracker',
        password: JSON.stringify({
          consecutiveFailures: 4,
          nextAllowedAt: Date.now() + 60_000,
        }),
      });
      const { result } = renderHook(() =>
        useBiometricGate({ enabled: true, isInitialised: true }),
      );
      await waitFor(() => expect(result.current.isLocked).toBe(true));
      await waitFor(() => expect(result.current.lockout.allowed).toBe(false));

      const promptCalls = (
        Keychain.getGenericPassword as jest.Mock
      ).mock.calls.filter(
        ([options]) => options?.service === BIOMETRIC_SERVICE,
      );
      expect(promptCalls).toHaveLength(0);
    });

    it('refuses input while throttled rather than checking the PIN', async () => {
      await storePin('846207');
      stubCredential(LOCKOUT_SERVICE, {
        username: 'expense-tracker',
        password: JSON.stringify({
          consecutiveFailures: 4,
          nextAllowedAt: Date.now() + 60_000,
        }),
      });
      const { result } = renderHook(() => useBiometricGate({ enabled: true }));
      await waitFor(() => expect(result.current.lockout.allowed).toBe(false));
      let unlocked = true;
      await act(async () => {
        unlocked = await result.current.unlockWithPin('846207');
      });
      expect(unlocked).toBe(false);
      expect(result.current.isLocked).toBe(false);
    });

    // Under the rule on `changeAppPin`.
    it('applies the same throttle to a PIN change', async () => {
      await storePin('846207');
      stubCredential(LOCKOUT_SERVICE, {
        username: 'expense-tracker',
        password: JSON.stringify({
          consecutiveFailures: 4,
          nextAllowedAt: Date.now() + 60_000,
        }),
      });
      const { result } = renderHook(() => useBiometricGate({ enabled: true }));
      await waitFor(() => expect(result.current.lockout.allowed).toBe(false));
      let changed = true;
      await act(async () => {
        changed = await result.current.changeAppPin('846207', '391584');
      });
      expect(changed).toBe(false);
    });

    it('refuses a PIN change under a wrong current PIN', async () => {
      await storePin('846207');
      const { result } = renderHook(() => useBiometricGate({ enabled: true }));
      let changed = true;
      await act(async () => {
        changed = await result.current.changeAppPin('111213', '391584');
      });
      expect(changed).toBe(false);
    });

    it('refuses to enrol a PIN that fails the strength rule', async () => {
      const { result } = renderHook(() => useBiometricGate({ enabled: true }));
      await act(async () => {
        await expect(result.current.setAppPin('123456')).rejects.toThrow(
          /consecutive digits/,
        );
      });
    });

    // Under the rule on `LockoutState`.
    it('does not count a dismissed biometric prompt as a PIN failure', async () => {
      await storePin('846207');
      const { result } = renderHook(() => useBiometricGate({ enabled: true }));
      await act(async () => {
        await result.current.unlockWithBiometrics();
      });
      expect(result.current.lockout.attemptsRemaining).toBe(
        PIN_LOCKOUT_ATTEMPTS,
      );
    });
  });

  describe('when the device holds no biometric credential', () => {
    it('reports biometrics as unavailable once the probe lands', async () => {
      const { result } = renderHook(() =>
        useBiometricGate({ enabled: true, isInitialised: true }),
      );
      await waitFor(() =>
        expect(result.current.biometricsAvailable).toBe(false),
      );
    });

    /**
     * Prompting here produces a cancellation the user never made, on a device
     * where the PIN is the only way in.
     */
    it('does not auto-prompt, and raises no cancellation error', async () => {
      const { result } = renderHook(() =>
        useBiometricGate({ enabled: true, isInitialised: true }),
      );
      await waitFor(() => expect(result.current.isLocked).toBe(true));
      await waitFor(() =>
        expect(result.current.biometricsAvailable).toBe(false),
      );

      const biometricReads = (
        Keychain.getGenericPassword as jest.Mock
      ).mock.calls.filter(
        ([options]) => options?.service === BIOMETRIC_SERVICE,
      );
      expect(biometricReads).toHaveLength(0);
      expect(result.current.lastError).toBeNull();
    });

    it('auto-prompts as usual once a credential exists', async () => {
      stubCredential(BIOMETRIC_SERVICE, {
        username: 'expense-tracker',
        password: 'biometric-lock',
      });
      await storePin('846207');
      const { result } = renderHook(() =>
        useBiometricGate({ enabled: true, isInitialised: true }),
      );
      await waitFor(() => expect(result.current.isLocked).toBe(false));
    });
  });

  /** Under the rule on `biometryUsable`, an entry here would unlock itself. */
  describe('when no biometric is enrolled', () => {
    beforeEach(() => {
      (Keychain.getSupportedBiometryType as jest.Mock).mockResolvedValue(null);
    });

    it('writes no credential, so nothing can be read back unchallenged', async () => {
      const { result } = renderHook(() => useBiometricGate({ enabled: true }));
      await act(async () => {
        await result.current.ensureCredential();
      });

      const biometricWrites = (
        Keychain.setGenericPassword as jest.Mock
      ).mock.calls.filter(
        ([, , options]) => options?.service === BIOMETRIC_SERVICE,
      );
      expect(biometricWrites).toHaveLength(0);
    });

    it('distrusts a credential left by an earlier install', async () => {
      stubCredential(BIOMETRIC_SERVICE, {
        username: 'expense-tracker',
        password: 'biometric-lock',
      });
      const { result } = renderHook(() =>
        useBiometricGate({ enabled: true, isInitialised: true }),
      );
      await waitFor(() =>
        expect(result.current.biometricsAvailable).toBe(false),
      );
    });

    it('stays locked rather than auto-unlocking through the stale credential', async () => {
      stubCredential(BIOMETRIC_SERVICE, {
        username: 'expense-tracker',
        password: 'biometric-lock',
      });
      const { result } = renderHook(() =>
        useBiometricGate({ enabled: true, isInitialised: true }),
      );
      await waitFor(() => expect(result.current.isLocked).toBe(true));
      await waitFor(() =>
        expect(result.current.biometricsAvailable).toBe(false),
      );

      const biometricReads = (
        Keychain.getGenericPassword as jest.Mock
      ).mock.calls.filter(
        ([options]) => options?.service === BIOMETRIC_SERVICE,
      );
      expect(biometricReads).toHaveLength(0);
      expect(result.current.isLocked).toBe(true);
    });

    it('falls back to the PIN when the probe itself fails', async () => {
      (Keychain.getSupportedBiometryType as jest.Mock).mockRejectedValue(
        new Error('keystore unavailable'),
      );
      const { result } = renderHook(() =>
        useBiometricGate({ enabled: true, isInitialised: true }),
      );
      await waitFor(() =>
        expect(result.current.biometricsAvailable).toBe(false),
      );
    });
  });

  describe('when the gate is on with no PIN', () => {
    it('reports the PIN as unusable once the probe lands', async () => {
      const { result } = renderHook(() =>
        useBiometricGate({ enabled: true, isInitialised: true }),
      );
      await waitFor(() => expect(result.current.pinUsable).toBe(false));
    });

    it('still requires biometrics to unlock, so enrolment cannot stand in for them', async () => {
      stubCredential(BIOMETRIC_SERVICE, {
        username: 'expense-tracker',
        password: 'biometric-lock',
      });
      const { result } = renderHook(() =>
        useBiometricGate({ enabled: true, isInitialised: true }),
      );
      await waitFor(() => expect(result.current.pinUsable).toBe(false));
      await waitFor(() => expect(result.current.isLocked).toBe(false));

      const biometricReads = (
        Keychain.getGenericPassword as jest.Mock
      ).mock.calls.filter(
        ([options]) => options?.service === BIOMETRIC_SERVICE,
      );
      expect(biometricReads).toHaveLength(1);
      expect(result.current.pinStored).toBe(false);
    });

    it('reports a stored but unreadable PIN as stored, not usable', async () => {
      stubCredential(APP_PIN_SERVICE, {
        username: 'expense-tracker',
        password: 'not a record',
      });
      const { result } = renderHook(() => useBiometricGate({ enabled: true }));
      await waitFor(() => expect(result.current.pinStored).toBe(true));
      expect(result.current.pinUsable).toBe(false);
    });

    it('reports a PIN as stored when the existence probe fails', async () => {
      (Keychain.hasGenericPassword as jest.Mock).mockRejectedValue(
        new Error('keystore unavailable'),
      );
      const { result } = renderHook(() => useBiometricGate({ enabled: true }));
      await waitFor(() => expect(result.current.pinStored).toBe(true));
    });

    // Under the rule on `chargeFailure`.
    it('charges no failure for a PIN entered against no credential', async () => {
      const { result } = renderHook(() => useBiometricGate({ enabled: true }));
      await waitFor(() => expect(result.current.pinUsable).toBe(false));

      await act(async () => {
        await result.current.unlockWithPin('846207');
        await result.current.unlockWithPin('846207');
        await result.current.unlockWithPin('846207');
        await result.current.unlockWithPin('846207');
      });

      const lockoutWrites = (
        Keychain.setGenericPassword as jest.Mock
      ).mock.calls.filter(
        ([, , options]) => options?.service === LOCKOUT_SERVICE,
      );
      expect(lockoutWrites).toHaveLength(0);
      expect(result.current.lockout.allowed).toBe(true);
      expect(result.current.lockout.attemptsRemaining).toBe(
        PIN_LOCKOUT_ATTEMPTS,
      );
    });

    it('reports the PIN as usable once one is set', async () => {
      stubCredential(BIOMETRIC_SERVICE, {
        username: 'expense-tracker',
        password: 'biometric-lock',
      });
      const { result } = renderHook(() =>
        useBiometricGate({ enabled: true, isInitialised: true }),
      );
      await waitFor(() => expect(result.current.pinUsable).toBe(false));

      (Keychain.setGenericPassword as jest.Mock).mockImplementation(
        (username: string, password: string, options: { service: string }) => {
          stubCredential(options.service, { username, password });
          return Promise.resolve(true);
        },
      );
      await act(async () => {
        await result.current.setAppPin('846207');
      });
      await waitFor(() => expect(result.current.pinUsable).toBe(true));
      await waitFor(() => expect(result.current.isLocked).toBe(false));
    });
  });

  describe('backgroundNonce', () => {
    it('starts at zero', () => {
      const { result } = renderHook(() => useBiometricGate({ enabled: true }));
      expect(result.current.backgroundNonce).toBe(0);
    });

    it('advances on every background transition', () => {
      const { result } = renderHook(() => useBiometricGate({ enabled: true }));
      act(() => emitAppState('background'));
      expect(result.current.backgroundNonce).toBe(1);
      act(() => emitAppState('active'));
      act(() => emitAppState('inactive'));
      expect(result.current.backgroundNonce).toBe(2);
    });

    it('does not advance on returning to the foreground', () => {
      const { result } = renderHook(() => useBiometricGate({ enabled: true }));
      act(() => emitAppState('background'));
      const afterBackground = result.current.backgroundNonce;
      act(() => emitAppState('active'));
      expect(result.current.backgroundNonce).toBe(afterBackground);
    });

    it('advances even when the gate is off', () => {
      const { result } = renderHook(() => useBiometricGate({ enabled: false }));
      act(() => emitAppState('background'));
      expect(result.current.backgroundNonce).toBe(1);
    });
  });

  describe('auto-lock presets', () => {
    it.each([
      [0, 0],
      [1, 60 * 1000],
      [5, 5 * 60 * 1000],
      [15, 15 * 60 * 1000],
      [30, 30 * 60 * 1000],
    ])('locks at the %i-minute boundary', async (minutes, timeoutMs) => {
      const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(1_000_000);
      const { result } = renderHook(() =>
        useBiometricGate({ enabled: true, autoLockMinutes: minutes }),
      );
      act(() => emitAppState('background'));
      nowSpy.mockReturnValue(1_000_000 + timeoutMs);
      act(() => emitAppState('active'));
      expect(result.current.isLocked).toBe(true);
    });

    it.each([
      [1, 60 * 1000],
      [5, 5 * 60 * 1000],
      [30, 30 * 60 * 1000],
    ])(
      'does not lock one ms under the %i-minute boundary',
      (minutes, timeoutMs) => {
        const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(1_000_000);
        const { result } = renderHook(() =>
          useBiometricGate({ enabled: true, autoLockMinutes: minutes }),
        );
        act(() => emitAppState('background'));
        nowSpy.mockReturnValue(1_000_000 + timeoutMs - 1);
        act(() => emitAppState('active'));
        expect(result.current.isLocked).toBe(false);
      },
    );

    it.each([
      [1, 60 * 1000],
      [5, 5 * 60 * 1000],
      [30, 30 * 60 * 1000],
    ])('locks one ms over the %i-minute boundary', (minutes, timeoutMs) => {
      const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(1_000_000);
      const { result } = renderHook(() =>
        useBiometricGate({ enabled: true, autoLockMinutes: minutes }),
      );
      act(() => emitAppState('background'));
      nowSpy.mockReturnValue(1_000_000 + timeoutMs + 1);
      act(() => emitAppState('active'));
      expect(result.current.isLocked).toBe(true);
    });

    it('never locks on idle when set to Never', () => {
      const nowSpy = jest.spyOn(Date, 'now').mockReturnValue(1_000_000);
      const { result } = renderHook(() =>
        useBiometricGate({ enabled: true, autoLockMinutes: null }),
      );
      act(() => emitAppState('background'));
      nowSpy.mockReturnValue(1_000_000 + 24 * 60 * 60 * 1000);
      act(() => emitAppState('active'));
      expect(result.current.isLocked).toBe(false);
    });

    // The presets govern background idle only, so a cold start is unaffected.
    it.each([0, 1, 5, 15, 30, null])(
      'still locks on cold start with the preset %s',
      async minutes => {
        const { result } = renderHook(() =>
          useBiometricGate({
            enabled: true,
            isInitialised: true,
            autoLockMinutes: minutes,
          }),
        );
        await waitFor(() => expect(result.current.isLocked).toBe(true));
      },
    );
  });
});
