/**
 * Why an app-lock operation was refused:
 * - `pin-required`: the lock cannot go on without a usable PIN.
 * - `not-authenticated`: settings have not loaded, or the session has not
 *   authenticated while the lock is on.
 * - `locked`: a context action was refused because the app is locked.
 */
export type AppLockErrorKind = 'pin-required' | 'not-authenticated' | 'locked';

export const UNLOCK_FIRST_MESSAGE = 'Unlock the app first.';

export class AppLockError extends Error {
  readonly kind: AppLockErrorKind;

  constructor(kind: AppLockErrorKind, message: string) {
    super(message);
    this.name = 'AppLockError';
    this.kind = kind;
  }
}

export const isAppLockError = (
  error: unknown,
  kind?: AppLockErrorKind,
): error is AppLockError =>
  error instanceof AppLockError && (kind === undefined || error.kind === kind);
