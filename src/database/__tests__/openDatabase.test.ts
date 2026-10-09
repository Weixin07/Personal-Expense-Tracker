jest.mock('../migrations', () => ({
  latestMigrationVersion: jest.fn(() => 1),
  runMigrations: jest.fn(() => Promise.resolve()),
}));
jest.mock('../seeding', () => ({
  seedInitialData: jest.fn(() => Promise.resolve()),
}));
jest.mock('../snapshot', () => ({
  captureMigrationSnapshot: jest.fn(() => Promise.resolve()),
}));

import SQLite from 'react-native-sqlite-storage';
import * as database from '../index';
import { runMigrations } from '../migrations';
import { seedInitialData } from '../seeding';

type OpenCallback = (db: unknown) => void;
type OpenErrorCallback = (error: unknown) => void;

const defaultOpenImplementation = (
  SQLite.openDatabase as unknown as jest.Mock
).getMockImplementation();

const unansweredOpens = new Set<() => void>();

/**
 * Wraps an open's callbacks so an open the test never answers is caught, and
 * answered, after the test: `closeDatabase()` doesn't forget an open in flight.
 */
const trackUnanswered = (
  success: OpenCallback,
  fail: OpenErrorCallback,
): { success: OpenCallback; fail: OpenErrorCallback } => {
  const leftOpen = () => fail(new Error('Open left unanswered by the test.'));
  unansweredOpens.add(leftOpen);
  return {
    success: db => {
      unansweredOpens.delete(leftOpen);
      success(db);
    },
    fail: error => {
      unansweredOpens.delete(leftOpen);
      fail(error);
    },
  };
};

/**
 * Closes whatever the last test opened, so the cached handle and any pending
 * initialisation never carry over, and clears the mocks' recorded calls.
 */
const loadDatabaseModule = async () => {
  await database.closeDatabase();
  jest.clearAllMocks();
  return {
    database,
    openNative: SQLite.openDatabase as unknown as jest.Mock,
    runMigrations: runMigrations as jest.Mock,
    seedInitialData: seedInitialData as jest.Mock,
  };
};

const nativeHandle = () => ({
  transaction: jest.fn(),
  executeSql: jest.fn(() => Promise.resolve([])),
  close: jest.fn(() => Promise.resolve()),
});

/** Like the library: its own promise resolves at once, whatever the open does. */
const failOpenWith = (openNative: jest.Mock, error: unknown): void => {
  openNative.mockImplementationOnce(
    (_params: unknown, _success: OpenCallback, fail: OpenErrorCallback) => {
      Promise.resolve().then(() => fail(error));
      return Promise.resolve(nativeHandle());
    },
  );
};

const neverAnswerOpen = (openNative: jest.Mock): (() => OpenCallback) => {
  let lateSuccess: OpenCallback = () => {};
  openNative.mockImplementationOnce(
    (_params: unknown, success: OpenCallback, fail: OpenErrorCallback) => {
      lateSuccess = trackUnanswered(success, fail).success;
      return Promise.resolve(nativeHandle());
    },
  );
  return () => lateSuccess;
};

/**
 * Like `SQLitePlugin.java`: the first open answers only when the test says so.
 * Until then, another open answers "database started" at once, and its
 * statements wait on the first open, never answering if that open fails.
 */
const stuckNativeSide = (
  openNative: jest.Mock,
): { succeedLate: OpenCallback; failLate: OpenErrorCallback } => {
  let first: { success: OpenCallback; fail: OpenErrorCallback } | null = null;
  let answered = false;
  let markSucceeded: () => void = () => {};
  const firstSucceeded = new Promise<void>(resolve => {
    markSucceeded = resolve;
  });
  openNative.mockImplementation(
    (_params: unknown, success: OpenCallback, fail: OpenErrorCallback) => {
      if (!first) {
        const tracked = trackUnanswered(success, fail);
        first = {
          success: db => {
            answered = true;
            markSucceeded();
            tracked.success(db);
          },
          fail: error => {
            answered = true;
            tracked.fail(error);
          },
        };
        return Promise.resolve(nativeHandle());
      }
      const db = answered
        ? nativeHandle()
        : {
            ...nativeHandle(),
            executeSql: jest.fn(() => firstSucceeded.then(() => [])),
          };
      Promise.resolve().then(() => success(db));
      return Promise.resolve(db);
    },
  );
  return {
    succeedLate: db => first?.success(db),
    failLate: error => first?.fail(error),
  };
};

