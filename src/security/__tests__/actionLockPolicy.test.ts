import { createActionLockGuard } from '../actionLockPolicy';
import { isAppLockError, UNLOCK_FIRST_MESSAGE } from '../appLockError';

type Actions = {
  save: (value: number) => Promise<number>;
  upload: (options?: { interactive?: boolean }) => Promise<string>;
  filter: (value: string) => void;
  unlock: () => Promise<boolean>;
};

const POLICY = {
  save: 'guarded',
  upload: 'guarded-if-interactive',
  filter: 'ignored-while-locked',
  unlock: 'exempt',
} as const;

const makeActions = () => ({
  save: jest.fn(async (value: number) => value * 2),
  upload: jest.fn<Promise<string>, [{ interactive?: boolean }?]>(
    async () => 'uploaded',
  ),
  filter: jest.fn<void, [string]>(() => undefined),
  unlock: jest.fn(async () => true),
});

const setup = (locked: boolean) => {
  const guard = createActionLockGuard();
  guard.setLocked(locked);
  const sources = makeActions();
  const actions: Actions = guard.apply<Actions>(sources, POLICY);
  return { guard, sources, actions };
};

const expectLockedRejection = async (call: Promise<unknown>) => {
  const error = await call.catch((e: unknown) => e);
  expect(isAppLockError(error, 'locked')).toBe(true);
  expect((error as Error).message).toBe(UNLOCK_FIRST_MESSAGE);
};

describe('createActionLockGuard', () => {
  describe('a guarded action', () => {
    it('rejects while locked without calling through', async () => {
      const { sources, actions } = setup(true);
      await expectLockedRejection(actions.save(2));
      expect(sources.save).not.toHaveBeenCalled();
    });

    it('calls through with its arguments while unlocked', async () => {
      const { sources, actions } = setup(false);
      await expect(actions.save(2)).resolves.toBe(4);
      expect(sources.save).toHaveBeenCalledWith(2);
    });

    it('refuses by rejecting, never by throwing synchronously', async () => {
      const { actions } = setup(true);
      let pending: Promise<number> | undefined;
      expect(() => {
        pending = actions.save(1);
      }).not.toThrow();
      await expectLockedRejection(pending as Promise<number>);
    });
  });

  describe('an action guarded only when interactive', () => {
    it('rejects an interactive call while locked', async () => {
      const { sources, actions } = setup(true);
      await expectLockedRejection(actions.upload({ interactive: true }));
      expect(sources.upload).not.toHaveBeenCalled();
    });

    it.each([[undefined], [{}], [{ interactive: false }]])(
      'calls through with %p while locked',
      async options => {
        const { sources, actions } = setup(true);
        await expect(actions.upload(options)).resolves.toBe('uploaded');
        expect(sources.upload).toHaveBeenCalledTimes(1);
      },
    );
  });

  describe('an action ignored while locked', () => {
    it('returns without effect while locked', () => {
      const { sources, actions } = setup(true);
      expect(() => actions.filter('x')).not.toThrow();
      expect(actions.filter('x')).toBeUndefined();
      expect(sources.filter).not.toHaveBeenCalled();
    });

    it('calls through while unlocked', () => {
      const { sources, actions } = setup(false);
      actions.filter('x');
      expect(sources.filter).toHaveBeenCalledWith('x');
    });
  });

  it('passes an exempt action through as the same function', () => {
    const { sources, actions } = setup(true);
    expect(actions.unlock).toBe(sources.unlock);
  });

  describe('wrapper identity', () => {
    it('keeps a wrapper while its source is unchanged', () => {
      const guard = createActionLockGuard();
      const sources = makeActions();
      const first = guard.apply<Actions>(sources, POLICY);
      const second = guard.apply<Actions>({ ...sources }, POLICY);
      expect(second.save).toBe(first.save);
      expect(second.filter).toBe(first.filter);
    });

    it('makes a new wrapper when the source changes', () => {
      const guard = createActionLockGuard();
      const sources = makeActions();
      const first = guard.apply<Actions>(sources, POLICY);
      const second = guard.apply<Actions>(
        { ...sources, save: jest.fn(async (value: number) => value) },
        POLICY,
      );
      expect(second.save).not.toBe(first.save);
      expect(second.filter).toBe(first.filter);
    });

    it('never shares a wrapper between guards', () => {
      const sources = makeActions();
      const one = createActionLockGuard().apply<Actions>(sources, POLICY);
      const two = createActionLockGuard().apply<Actions>(sources, POLICY);
      expect(one.save).not.toBe(two.save);
    });
  });

  it('reads the lock when called, not when wrapped', async () => {
    const { guard, sources, actions } = setup(false);
    const save = actions.save;
    await expect(save(1)).resolves.toBe(2);
    guard.setLocked(true);
    await expectLockedRejection(save(1));
    guard.setLocked(false);
    await expect(save(1)).resolves.toBe(2);
    expect(sources.save).toHaveBeenCalledTimes(2);
  });
});
