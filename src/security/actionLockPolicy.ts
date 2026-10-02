import { AppLockError, UNLOCK_FIRST_MESSAGE } from './appLockError';

export type ActionLockPolicy =
  /** Async; rejects with an `AppLockError` of kind `locked` while locked. */
  | 'guarded'
  /** As `guarded`, but only when called with `{ interactive: true }`. */
  | 'guarded-if-interactive'
  /** Synchronous; returns `undefined` without calling through while locked. */
  | 'ignored-while-locked'
  /** Passed through as the same function. */
  | 'exempt';

type AnyAction = (...args: never[]) => unknown;

export type ActionLockGuard = {
  setLocked: (locked: boolean) => void;
  apply: <T extends Record<string, AnyAction>>(
    actions: T,
    policy: { readonly [K in keyof T]: ActionLockPolicy },
  ) => T;
};

/**
 * A lock flag plus the wrappers that enforce it. Wrappers read the flag when
 * called, not when wrapped, so a reference taken before the lock is still
 * refused after it. `apply` returns the same wrapper for an action until that
 * action's function changes, keeping wrapped identities as stable as their
 * sources.
 */
export const createActionLockGuard = (): ActionLockGuard => {
  let locked = false;
  const slots = new Map<string, { source: AnyAction; wrapped: AnyAction }>();

  const refuse = () => new AppLockError('locked', UNLOCK_FIRST_MESSAGE);

  const wrap = (source: AnyAction, policy: ActionLockPolicy): AnyAction => {
    switch (policy) {
      case 'exempt':
        return source;
      case 'ignored-while-locked':
        return (...args) => (locked ? undefined : source(...args));
      case 'guarded-if-interactive':
        return async (...args) => {
          const options = args[0] as { interactive?: unknown } | undefined;
          if (locked && options?.interactive === true) {
            throw refuse();
          }
          return source(...args);
        };
      case 'guarded':
        return async (...args) => {
          if (locked) {
            throw refuse();
          }
          return source(...args);
        };
    }
  };

  return {
    setLocked: next => {
      locked = next;
    },
    apply: (actions, policy) => {
      const guarded: Record<string, AnyAction> = {};
      for (const name of Object.keys(actions)) {
        const source = actions[name];
        const slot = slots.get(name);
        if (slot && slot.source === source) {
          guarded[name] = slot.wrapped;
          continue;
        }
        const wrapped = wrap(
          source,
          (policy as Record<string, ActionLockPolicy>)[name],
        );
        slots.set(name, { source, wrapped });
        guarded[name] = wrapped;
      }
      return guarded as typeof actions;
    },
  };
};

export const TRANSACTION_ACTION_LOCK_POLICY = {
  refresh: 'exempt',
  createTransaction: 'guarded',
  updateTransaction: 'guarded',
  deleteTransaction: 'guarded',
  setTransactionConfirmed: 'guarded',
  createCategory: 'guarded',
  updateCategory: 'guarded',
  deleteCategory: 'guarded',
  createFund: 'guarded',
  updateFund: 'guarded',
  deleteFund: 'guarded',
  setBaseCurrency: 'guarded',
  setBiometricGateEnabled: 'guarded',
  setAutoLockMinutes: 'guarded',
  setDriveFolderId: 'guarded',
  setExportDirectoryUri: 'guarded',
  setFilters: 'ignored-while-locked',
  clearFilters: 'ignored-while-locked',
  clearError: 'ignored-while-locked',
  queueExport: 'guarded',
  retryExport: 'guarded',
  removeExport: 'guarded',
  clearCompletedExports: 'guarded',
  uploadQueuedExports: 'guarded-if-interactive',
  importTransactions: 'guarded',
  unlockWithBiometrics: 'exempt',
  unlockWithPin: 'exempt',
  setAppPin: 'exempt',
  changeAppPin: 'guarded',
  turnOffAppLock: 'guarded',
  appPinUsable: 'exempt',
  completePinSetup: 'exempt',
  declinePinSetup: 'exempt',
  unlockWithDeviceCredential: 'exempt',
  openScreenLockSettings: 'exempt',
  refreshLockAvailability: 'exempt',
} as const satisfies Record<string, ActionLockPolicy>;
