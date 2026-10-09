import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import * as Keychain from 'react-native-keychain';
import { toErrorMessage } from '../utils/errors';
import { calibrateIterations } from '../security/pinCalibration';
import {
  confirmDeviceCredential,
  secureLockScreenState,
  type DeviceCredentialOutcome,
  type SecureLockScreen,
} from '../security/deviceSecurity';
import { GATE_MESSAGES } from '../security/gateMessages';
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
import { outboundFlowActive } from '../security/outboundFlow';

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
  confirmAppPin: (pin: string) => Promise<boolean>;
  appPinUsable: () => Promise<boolean>;
  biometricsAvailable: boolean | null;
  pinUsable: boolean | null;
  pinStored: boolean | null;
  secureLockScreen: SecureLockScreen;
  /**
   * True only after a biometric, PIN or device-credential unlock succeeded
   * since the gate last locked. Being unlocked is not enough: the hook starts
   * unlocked, before the cold-start lock lands.
   */
  sessionAuthenticated: boolean;
  /** Unlocks on `'authenticated'` only, under the rule on `DeviceCredentialOutcome`. */
  unlockWithDeviceCredential: () => Promise<DeviceCredentialOutcome>;
  refreshAvailability: () => Promise<void>;
  backgroundNonce: number;
  returnNonce: number;
  /**
   * True while the app is in the background, unlocked, and may lock on return,
   * under the rule on `shouldRaiseCurtain`; cleared on return.
   */
  curtain: boolean;
  clearError: () => void;
  ensureCredential: () => Promise<void>;
  clearCredential: () => Promise<void>;
  clearPin: () => Promise<void>;
  applyEnabledState: (enabled: boolean) => void;
};

type BiometryCreatable = 'yes' | 'impossible' | 'unknown';

/**
 * Whether the biometric credential may be created. It needs an enrolled
 * biometric: with none, `react-native-keychain` stores it under a no-auth cipher
 * and returns it unchallenged, so the gate would unlock itself. It also needs a
 * secure lock screen, without which Keystore refuses the authentication-bound
 * key. `'unknown'` means a probe could not answer, which is neither consent nor
 * proof of impossibility.
 */
const biometryCreatable = async (): Promise<BiometryCreatable> => {
  const [lockScreen, enrolled] = await Promise.all([
    secureLockScreenState(),
    Keychain.getSupportedBiometryType().then(
      type => type !== null,
      () => null,
    ),
  ]);
  if (lockScreen === false || enrolled === false) {
    return 'impossible';
  }
  if (lockScreen === null || enrolled === null) {
    return 'unknown';
  }
  return 'yes';
};

/**
 * Whether an existing credential may be trusted, under the rule on
 * `biometryCreatable`. Only a definite "no lock screen" distrusts it, so an
 * unanswered probe leaves a working credential in use.
 */
const biometryTrustable = (
  lockScreen: SecureLockScreen,
  biometryType: Keychain.BIOMETRY_TYPE | null,
): boolean => lockScreen !== false && biometryType !== null;

const readWasAuthenticated = (
  credentials: false | Keychain.UserCredentials,
): boolean =>
  credentials !== false &&
  credentials.storage === Keychain.STORAGE_TYPE.AES_GCM;

const CREDENTIAL_FAILURE_MESSAGES: Record<
  Exclude<DeviceCredentialOutcome, 'authenticated'>,
  string
> = {
  cancelled: GATE_MESSAGES.credentialCancelled,
  'no-credential': GATE_MESSAGES.credentialNoLock,
  unavailable: GATE_MESSAGES.credentialUnavailable,
};

/**
 * @throws when a probe cannot answer, leaving any existing credential in place
 * so a transient failure is retried rather than treated as impossible.
 */
