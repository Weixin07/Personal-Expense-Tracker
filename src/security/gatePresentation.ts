import type { SecureLockScreen } from './deviceSecurity';

/**
 * What the app lock shows. `unlock` is the prompt for an install with a PIN,
 * or one whose PIN probe has not landed; `unlock-no-pin` is the biometric
 * prompt for an install without one, with the screen lock as its fallback.
 */
export type GatePresentation =
  | 'hidden'
  | 'enrol'
  | 'unlock'
  | 'unlock-no-pin'
  | 'confirm-credential'
  | 'set-screen-lock';

export type GateInputs = {
  isInitialised: boolean;
  hasError: boolean;
  gateEnabled: boolean;
  isLocked: boolean;
  sessionAuthenticated: boolean;
  pinUsable: boolean | null;
  pinStored: boolean | null;
  biometricsAvailable: boolean | null;
  secureLockScreen: SecureLockScreen;
};

/**
 * Invariant: `enrol`, the only way to a new PIN or to turning the lock off, is
 * returned only after authentication; no locked input opens without it.
 */
export const gatePresentation = ({
  isInitialised,
  hasError,
  gateEnabled,
  isLocked,
  sessionAuthenticated,
  pinUsable,
  pinStored,
  biometricsAvailable,
  secureLockScreen,
}: GateInputs): GatePresentation => {
  if (!gateEnabled) {
    return 'hidden';
  }
  // A load error must not open a locked gate; it only holds back enrolment.
  if (isLocked) {
    if (pinStored !== false) {
      return 'unlock';
    }
    if (biometricsAvailable !== false) {
      return 'unlock-no-pin';
    }
    return secureLockScreen === false
      ? 'set-screen-lock'
      : 'confirm-credential';
  }
  return isInitialised &&
    !hasError &&
    sessionAuthenticated &&
    pinUsable === false
    ? 'enrol'
    : 'hidden';
};
