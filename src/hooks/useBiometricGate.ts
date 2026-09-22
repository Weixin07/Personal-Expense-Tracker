import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import * as Keychain from 'react-native-keychain';
import { toErrorMessage } from '../utils/errors';
import { calibrateIterations } from '../security/pinCalibration';
import {
  EMPTY_LOCKOUT_STATE,
  evaluateLockout,
  type LockoutStatus,
} from '../security/lockoutPolicy';
import {
  clearLockout,
  readLockout,
  recordFailure,
} from '../security/lockoutStore';
import {
  clearPinCredential,
  pinCredentialExists,
  pinCredentialUsable,
  setPin as writePinCredential,
  verifyPin,
} from '../security/pinCredential';
import { validatePin } from '../utils/validation';
import { DEFAULT_AUTO_LOCK_MINUTES } from '../constants/autoLockPresets';

const BIOMETRIC_KEYCHAIN_SERVICE = 'expense-tracker-biometric-gate';

export type BiometricGateState = {
  isLocked: boolean;
  lastError: string | null;
  lockout: LockoutStatus;
  biometricsAvailable: boolean | null;
  pinUsable: boolean | null;
};

export type UseBiometricGateResult = {
  isLocked: boolean;
  lastError: string | null;
  lockout: LockoutStatus;
  unlockWithBiometrics: () => Promise<boolean>;
  unlockWithPin: (pin: string) => Promise<boolean>;
  setAppPin: (pin: string) => Promise<void>;
  changeAppPin: (currentPin: string, nextPin: string) => Promise<boolean>;
  appPinUsable: () => Promise<boolean>;
  biometricsAvailable: boolean | null;
  pinUsable: boolean | null;
  pinStored: boolean | null;
  backgroundNonce: number;
  clearError: () => void;
  ensureCredential: () => Promise<void>;
  clearCredential: () => Promise<void>;
  clearPin: () => Promise<void>;
  applyEnabledState: (enabled: boolean) => void;
};

/**
 * Whether a biometric can actually authenticate. With none enrolled,
 * `react-native-keychain` stores the credential under a no-auth cipher and
 * returns it unchallenged, so an entry would make the gate unlock itself. The
 * device passcode does not change this — the library's storage choice looks at
 * enrolled biometrics only.
 */
const biometryUsable = async (): Promise<boolean> =>
  (await Keychain.getSupportedBiometryType()) !== null;

const ensureBiometricCredential = async (): Promise<void> => {
  try {
    await Keychain.resetGenericPassword({
      service: BIOMETRIC_KEYCHAIN_SERVICE,
    });
  } catch {
    // Best-effort pre-clear before the credential is re-created below.
  }
  if (!(await biometryUsable())) {
    return;
  }
  try {
    await Keychain.setGenericPassword('expense-tracker', 'biometric-lock', {
      service: BIOMETRIC_KEYCHAIN_SERVICE,
      accessControl:
        Keychain.ACCESS_CONTROL.BIOMETRY_CURRENT_SET_OR_DEVICE_PASSCODE,
      accessible: Keychain.ACCESSIBLE.WHEN_PASSCODE_SET_THIS_DEVICE_ONLY,
      securityLevel: Keychain.SECURITY_LEVEL.SECURE_HARDWARE,
    });
  } catch (error) {
    await Keychain.resetGenericPassword({
      service: BIOMETRIC_KEYCHAIN_SERVICE,
    });
    throw error;
  }
};

export const biometricCredentialExists = (): Promise<boolean> =>
  Keychain.hasGenericPassword({ service: BIOMETRIC_KEYCHAIN_SERVICE });

const idleTimeoutMs = (autoLockMinutes: number | null): number | null =>
  autoLockMinutes === null ? null : autoLockMinutes * 60 * 1000;

