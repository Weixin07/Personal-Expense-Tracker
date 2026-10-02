import {
  AppLockError,
  isAppLockError,
  type AppLockErrorKind,
} from '../appLockError';

const KINDS: AppLockErrorKind[] = [
  'pin-required',
  'not-authenticated',
  'locked',
];

describe('isAppLockError', () => {
  it.each(KINDS)('matches a %s error by its own kind only', kind => {
    const error = new AppLockError(kind, 'message');
    expect(isAppLockError(error, kind)).toBe(true);
    KINDS.filter(other => other !== kind).forEach(other => {
      expect(isAppLockError(error, other)).toBe(false);
    });
  });

  it.each(KINDS)('matches a %s error when no kind is given', kind => {
    expect(isAppLockError(new AppLockError(kind, 'message'))).toBe(true);
  });

  it('rejects an ordinary error', () => {
    expect(isAppLockError(new Error('Unlock the app first.'))).toBe(false);
    expect(isAppLockError(new Error('x'), 'locked')).toBe(false);
  });
});
