type NativeCallback = (value?: unknown) => void;

interface NativeExecute {
  sql: string;
}

interface PendingOpen {
  ok: NativeCallback;
  err: NativeCallback;
}

type OpenAnswer = 'success' | { error: string };

interface PromiseHandle {
  executeSql(sql: string): Promise<unknown>;
  sqlBatch(statements: string[]): Promise<unknown>;
  close(): Promise<unknown>;
}

interface CallbackHandle {
  executeSql(
    sql: string,
    params: unknown[],
    ok: (result: unknown) => void,
    err: (error: Error) => void,
  ): void;
  close(ok: () => void, err: (error: unknown) => void): void;
}

interface OpenParams {
  name: string;
  location: 'default';
}

interface RealSQLite {
  enablePromise(enable: boolean): void;
  openDatabase(
    params: OpenParams,
    ok?: (db: unknown) => void,
    err?: (error: Error) => void,
  ): unknown;
}

type Settled =
  | { state: 'pending' }
  | { state: 'resolved' | 'rejected'; value: unknown };

/**
 * Stands in for the native `SQLite` module only. Every answer arrives on a
 * later tick, as the bridge's do; opens wait until the test calls
 * `answerOpen`, and every batch succeeds with no rows.
 */
const createFakeNative = () => {
  const opens: PendingOpen[] = [];
  const sent: string[] = [];
  return {
    open: (_args: unknown, ok: NativeCallback, err: NativeCallback) => {
      opens.push({ ok, err });
    },
    close: (_args: unknown, ok: NativeCallback) => {
      setImmediate(ok);
    },
    backgroundExecuteSqlBatch: (
      { executes }: { executes: NativeExecute[] },
      ok: NativeCallback,
    ) => {
      sent.push(...executes.map(execute => execute.sql));
      setImmediate(() =>
        ok(
          executes.map(() => ({
            type: 'success',
            result: { rows: [], rowsAffected: 0 },
          })),
        ),
      );
    },
    /** Answers the `index`th open, counted from the first. */
    answerOpen: (index: number, answer: OpenAnswer) => {
      const { ok, err } = opens[index];
      setImmediate(() => (answer === 'success' ? ok() : err(answer.error)));
    },
    openCount: () => opens.length,
    /** Every SQL string sent to the native side, in order. */
    batches: () => [...sent],
  };
};

let lib: RealSQLite;
let native: ReturnType<typeof createFakeNative>;

/** Waits out enough ticks for an open's answer to run a queued statement. */
const flush = async () => {
  for (let tick = 0; tick < 10; tick += 1) {
    await new Promise(resolve => setImmediate(resolve));
  }
};

/** Reports how `promise` stands after `flush`, so a hang fails fast. */
const settled = async (promise: Promise<unknown>): Promise<Settled> => {
  let outcome: Settled = { state: 'pending' };
  promise.then(
    value => {
      outcome = { state: 'resolved', value };
    },
    (value: unknown) => {
      outcome = { state: 'rejected', value };
    },
  );
  await flush();
  return outcome;
};

const rejectedWith = (message: string) => ({
  state: 'rejected',
  value: expect.objectContaining({ message }),
});

/** Starts an open the fake has not answered; its index is `openCount() - 1`. */
const startOpen = (name: string, err?: (error: Error) => void) =>
  lib.openDatabase(
    { name, location: 'default' },
    () => {},
    err,
  ) as Promise<PromiseHandle>;

const openHandle = async (name: string): Promise<PromiseHandle> => {
  const handle = await startOpen(name);
  native.answerOpen(native.openCount() - 1, 'success');
  await flush();
  return handle;
};

/** Opens `name` and has the native side fail it with `nativeError`. */
const failedHandle = async (name: string, nativeError: string) => {
  const openError = jest.fn<void, [Error]>();
  const handle = await startOpen(name, openError);
  native.answerOpen(native.openCount() - 1, { error: nativeError });
  await flush();
  return { handle, openError };
};