const timeOutFirstOpen = async (): Promise<void> => {
  const outcome = expect(database.withDatabase(jest.fn())).rejects.toThrow(
    'took longer than 15 seconds',
  );
  await jest.advanceTimersByTimeAsync(database.DATABASE_OPEN_TIMEOUT_MS);
  await outcome;
};

describe('withDatabase opening the database', () => {
  afterEach(() => {
    const leftOpen = [...unansweredOpens];
    unansweredOpens.clear();
    leftOpen.forEach(answer => answer());
    (SQLite.openDatabase as unknown as jest.Mock).mockImplementation(
      defaultOpenImplementation,
    );
    jest.useRealTimers();
    expect(leftOpen).toHaveLength(0);
  });

  it('rejects withDatabase when the native open fails, without running the callback', async () => {
    const { database, openNative, runMigrations } = await loadDatabaseModule();
    failOpenWith(openNative, new Error('(code 14 SQLITE_CANTOPEN)'));
    const callback = jest.fn();
    await expect(database.withDatabase(callback)).rejects.toThrow(
      '(code 14 SQLITE_CANTOPEN)',
    );
    expect(callback).not.toHaveBeenCalled();
    expect(runMigrations).not.toHaveBeenCalled();
  });

  it("rejects when the library's own promise rejects", async () => {
    const { database, openNative } = await loadDatabaseModule();
    openNative.mockImplementationOnce(() =>
      Promise.reject(new Error('bridge failed')),
    );
    await expect(database.withDatabase(jest.fn())).rejects.toThrow(
      'bridge failed',
    );
  });

  it('opens afresh on the next call after a failed open', async () => {
    const { database, openNative } = await loadDatabaseModule();
    failOpenWith(openNative, new Error('(code 14 SQLITE_CANTOPEN)'));
    await expect(database.withDatabase(jest.fn())).rejects.toThrow();
    await expect(
      database.withDatabase(() => Promise.resolve('read')),
    ).resolves.toBe('read');
    expect(openNative).toHaveBeenCalledTimes(2);
  });

  it('initialises once and reuses the handle after a successful open', async () => {
    const { database, openNative, runMigrations, seedInitialData } =
      await loadDatabaseModule();
    const first = await database.withDatabase(db => Promise.resolve(db));
    const second = await database.withDatabase(db => Promise.resolve(db));
    expect(second).toBe(first);
    expect(openNative).toHaveBeenCalledTimes(1);
    expect(runMigrations).toHaveBeenCalledTimes(1);
    expect(seedInitialData).toHaveBeenCalledTimes(1);
  });

  it('rejects after DATABASE_OPEN_TIMEOUT_MS when the open never answers', async () => {
    jest.useFakeTimers();
    const { database, openNative } = await loadDatabaseModule();
    const lateSuccess = neverAnswerOpen(openNative);
    let settled = false;
    const outcome = database.withDatabase(jest.fn()).finally(() => {
      settled = true;
    });
    const assertion = expect(outcome).rejects.toThrow(
      'Opening the database took longer than 15 seconds.',
    );
    await jest.advanceTimersByTimeAsync(database.DATABASE_OPEN_TIMEOUT_MS - 1);
    expect(settled).toBe(false);
    await jest.advanceTimersByTimeAsync(1);
    await assertion;
    lateSuccess()(nativeHandle());
  });

  it('opens on the next call after an open that answered too late', async () => {
    jest.useFakeTimers();
    const { database, openNative } = await loadDatabaseModule();
    const lateSuccess = neverAnswerOpen(openNative);
    const assertion = expect(database.withDatabase(jest.fn())).rejects.toThrow(
      'took longer than 15 seconds',
    );
    await jest.advanceTimersByTimeAsync(database.DATABASE_OPEN_TIMEOUT_MS);
    await assertion;
    lateSuccess()(nativeHandle());
    await expect(
      database.withDatabase(() => Promise.resolve('read')),
    ).resolves.toBe('read');
  });

  it('shares one open between concurrent callers', async () => {
    const { database, openNative, runMigrations } = await loadDatabaseModule();
    const [first, second] = await Promise.all([
      database.withDatabase(db => Promise.resolve(db)),
      database.withDatabase(db => Promise.resolve(db)),
    ]);
    expect(second).toBe(first);
    expect(openNative).toHaveBeenCalledTimes(1);
    expect(runMigrations).toHaveBeenCalledTimes(1);
  });

  it('retries after initialisation fails', async () => {
    const { database, openNative, runMigrations } = await loadDatabaseModule();
    runMigrations.mockRejectedValueOnce(new Error('migration failed'));
    await expect(database.withDatabase(jest.fn())).rejects.toThrow(
      'migration failed',
    );
    await expect(
      database.withDatabase(() => Promise.resolve('read')),
    ).resolves.toBe('read');
    expect(runMigrations).toHaveBeenCalledTimes(2);
    expect(openNative).toHaveBeenCalledTimes(2);
  });

  it('states the timeout in the message', async () => {
    jest.useFakeTimers();
    const { database, openNative } = await loadDatabaseModule();
    expect(database.DATABASE_OPEN_TIMEOUT_MS).toBe(15_000);
    const lateSuccess = neverAnswerOpen(openNative);
    const assertion = expect(database.withDatabase(jest.fn())).rejects.toThrow(
      `${database.DATABASE_OPEN_TIMEOUT_MS / 1000} seconds`,
    );
    await jest.advanceTimersByTimeAsync(database.DATABASE_OPEN_TIMEOUT_MS);
    await assertion;
    lateSuccess()(nativeHandle());
  });

  describe('a retry while the first open is still stuck', () => {
    beforeEach(() => {
      jest.useFakeTimers();
    });

    it('does not open natively again while the first open is stuck', async () => {
      const { openNative } = await loadDatabaseModule();
      const native = stuckNativeSide(openNative);
      await timeOutFirstOpen();
      const assertion = expect(
        database.withDatabase(jest.fn()),
      ).rejects.toThrow('SQLITE_CANTOPEN');
      await jest.advanceTimersByTimeAsync(1_000);
      expect(openNative).toHaveBeenCalledTimes(1);
      native.failLate(new Error('(code 14 SQLITE_CANTOPEN)'));
      await assertion;
    });

    it('times out again with the same message while the first open stays stuck', async () => {
      const { openNative } = await loadDatabaseModule();
      const native = stuckNativeSide(openNative);
      await timeOutFirstOpen();
      const assertion = expect(
        database.withDatabase(jest.fn()),
      ).rejects.toThrow('Opening the database took longer than 15 seconds.');
      await jest.advanceTimersByTimeAsync(database.DATABASE_OPEN_TIMEOUT_MS);
      await assertion;
      expect(openNative).toHaveBeenCalledTimes(1);
      native.succeedLate(nativeHandle());
    });

    it('rejects the retry with the native message when the stuck open fails late', async () => {
      const { openNative } = await loadDatabaseModule();
      const native = stuckNativeSide(openNative);
      await timeOutFirstOpen();
      const callback = jest.fn();
      const assertion = expect(database.withDatabase(callback)).rejects.toThrow(
        "Can't open database. (code 14 SQLITE_CANTOPEN)",
      );
      native.failLate(
        new Error("Can't open database. (code 14 SQLITE_CANTOPEN)"),
      );
      await assertion;
      expect(callback).not.toHaveBeenCalled();
    });

    it('resolves the retry when the stuck open succeeds late, and initialises once', async () => {
      const { openNative, runMigrations } = await loadDatabaseModule();
      const native = stuckNativeSide(openNative);
      await timeOutFirstOpen();
      const retry = database.withDatabase(db => Promise.resolve(db));
      const handle = nativeHandle();
      native.succeedLate(handle);
      await expect(retry).resolves.toBe(handle);
      expect(openNative).toHaveBeenCalledTimes(1);
      expect(runMigrations).toHaveBeenCalledTimes(1);
    });

    it('a stale open settling after closeDatabase does not clear a newer one', async () => {
      const { openNative, runMigrations } = await loadDatabaseModule();
      const native = stuckNativeSide(openNative);
      const stale = expect(database.withDatabase(jest.fn())).rejects.toThrow(
        'took longer than 15 seconds',
      );
      await database.closeDatabase();
      await jest.advanceTimersByTimeAsync(5_000);
      const newer = database.withDatabase(db => Promise.resolve(db));
      await jest.advanceTimersByTimeAsync(
        database.DATABASE_OPEN_TIMEOUT_MS - 5_000,
      );
      await stale;
      const third = database.withDatabase(db => Promise.resolve(db));
      const handle = nativeHandle();
      native.succeedLate(handle);
      await expect(newer).resolves.toBe(handle);
      await expect(third).resolves.toBe(handle);
      expect(runMigrations).toHaveBeenCalledTimes(1);
      expect(openNative).toHaveBeenCalledTimes(1);
    });
  });
});