const ensureBiometricCredential = async (): Promise<void> => {
  const creatable = await biometryCreatable();
  if (creatable === 'unknown') {
    throw new Error('Could not determine whether biometrics can be set up.');
  }
  try {
    await Keychain.resetGenericPassword({
      service: BIOMETRIC_KEYCHAIN_SERVICE,
    });
  } catch {
    // Best-effort: a stale credential is cleared whether or not a new one can
    // be created below.
  }
  if (creatable === 'impossible') {
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

const APP_LOCK_MARKER_SERVICE = 'expense-tracker-app-lock-on';
const APP_LOCK_MARKER_USERNAME = 'expense-tracker';
const APP_LOCK_MARKER_VALUE = 'app-lock-on';

// No-auth, under the rule on `pinStorageOptions`: an entry bound to the screen
// lock disappears when the lock is removed, and with it the lock this marker
// keeps closed.
const appLockMarkerStorageOptions = {
  service: APP_LOCK_MARKER_SERVICE,
  accessible: Keychain.ACCESSIBLE.AFTER_FIRST_UNLOCK,
  storage: Keychain.STORAGE_TYPE.AES_GCM_NO_AUTH,
};

/**
 * The lock marker exists while the app lock is on. It is read when settings
 * fail to load, or load with no definite lock setting, under the rule on
 * `resolveGateReading`. It rejects when the keychain cannot answer; the writers
 * below never do.
 */
export const appLockMarkerExists = (): Promise<boolean> =>
  Keychain.hasGenericPassword({ service: APP_LOCK_MARKER_SERVICE });

export const writeAppLockMarker = async (): Promise<void> => {
  try {
    await Keychain.setGenericPassword(
      APP_LOCK_MARKER_USERNAME,
      APP_LOCK_MARKER_VALUE,
      appLockMarkerStorageOptions,
    );
  } catch {
    // Best-effort: the next healthy load reconciles it.
  }
};

export const clearAppLockMarker = async (): Promise<void> => {
  try {
    await Keychain.resetGenericPassword({ service: APP_LOCK_MARKER_SERVICE });
  } catch {
    // Best-effort: a stale marker fails closed and the next healthy load
    // clears it.
  }
};

/**
 * Brings the marker into line with `enabled`, touching it only on a mismatch.
 * `null` is a setting that could not be read, and leaves the marker alone.
 */
export const syncAppLockMarker = async (
  enabled: boolean | null,
): Promise<void> => {
  if (enabled === null) {
    return;
  }
  let present: boolean;
  try {
    present = await appLockMarkerExists();
  } catch {
    return;
  }
  if (enabled && !present) {
    await writeAppLockMarker();
  } else if (!enabled && present) {
    await clearAppLockMarker();
  }
};

/** How long the app may stay in the background before a return locks it; `null` never locks. */
export const idleTimeoutMs = (autoLockMinutes: number | null): number | null =>
  autoLockMinutes === null ? null : autoLockMinutes * 60 * 1000;

/**
 * Whether going to the background raises the curtain that hides the app until
 * the idle check on return. Never under `Never`, which has no such check. A
 * hand-off to another app raises it only under `Immediately`, the one preset
 * certain to lock on return.
 */
const shouldRaiseCurtain = ({
  enabled,
  isLocked,
  timeoutMs,
  outboundFlow,
}: {
  enabled: boolean;
  isLocked: boolean;
  timeoutMs: number | null;
  outboundFlow: boolean;
}): boolean =>
  enabled &&
  !isLocked &&
  timeoutMs !== null &&
  (!outboundFlow || timeoutMs === 0);

export const useBiometricGate = ({
  enabled,
  isInitialised,
  hasLoaded = isInitialised,
  autoLockMinutes = DEFAULT_AUTO_LOCK_MINUTES,
}: {
  enabled: boolean;
  isInitialised?: boolean;
  /** Whether any load has succeeded; omitted, it follows `isInitialised`. */
  hasLoaded?: boolean;
  autoLockMinutes?: number | null;
}): UseBiometricGateResult => {
  const [lockedState, setLockedState] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const [lockout, setLockout] = useState<LockoutStatus>(() =>
    evaluateLockout(EMPTY_LOCKOUT_STATE, Date.now()),
  );
  const [backgroundNonce, setBackgroundNonce] = useState(0);
  const [returnNonce, setReturnNonce] = useState(0);
  const [lockoutHydrated, setLockoutHydrated] = useState(false);
  const [biometricsAvailable, setBiometricsAvailable] = useState<
    boolean | null
  >(null);
  const [pinUsable, setPinUsable] = useState<boolean | null>(null);
  const [pinStored, setPinStored] = useState<boolean | null>(null);
  const [secureLockScreen, setSecureLockScreen] =
    useState<SecureLockScreen>(null);
  const [sessionAuthenticated, setSessionAuthenticated] = useState(false);
  const lastBackgroundAtRef = useRef<number | null>(null);
  const biometricPromptInFlightRef = useRef(false);
  const deviceCredentialInFlightRef = useRef(false);
  const [coldStartEvaluated, setColdStartEvaluated] = useState(false);
  const [loadedLockEvaluated, setLoadedLockEvaluated] = useState(false);
  const [curtain, setCurtain] = useState(false);
  // Locked from the first render that has settings, so no frame of the app is
  // committed before the cold-start lock lands. Until a load succeeds the lock
  // setting is unknown, so a lock-on that arrives later still locks.
  const isLocked =
    lockedState ||
    (enabled && Boolean(isInitialised) && !coldStartEvaluated) ||
    (enabled &&
      Boolean(isInitialised) &&
      !loadedLockEvaluated &&
      !sessionAuthenticated);
  const isLockedRef = useRef(isLocked);
  isLockedRef.current = isLocked;

  const refreshLockout = useCallback(async (): Promise<LockoutStatus> => {
    const status = evaluateLockout(await readLockout(), Date.now());
    setLockout(status);
    setLockoutHydrated(true);
    return status;
  }, []);

  const refreshBiometricAvailability = useCallback(async (): Promise<void> => {
    const lockScreen = await secureLockScreenState();
    setSecureLockScreen(lockScreen);
    try {
      const [hasCredential, biometryType] = await Promise.all([
        biometricCredentialExists(),
        Keychain.getSupportedBiometryType(),
      ]);
      setBiometricsAvailable(
        hasCredential && biometryTrustable(lockScreen, biometryType),
      );
    } catch {
      // Fail toward the PIN or, with none, the device credential — never
      // toward a prompt that may resolve without authenticating.
      setBiometricsAvailable(false);
    }
  }, []);

  const refreshPinAvailability = useCallback(async (): Promise<void> => {
    const usable = await pinCredentialUsable();
    const stored = usable || (await pinCredentialExists().catch(() => true));
    setPinUsable(usable);
    setPinStored(stored);
  }, []);

  const refreshAvailability = useCallback(async (): Promise<void> => {
    await Promise.all([
      refreshBiometricAvailability(),
      refreshPinAvailability(),
    ]);
  }, [refreshBiometricAvailability, refreshPinAvailability]);

  // The throttle must be inherited from Keystore on a restart rather than reset.
  useEffect(() => {
    void refreshLockout();
    void refreshAvailability();
  }, [refreshLockout, refreshAvailability]);

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
      setLockedState(false);
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
      if (readWasAuthenticated(credentials)) {
        await clearLockout();
        await refreshLockout();
        setLockedState(false);
        setLastError(null);
        setSessionAuthenticated(true);
        return true;
      }
      if (credentials) {
        await Keychain.resetGenericPassword({
          service: BIOMETRIC_KEYCHAIN_SERVICE,
        });
        await refreshBiometricAvailability();
      }
    } catch {
      // Reported through the fixed copy below, under the rule on
      // `GATE_MESSAGES`.
    }
    setLastError(
      pinStored === false
        ? GATE_MESSAGES.biometricNotUnlockedNoPin
        : GATE_MESSAGES.biometricNotUnlockedWithPin,
    );
    return false;
  }, [enabled, pinStored, refreshBiometricAvailability, refreshLockout]);

  const unlockWithDeviceCredential =
    useCallback(async (): Promise<DeviceCredentialOutcome> => {
      if (
        biometricPromptInFlightRef.current ||
        deviceCredentialInFlightRef.current
      ) {
        return 'unavailable';
      }
      deviceCredentialInFlightRef.current = true;
      try {
        const outcome = await confirmDeviceCredential();
        if (outcome !== 'authenticated') {
          setLastError(CREDENTIAL_FAILURE_MESSAGES[outcome]);
          return outcome;
        }
        await clearLockout();
        await refreshLockout();
        setLockedState(false);
        setLastError(null);
        setSessionAuthenticated(true);
        return outcome;
      } catch {
        setLastError(GATE_MESSAGES.credentialUnavailable);
        return 'unavailable';
      } finally {
        deviceCredentialInFlightRef.current = false;
      }
    }, [refreshLockout]);

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
          setLockedState(false);
          setLastError(null);
          setSessionAuthenticated(true);
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

  const confirmAppPin = useCallback(
    async (pin: string): Promise<boolean> => {
      const status = await refreshLockout();
      if (!status.allowed) {
        return false;
      }
      if (!(await verifyPin(pin))) {
        await chargeFailure();
        return false;
      }
      await clearLockout();
      await refreshLockout();
      return true;
    },
    [chargeFailure, refreshLockout],
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
    setLockedState(false);
    setCurtain(false);
    setLastError(null);
    setSessionAuthenticated(false);
  }, []);

  useEffect(() => {
    const timeoutMs = idleTimeoutMs(autoLockMinutes);
    const handleAppStateChange = (nextState: AppStateStatus) => {
      // The system screen-lock prompt is its own activity, so it backgrounds
      // the app; counting that would re-lock it the moment it opens.
      if (deviceCredentialInFlightRef.current) {
        return;
      }
      if (nextState === 'active') {
        const last = lastBackgroundAtRef.current;
        if (enabled && last !== null && timeoutMs !== null) {
          const elapsed = Date.now() - last;
          if (elapsed >= timeoutMs) {
            setLockedState(true);
            setLastError(null);
            setSessionAuthenticated(false);
          }
        }
        lastBackgroundAtRef.current = null;
        setCurtain(false);
        setReturnNonce(current => current + 1);
        // A screen lock or biometric may have changed in Settings meanwhile.
        if (enabled && !biometricPromptInFlightRef.current) {
          void refreshAvailability();
        }
      } else if (nextState === 'background' || nextState === 'inactive') {
        lastBackgroundAtRef.current = Date.now();
        setBackgroundNonce(current => current + 1);
        if (
          shouldRaiseCurtain({
            enabled,
            isLocked: isLockedRef.current,
            timeoutMs,
            outboundFlow: outboundFlowActive(),
          })
        ) {
          setCurtain(true);
        }
      }
    };
    const subscription = AppState.addEventListener(
      'change',
      handleAppStateChange,
    );
    return () => subscription.remove();
  }, [enabled, autoLockMinutes, refreshAvailability]);

  // Unconditional: the auto-lock presets govern background idle only, so Never
  // still locks on a cold start.
  useEffect(() => {
    if (!isInitialised || coldStartEvaluated) {
      return;
    }
    setColdStartEvaluated(true);
    if (enabled) {
      setLockedState(true);
      setSessionAuthenticated(false);
    }
  }, [enabled, isInitialised, coldStartEvaluated]);

  useEffect(() => {
    if (!hasLoaded || loadedLockEvaluated) {
      return;
    }
    setLoadedLockEvaluated(true);
    if (enabled && !sessionAuthenticated) {
      setLockedState(true);
    }
  }, [enabled, hasLoaded, loadedLockEvaluated, sessionAuthenticated]);

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
    // A failed prompt's message names the fallback, which depends on whether
    // a PIN is stored.
    if (pinStored === null) {
      return;
    }
    if (
      biometricPromptInFlightRef.current ||
      deviceCredentialInFlightRef.current
    ) {
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
    pinStored,
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
    confirmAppPin,
    appPinUsable,
    biometricsAvailable,
    pinUsable,
    pinStored,
    secureLockScreen,
    sessionAuthenticated,
    unlockWithDeviceCredential,
    refreshAvailability,
    backgroundNonce,
    returnNonce,
    curtain,
    clearError,
    ensureCredential,
    clearCredential,
    clearPin,
    applyEnabledState,
  };
};