const closedHandle = async (name: string): Promise<PromiseHandle> => {
  const handle = await openHandle(name);
  await handle.close();
  await flush();
  return handle;
};

beforeEach(() => {
  native = createFakeNative();
  jest.isolateModules(() => {
    jest.requireActual('react-native').NativeModules.SQLite = native;
    lib = jest.requireActual('react-native-sqlite-storage') as RealSQLite;
  });
});

describe('react-native-sqlite-storage as patched, in promise mode', () => {
  beforeEach(() => {
    lib.enablePromise(true);
  });

  it('rejects a statement on a closed handle', async () => {
    const handle = await closedHandle('closed.db');

    const outcome = await settled(handle.executeSql("SELECT 'stranded'"));

    expect(outcome).toEqual(rejectedWith('database not open'));
    expect(native.batches()).not.toContain("SELECT 'stranded'");
  });

  it('rejects a statement on a handle whose open failed', async () => {
    const { handle } = await failedHandle('failed.db', 'x');

    const outcome = await settled(handle.executeSql("SELECT 'stranded'"));

    expect(outcome).toEqual(rejectedWith('database not open'));
  });

  it('rejects a batch on a closed handle', async () => {
    const handle = await closedHandle('closed.db');

    const outcome = await settled(handle.sqlBatch(["SELECT 'stranded'"]));

    expect(outcome).toEqual(rejectedWith('database not open'));
    expect(native.batches()).not.toContain("SELECT 'stranded'");
  });

  it('never runs a rejected statement when the name reopens', async () => {
    const closed = await closedHandle('reopened.db');
    const outcome = await settled(closed.executeSql("SELECT 'stranded'"));
    expect(outcome).toEqual(rejectedWith('database not open'));

    const reopened = await openHandle('reopened.db');
    await reopened.executeSql("SELECT 'after reopen'");

    expect(native.batches()).toContain("SELECT 'after reopen'");
    expect(native.batches()).not.toContain("SELECT 'stranded'");
  });

  it('runs a statement issued while the open is in flight', async () => {
    const handle = await startOpen('opening.db');
    const statement = handle.executeSql("SELECT 'waited'");

    expect(await settled(statement)).toEqual({ state: 'pending' });

    native.answerOpen(0, 'success');

    expect(await settled(statement)).toMatchObject({ state: 'resolved' });
    expect(native.batches()).toContain("SELECT 'waited'");
  });

  it("reports the native open error's own text", async () => {
    const nativeError =
      'android.database.sqlite.SQLiteCantOpenDatabaseException: unknown error (code 14 SQLITE_CANTOPEN)';

    const { openError } = await failedHandle('unreadable.db', nativeError);

    expect(openError).toHaveBeenCalledWith(
      expect.objectContaining({ message: nativeError }),
    );
  });

  it('falls back to "Could not open database" when the native error is empty', async () => {
    const { openError } = await failedHandle('unreadable.db', '');

    expect(openError).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'Could not open database' }),
    );
  });

  it('rejects a statement queued behind an open that fails', async () => {
    const handle = await startOpen('unreadable.db', () => {});
    const statement = handle.executeSql("SELECT 'queued'");

    native.answerOpen(0, { error: 'x' });

    expect(await settled(statement)).toEqual(
      rejectedWith('Invalid database handle'),
    );
  });
});

describe('react-native-sqlite-storage as patched, in callback mode', () => {
  it('reports the rejection before executeSql returns', async () => {
    const handle = lib.openDatabase({
      name: 'closed.db',
      location: 'default',
    }) as CallbackHandle;
    native.answerOpen(0, 'success');
    await flush();
    handle.close(
      () => {},
      () => {},
    );
    await flush();
    const ok = jest.fn();
    const err = jest.fn<void, [Error]>();

    handle.executeSql("SELECT 'stranded'", [], ok, err);

    expect(err).toHaveBeenCalledTimes(1);
    expect(err).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'database not open' }),
    );
    expect(ok).not.toHaveBeenCalled();
  });
});
