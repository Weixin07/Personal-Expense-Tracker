/**
 * Fixed copy for the lock screen's error line. A keychain or system-prompt
 * failure never reaches the user verbatim: Android reports a dismissed
 * biometric prompt as an exception string such as `code: 13, msg: Cancel`.
 */
export const GATE_MESSAGES = {
  biometricNotUnlockedWithPin: 'Not unlocked. Tap Try again or use your PIN.',
  biometricNotUnlockedNoPin:
    'Not unlocked. Tap Try again or use your screen lock.',
  credentialCancelled: "Not confirmed. Tap Confirm it's you to try again.",
  credentialNoLock: 'Set a screen lock first.',
  credentialUnavailable: "Couldn't show the screen lock prompt. Try again.",
} as const;
