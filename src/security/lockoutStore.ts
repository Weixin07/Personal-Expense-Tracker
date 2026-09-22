import * as Keychain from 'react-native-keychain';
import {
  EMPTY_LOCKOUT_STATE,
  nextStateAfterFailure,
  type LockoutState,
} from './lockoutPolicy';

const LOCKOUT_KEYCHAIN_SERVICE = 'expense-tracker-app-pin-lockout';
const LOCKOUT_KEYCHAIN_USERNAME = 'expense-tracker';

/**
 * Kept in Keystore rather than `app_settings`, and in its own entry rather than
 * alongside the credential, so rotating a PIN does not reset the counter and
 * clearing the counter does not touch the credential.
 *
 * Persistence is the control: an in-memory counter is cleared by a force-quit.
 * The cost is that `nextAllowedAt` is wall-clock, so moving the device clock
 * forward skips the wait. A monotonic clock is not the fix — it resets on the
 * process restart this entry exists to survive, and an offline app has no
 * trusted time source.
 */
const lockoutStorageOptions = {
  service: LOCKOUT_KEYCHAIN_SERVICE,
  accessible: Keychain.ACCESSIBLE.AFTER_FIRST_UNLOCK,
  storage: Keychain.STORAGE_TYPE.AES_GCM_NO_AUTH,
};

const parseLockoutState = (raw: string): LockoutState => {
  try {
    const parsed: unknown = JSON.parse(raw);
    if (typeof parsed !== 'object' || parsed === null) {
      return EMPTY_LOCKOUT_STATE;
    }
    const candidate = parsed as Partial<LockoutState>;
    if (typeof candidate.consecutiveFailures !== 'number') {
      return EMPTY_LOCKOUT_STATE;
    }
    return {
      consecutiveFailures: candidate.consecutiveFailures,
      nextAllowedAt:
        typeof candidate.nextAllowedAt === 'number'
          ? candidate.nextAllowedAt
          : null,
    };
  } catch {
    return EMPTY_LOCKOUT_STATE;
  }
};

export const readLockout = async (): Promise<LockoutState> => {
  try {
    const credentials = await Keychain.getGenericPassword({
      service: LOCKOUT_KEYCHAIN_SERVICE,
    });
    if (!credentials) {
      return EMPTY_LOCKOUT_STATE;
    }
    return parseLockoutState(credentials.password);
  } catch {
    return EMPTY_LOCKOUT_STATE;
  }
};

const writeLockout = async (state: LockoutState): Promise<void> => {
  await Keychain.setGenericPassword(
    LOCKOUT_KEYCHAIN_USERNAME,
    JSON.stringify(state),
    lockoutStorageOptions,
  );
};

export const recordFailure = async (
  now: number = Date.now(),
): Promise<LockoutState> => {
  const current = await readLockout();
  const next = nextStateAfterFailure(current, now);
  await writeLockout(next);
  return next;
};

export const clearLockout = async (): Promise<void> => {
  try {
    await Keychain.resetGenericPassword({ service: LOCKOUT_KEYCHAIN_SERVICE });
  } catch {
    // A successful unlock must not fail because there was nothing to clear.
  }
};