export const useBiometricGate = ({
  enabled,
  isInitialised,
  autoLockMinutes = DEFAULT_AUTO_LOCK_MINUTES,
}: {
  enabled: boolean;
  isInitialised?: boolean;
  autoLockMinutes?: number | null;
}): UseBiometricGateResult => {
  const [isLocked, setIsLocked] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const [lockout, setLockout] = useState<LockoutStatus>(() =>
    evaluateLockout(EMPTY_LOCKOUT_STATE, Date.now()),
  );
  const [backgroundNonce, setBackgroundNonce] = useState(0);
  const [lockoutHydrated, setLockoutHydrated] = useState(false);
  const [biometricsAvailable, setBiometricsAvailable] = useState<
    boolean | null
  >(null);
  const [pinUsable, setPinUsable] = useState<boolean | null>(null);
  const [pinStored, setPinStored] = useState<boolean | null>(null);
  const lastBackgroundAtRef = useRef<number | null>(null);
  const biometricPromptInFlightRef = useRef(false);
  const coldStartEvaluatedRef = useRef(false);

  const refreshLockout = useCallback(async (): Promise<LockoutStatus> => {
    const status = evaluateLockout(await readLockout(), Date.now());
    setLockout(status);
    setLockoutHydrated(true);
    return status;
  }, []);

  const refreshBiometricAvailability = useCallback(async (): Promise<void> => {
    try {
      const [hasCredential, usable] = await Promise.all([
        biometricCredentialExists(),
        biometryUsable(),
      ]);
      setBiometricsAvailable(hasCredential && usable);
    } catch {
      // Fail toward the PIN, which always works, rather than toward a prompt
      // that may resolve without authenticating.
      setBiometricsAvailable(false);
    }
  }, []);

  const refreshPinAvailability = useCallback(async (): Promise<void> => {
    const usable = await pinCredentialUsable();
    const stored = usable || (await pinCredentialExists().catch(() => true));
    setPinUsable(usable);
    setPinStored(stored);
  }, []);

  // The throttle must be inherited from Keystore on a restart rather than reset.
  useEffect(() => {
    void refreshLockout();
    void refreshBiometricAvailability();
    void refreshPinAvailability();
  }, [refreshLockout, refreshBiometricAvailability, refreshPinAvailability]);

  /**
   * The policy expires by comparing against the clock, so without this nothing
   * would notice the wait ending: the modal disables every control while
   * throttled, which leaves no interaction to recompute it.
   */
  useEffect(() => {
    if (lockout.retryAtMs === null) {
      return;
    }
    const timer = setTimeout(
      () => void refreshLockout(),
      Math.max(0, lockout.retryAtMs - Date.now()),
    );
    return () => clearTimeout(timer);
  }, [lockout.retryAtMs, refreshLockout]);

  /**
   * A rejected PIN only counts when there is a stored PIN to have got wrong.
   * With none, the counter would climb with nothing to guess, costing the owner
   * a lockout and an attacker nothing.
   */
  const chargeFailure = useCallback(async (): Promise<void> => {
    if (!(await pinCredentialUsable())) {
      return;
    }
    setLockout(evaluateLockout(await recordFailure(), Date.now()));
  }, []);

  const unlockWithBiometrics = useCallback(async (): Promise<boolean> => {
    if (!enabled) {
      setIsLocked(false);
      return true;
    }
    try {
      const credentials = await Keychain.getGenericPassword({
        service: BIOMETRIC_KEYCHAIN_SERVICE,
        authenticationPrompt: {
          title: 'Unlock Expense Tracker',
          subtitle: 'Authenticate to continue',
          description: 'Use biometrics or device credentials',
        },
      });
      const success = Boolean(credentials);
      if (success) {
        await clearLockout();
        await refreshLockout();
        setIsLocked(false);
        setLastError(null);
      } else {
        setLastError(
          'Authentication cancelled. Tap Try again or use your PIN.',
        );
      }
      return success;
    } catch (error) {
      setLastError(toErrorMessage(error));
      return false;
    }
  }, [enabled, refreshLockout]);

  const unlockWithPin = useCallback(
    async (pin: string): Promise<boolean> => {
      const status = await refreshLockout();
      if (!status.allowed) {
        return false;
      }
      try {
        if (await verifyPin(pin)) {
          await clearLockout();
          await refreshLockout();
          setIsLocked(false);
          setLastError(null);
          return true;
        }
        await chargeFailure();
        setLastError('Incorrect PIN.');
        return false;
      } catch (error) {
        setLastError(toErrorMessage(error));
        return false;
      }
    },
    [chargeFailure, refreshLockout],
  );

  const setAppPin = useCallback(
    async (pin: string): Promise<void> => {
      const check = validatePin(pin);
      if (!check.valid) {
        throw new Error(check.message);
      }
      await writePinCredential(pin, await calibrateIterations());
      await clearLockout();
      await refreshPinAvailability();
    },
    [refreshPinAvailability],
  );

  const changeAppPin = useCallback(
    async (currentPin: string, nextPin: string): Promise<boolean> => {
      // Throttled under the rule on `TransactionDataActions.changeAppPin`.
      const status = await refreshLockout();
      if (!status.allowed) {
        return false;
      }
      if (!(await verifyPin(currentPin))) {
        await chargeFailure();
        return false;
      }
      await setAppPin(nextPin);
      await refreshLockout();
      return true;
    },
    [chargeFailure, refreshLockout, setAppPin],
  );

  const appPinUsable = useCallback(() => pinCredentialUsable(), []);

  const clearError = useCallback(() => {
    setLastError(null);
  }, []);

  const ensureCredential = useCallback(async () => {
    try {
      await ensureBiometricCredential();
    } finally {
      await refreshBiometricAvailability();
    }
  }, [refreshBiometricAvailability]);

  const clearCredential = useCallback(async () => {
    try {
      await Keychain.resetGenericPassword({
        service: BIOMETRIC_KEYCHAIN_SERVICE,
      });
    } catch {
      // Disabling the gate must succeed even with no credential to clear.
    }
    await refreshBiometricAvailability();
  }, [refreshBiometricAvailability]);

  const clearPin = useCallback(async () => {
    await clearPinCredential();
    await clearLockout();
    await refreshPinAvailability();
  }, [refreshPinAvailability]);

  const applyEnabledState = useCallback((nextEnabled: boolean) => {
    lastBackgroundAtRef.current = nextEnabled ? Date.now() : null;
    biometricPromptInFlightRef.current = false;
    setIsLocked(false);
    setLastError(null);
  }, []);

  useEffect(() => {
    const timeoutMs = idleTimeoutMs(autoLockMinutes);
    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        const last = lastBackgroundAtRef.current;
        if (enabled && last !== null && timeoutMs !== null) {
          const elapsed = Date.now() - last;
          if (elapsed >= timeoutMs) {
            setIsLocked(true);
            setLastError(null);
          }
        }
        lastBackgroundAtRef.current = null;
      } else if (nextState === 'background' || nextState === 'inactive') {
        lastBackgroundAtRef.current = Date.now();
        setBackgroundNonce(current => current + 1);
      }
    };
    const subscription = AppState.addEventListener(
      'change',
      handleAppStateChange,
    );
    return () => subscription.remove();
  }, [enabled, autoLockMinutes]);

  // Unconditional: the auto-lock presets govern background idle only, so Never
  // still locks on a cold start.
  useEffect(() => {
    if (!isInitialised || coldStartEvaluatedRef.current) {
      return;
    }
    coldStartEvaluatedRef.current = true;
    if (enabled) {
      setIsLocked(true);
    }
  }, [enabled, isInitialised]);

  useEffect(() => {
    if (!enabled) {
      return;
    }
    if (!isLocked || lastError) {
      return;
    }
    // The stored throttle arrives asynchronously and the initial state is
    // optimistic, so prompting before it lands would fire under a lockout the
    // hook has not read yet.
    if (!lockoutHydrated || !lockout.allowed) {
      return;
    }
    // `null` is "not probed yet"; `false` is a device that cannot hold the
    // credential, where prompting only produces a cancellation the user never
    // made.
    if (!biometricsAvailable) {
      return;
    }
    if (biometricPromptInFlightRef.current) {
      return;
    }
    biometricPromptInFlightRef.current = true;
    void (async () => {
      await unlockWithBiometrics();
      biometricPromptInFlightRef.current = false;
    })();
  }, [
    enabled,
    isLocked,
    lastError,
    lockoutHydrated,
    lockout.allowed,
    biometricsAvailable,
    unlockWithBiometrics,
  ]);

  return {
    isLocked,
    lastError,
    lockout,
    unlockWithBiometrics,
    unlockWithPin,
    setAppPin,
    changeAppPin,
    appPinUsable,
    biometricsAvailable,
    pinUsable,
    pinStored,
    backgroundNonce,
    clearError,
    ensureCredential,
    clearCredential,
    clearPin,
    applyEnabledState,
  };
};
