import { useCallback, useEffect, useRef, useState } from 'react';
import { AppState, type AppStateStatus } from 'react-native';
import * as Keychain from 'react-native-keychain';
import { toErrorMessage } from '../utils/errors';

const BIOMETRIC_TIMEOUT_MS = 5 * 60 * 1000;
const BIOMETRIC_KEYCHAIN_SERVICE = 'expense-tracker-biometric-gate';

export type BiometricGateState = {
  isLocked: boolean;
  lastError: string | null;
};

export type UseBiometricGateResult = {
  isLocked: boolean;
  lastError: string | null;
  unlockWithBiometrics: () => Promise<boolean>;
  clearError: () => void;
  ensureCredential: () => Promise<void>;
  clearCredential: () => Promise<void>;
  applyEnabledState: (enabled: boolean) => void;
};

const ensureBiometricCredential = async (): Promise<void> => {
  try {
    await Keychain.resetGenericPassword({
      service: BIOMETRIC_KEYCHAIN_SERVICE,
    });
  } catch {
    // Best-effort pre-clear before the credential is re-created below.
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

export const useBiometricGate = ({
  enabled,
  isInitialised,
}: {
  enabled: boolean;
  isInitialised?: boolean;
}): UseBiometricGateResult => {
  const [isLocked, setIsLocked] = useState(false);
  const [lastError, setLastError] = useState<string | null>(null);
  const lastBackgroundAtRef = useRef<number | null>(null);
  const biometricPromptInFlightRef = useRef(false);
  const coldStartEvaluatedRef = useRef(false);

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
        setIsLocked(false);
        setLastError(null);
      } else {
        setLastError('Authentication cancelled. Tap Try again to retry.');
      }
      return success;
    } catch (error) {
      setLastError(toErrorMessage(error));
      return false;
    }
  }, [enabled]);

  const clearError = useCallback(() => {
    setLastError(null);
  }, []);

  const ensureCredential = useCallback(() => ensureBiometricCredential(), []);

  const clearCredential = useCallback(async () => {
    try {
      await Keychain.resetGenericPassword({
        service: BIOMETRIC_KEYCHAIN_SERVICE,
      });
    } catch {
      // Disabling the gate must succeed even with no credential to clear.
    }
  }, []);

  const applyEnabledState = useCallback((nextEnabled: boolean) => {
    lastBackgroundAtRef.current = nextEnabled ? Date.now() : null;
    biometricPromptInFlightRef.current = false;
    setIsLocked(false);
    setLastError(null);
  }, []);

  useEffect(() => {
    const handleAppStateChange = (nextState: AppStateStatus) => {
      if (nextState === 'active') {
        const last = lastBackgroundAtRef.current;
        if (enabled && last !== null) {
          const elapsed = Date.now() - last;
          if (elapsed >= BIOMETRIC_TIMEOUT_MS) {
            setIsLocked(true);
            setLastError(null);
          }
        }
        lastBackgroundAtRef.current = null;
      } else if (nextState === 'background' || nextState === 'inactive') {
        lastBackgroundAtRef.current = Date.now();
      }
    };
    const subscription = AppState.addEventListener(
      'change',
      handleAppStateChange,
    );
    return () => subscription.remove();
  }, [enabled]);

  useEffect(() => {
    if (!isInitialised || coldStartEvaluatedRef.current) {
      return;
    }
    coldStartEvaluatedRef.current = true;
    if (enabled) {
      // eslint-disable-next-line react-hooks/set-state-in-effect -- one-shot lock once settings finish hydrating; cannot be a lazy useState initializer because the gate flag is loaded asynchronously after mount
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
    if (biometricPromptInFlightRef.current) {
      return;
    }
    biometricPromptInFlightRef.current = true;
    void (async () => {
      await unlockWithBiometrics();
      biometricPromptInFlightRef.current = false;
    })();
  }, [enabled, isLocked, lastError, unlockWithBiometrics]);

  return {
    isLocked,
    lastError,
    unlockWithBiometrics,
    clearError,
    ensureCredential,
    clearCredential,
    applyEnabledState,
  };
};
