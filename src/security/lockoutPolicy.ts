export const PIN_FREE_ATTEMPTS = 3;
export const PIN_LOCKOUT_ATTEMPTS = 10;
export const PIN_LOCKOUT_MS = 30 * 60 * 1000;

const THROTTLE_DELAYS_MS = [
  30 * 1000,
  60 * 1000,
  2 * 60 * 1000,
  5 * 60 * 1000,
  10 * 60 * 1000,
  15 * 60 * 1000,
];

/**
 * Counts PIN failures only. Biometric failures are excluded deliberately: the
 * gate prompts for biometrics automatically, so dismissing that prompt is how a
 * user reaches the PIN at all, and Android throttles biometrics itself.
 */
export type LockoutState = {
  consecutiveFailures: number;
  nextAllowedAt: number | null;
};

export type LockoutStatus = {
  allowed: boolean;
  retryAtMs: number | null;
  throttled: boolean;
  lockedOut: boolean;
  attemptsRemaining: number;
  /**
   * Whether the remaining count is worth showing. False until the first
   * throttle, where a single mistyped digit should not raise an alarm, and true
   * from then on so the wait that is coming is never a surprise.
   */
  warnAttemptsRemaining: boolean;
};

export const EMPTY_LOCKOUT_STATE: LockoutState = {
  consecutiveFailures: 0,
  nextAllowedAt: null,
};

export const delayForFailures = (consecutiveFailures: number): number => {
  if (consecutiveFailures <= PIN_FREE_ATTEMPTS) {
    return 0;
  }
  if (consecutiveFailures >= PIN_LOCKOUT_ATTEMPTS) {
    return PIN_LOCKOUT_MS;
  }
  return THROTTLE_DELAYS_MS[consecutiveFailures - PIN_FREE_ATTEMPTS - 1];
};

export const evaluateLockout = (
  state: LockoutState,
  now: number,
): LockoutStatus => {
  const waiting = state.nextAllowedAt !== null && now < state.nextAllowedAt;
  const lockedOut =
    waiting && state.consecutiveFailures >= PIN_LOCKOUT_ATTEMPTS;
  return {
    allowed: !waiting,
    retryAtMs: waiting ? state.nextAllowedAt : null,
    throttled: waiting && !lockedOut,
    lockedOut,
    attemptsRemaining: Math.max(
      0,
      PIN_LOCKOUT_ATTEMPTS - state.consecutiveFailures,
    ),
    warnAttemptsRemaining: state.consecutiveFailures > PIN_FREE_ATTEMPTS,
  };
};

/**
 * The lockout expires rather than persisting, so a wrong tenth attempt costs
 * the full delay but never leaves the app permanently unreachable.
 */
export const nextStateAfterFailure = (
  state: LockoutState,
  now: number,
): LockoutState => {
  const consecutiveFailures = state.consecutiveFailures + 1;
  const delay = delayForFailures(consecutiveFailures);
  return {
    consecutiveFailures,
    nextAllowedAt: delay > 0 ? now + delay : null,
  };
};
