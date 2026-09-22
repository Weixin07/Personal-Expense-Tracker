export type AppLockErrorKind = 'pin-required';

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
