import * as Keychain from 'react-native-keychain';
import { clearLockout, readLockout, recordFailure } from '../lockoutStore';
import { EMPTY_LOCKOUT_STATE } from '../lockoutPolicy';

const NOW = 1_700_000_000_000;
const LOCKOUT_SERVICE = 'expense-tracker-app-pin-lockout';

beforeEach(() => {
  jest.clearAllMocks();
  (Keychain.setGenericPassword as jest.Mock).mockResolvedValue(true);
  (Keychain.getGenericPassword as jest.Mock).mockResolvedValue(false);
  (Keychain.resetGenericPassword as jest.Mock).mockResolvedValue(true);
});

describe('lockoutStore', () => {
  it('reads an empty state when nothing is stored', async () => {
    await expect(readLockout()).resolves.toEqual(EMPTY_LOCKOUT_STATE);
  });

  it('keeps the counter in its own Keychain entry', async () => {
    await recordFailure(NOW);
    const [, , options] = (Keychain.setGenericPassword as jest.Mock).mock
      .calls[0];
    expect(options.service).toBe(LOCKOUT_SERVICE);
    expect(options.service).not.toBe('expense-tracker-app-pin');
  });

  /**
   * The point of persisting rather than counting in memory: a force-quit must
   * not clear the throttle, or the control is bypassed in two seconds.
   */
  it('survives a restart', async () => {
    const first = await recordFailure(NOW);
    const [, written] = (Keychain.setGenericPassword as jest.Mock).mock
      .calls[0];

    jest.clearAllMocks();
    (Keychain.getGenericPassword as jest.Mock).mockResolvedValue({
      username: 'expense-tracker',
      password: written,
    });

    await expect(readLockout()).resolves.toEqual(first);
  });

  it('accumulates failures across calls', async () => {
    let stored = JSON.stringify(EMPTY_LOCKOUT_STATE);
    (Keychain.getGenericPassword as jest.Mock).mockImplementation(() =>
      Promise.resolve({ username: 'expense-tracker', password: stored }),
    );
    (Keychain.setGenericPassword as jest.Mock).mockImplementation(
      (_username, password) => {
        stored = password;
        return Promise.resolve(true);
      },
    );

    await recordFailure(NOW);
    await recordFailure(NOW);
    const third = await recordFailure(NOW);
    expect(third.consecutiveFailures).toBe(3);
  });

  it('falls back to an empty state when the stored value is unreadable', async () => {
    (Keychain.getGenericPassword as jest.Mock).mockResolvedValue({
      username: 'expense-tracker',
      password: 'not-json',
    });
    await expect(readLockout()).resolves.toEqual(EMPTY_LOCKOUT_STATE);
  });

  it('clears without failing when there is nothing to clear', async () => {
    (Keychain.resetGenericPassword as jest.Mock).mockRejectedValue(
      new Error('no entry'),
    );
    await expect(clearLockout()).resolves.toBeUndefined();
  });
});

describe('lockoutStore hostile input', () => {
  it.each([
    ['a JSON primitive', '42'],
    ['null', 'null'],
    ['an object without a counter', '{"nextAllowedAt":123}'],
    ['a counter of the wrong type', '{"consecutiveFailures":"many"}'],
  ])('falls back to an empty state for %s', async (_label, stored) => {
    (Keychain.getGenericPassword as jest.Mock).mockResolvedValue({
      username: 'expense-tracker',
      password: stored,
    });
    await expect(readLockout()).resolves.toEqual(EMPTY_LOCKOUT_STATE);
  });

  it('drops a nextAllowedAt of the wrong type', async () => {
    (Keychain.getGenericPassword as jest.Mock).mockResolvedValue({
      username: 'expense-tracker',
      password: '{"consecutiveFailures":2,"nextAllowedAt":"soon"}',
    });
    await expect(readLockout()).resolves.toEqual({
      consecutiveFailures: 2,
      nextAllowedAt: null,
    });
  });

  it('falls back when the keychain read itself throws', async () => {
    (Keychain.getGenericPassword as jest.Mock).mockRejectedValue(
      new Error('keychain down'),
    );
    await expect(readLockout()).resolves.toEqual(EMPTY_LOCKOUT_STATE);
  });
});

describe('lockoutStore defaults', () => {
  it('reads back a stored wait time', async () => {
    (Keychain.getGenericPassword as jest.Mock).mockResolvedValue({
      username: 'expense-tracker',
      password: JSON.stringify({
        consecutiveFailures: 4,
        nextAllowedAt: NOW + 30_000,
      }),
    });
    await expect(readLockout()).resolves.toEqual({
      consecutiveFailures: 4,
      nextAllowedAt: NOW + 30_000,
    });
  });

  it('stamps the current time when none is supplied', async () => {
    const state = await recordFailure();
    expect(state.consecutiveFailures).toBe(1);
  });
});
