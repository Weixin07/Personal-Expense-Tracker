type NativeCallback = (value?: unknown) => void;

interface NativeExecute {
  sql: string;
}

interface PendingOpen {
  ok: NativeCallback;
  err: NativeCallback;
}

type OpenAnswer = 'success' | { error: string };

interface TxHandle {
  executeSql(
    sql: string,
    params: unknown[],
    ok?: () => void,
    err?: (error: Error) => void,
  ): void;
}

interface PromiseHandle {
  executeSql(sql: string): Promise<unknown>;
  sqlBatch(statements: string[]): Promise<unknown>;
  transaction(fn: (tx: TxHandle) => void): Promise<unknown>;
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
 * `answerOpen`, and every batch succeeds with no rows unless `refuseBatches`
 * matches it.
 */
const createFakeNative = () => {
  const opens: PendingOpen[] = [];
  const sent: string[] = [];
  let heldAnswers: (() => void)[] | null = null;
  let refusal: { text: string; matches: (sqls: string[]) => boolean } | null =
    null;
  const answerBatch = (answer: () => void) => {
    if (heldAnswers) {
      heldAnswers.push(answer);
    } else {
      setImmediate(answer);
    }
  };
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
      err: NativeCallback,
    ) => {
      const sqls = executes.map(execute => execute.sql);
      sent.push(...sqls);
      if (refusal?.matches(sqls)) {
        const { text } = refusal;
        answerBatch(() => err(text));
        return;
      }
      answerBatch(() =>
        ok(
          executes.map(() => ({
            type: 'success',
            result: { rows: [], rowsAffected: 0 },
          })),
        ),
      );
    },
    /** Refuses every batch sent from now on whose SQL `matches`, with `text`. */
    refuseBatches: (
      text: string,
      matches: (sqls: string[]) => boolean = () => true,
    ) => {
      refusal = { text, matches };
    },
    /** Keeps every batch sent from now on unanswered until `releaseBatches`. */
    holdBatches: () => {
      heldAnswers = heldAnswers ?? [];
    },
    /** Answers the held batches in the order they were sent, and stops holding. */
    releaseBatches: () => {
      const answers = heldAnswers ?? [];
      heldAnswers = null;
      answers.forEach(answer => setImmediate(answer));
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

const containing = (sql: string) => (sqls: string[]) => sqls.includes(sql);

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

const openCallbackHandle = async (name: string): Promise<CallbackHandle> => {
  const handle = lib.openDatabase({
    name,
    location: 'default',
  }) as CallbackHandle;
  native.answerOpen(native.openCount() - 1, 'success');
  await flush();
  return handle;
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

  it('rejects a statement issued just before a close, and never runs it when the name reopens', async () => {
    const handle = await openHandle('closing.db');

    const statement = handle.executeSql("SELECT 'stranded'");
    const closing = handle.close();
    const afterClose = handle.executeSql("SELECT 'after close'");

    const outcomes = await Promise.all(
      [statement, afterClose, closing].map(settled),
    );

    expect(outcomes).toEqual([
      rejectedWith('database not open'),
      rejectedWith('database not open'),
      expect.objectContaining({ state: 'resolved' }),
    ]);

    const reopened = await openHandle('closing.db');
    await reopened.executeSql("SELECT 'after reopen'");

    expect(native.batches()).toContain("SELECT 'after reopen'");
    expect(native.batches()).not.toContain("SELECT 'stranded'");
    expect(native.batches()).not.toContain("SELECT 'after close'");
  });

  it('rejects a statement queued during the open when the database closes before the open answers, and never runs it when the name reopens', async () => {
    const handle = await startOpen('closed-while-opening.db');

    const statement = handle.executeSql("SELECT 'stranded'");
    const closing = handle.close();
    const afterClose = handle.executeSql("SELECT 'after close'");

    const outcomes = await Promise.all(
      [statement, afterClose, closing].map(settled),
    );

    expect(outcomes).toEqual([
      rejectedWith('database not open'),
      rejectedWith('database not open'),
      expect.objectContaining({ state: 'resolved' }),
    ]);

    native.answerOpen(0, 'success');
    await flush();
    const reopened = await openHandle('closed-while-opening.db');
    await reopened.executeSql("SELECT 'after reopen'");

    expect(native.batches()).toContain("SELECT 'after reopen'");
    expect(native.batches()).not.toContain("SELECT 'stranded'");
    expect(native.batches()).not.toContain("SELECT 'after close'");
  });

  it('leaves the queue to run when a close is refused during a transaction', async () => {
    const handle = await openHandle('busy.db');
    native.holdBatches();
    const running = handle.executeSql("SELECT 'running'");
    await flush();
    const queued = handle.executeSql("SELECT 'queued'");

    const closing = await settled(handle.close());
    native.releaseBatches();

    expect(closing).toEqual(
      rejectedWith(
        'database cannot be closed while a transaction is in progress',
      ),
    );
    expect(await settled(running)).toMatchObject({ state: 'resolved' });
    expect(await settled(queued)).toMatchObject({ state: 'resolved' });
    expect(native.batches().indexOf("SELECT 'running'")).toBeLessThan(
      native.batches().indexOf("SELECT 'queued'"),
    );
  });

  it('rejects a statement whose batch is refused, and runs the statement queued behind it', async () => {
    const handle = await openHandle('refused.db');
    native.refuseBatches('database not open', containing("SELECT 'refused'"));

    const outcomes = await Promise.all(
      [
        handle.executeSql("SELECT 'refused'"),
        handle.executeSql("SELECT 'next'"),
      ].map(settled),
    );

    expect(outcomes).toEqual([
      rejectedWith('database not open'),
      expect.objectContaining({ state: 'resolved' }),
    ]);
    expect(native.batches().indexOf("SELECT 'refused'")).toBeLessThan(
      native.batches().indexOf("SELECT 'next'"),
    );
  });

  it.each([
    'database not open',
    "couldn't add to queue",
    'database has been closed',
    'Unexpected error executing processing SQLite query',
  ])("passes the native refusal's text through: %s", async text => {
    const handle = await openHandle('refused.db');
    native.refuseBatches(text);

    const outcome = await settled(handle.executeSql("SELECT 'refused'"));

    expect(outcome).toEqual(rejectedWith(text));
  });

  it('rolls back a batch whose BEGIN is refused, and runs the next statement', async () => {
    const handle = await openHandle('refused.db');
    native.refuseBatches('database not open', containing('BEGIN'));

    const outcomes = await Promise.all(
      [
        handle.sqlBatch(["SELECT 'refused'"]),
        handle.executeSql("SELECT 'next'"),
      ].map(settled),
    );

    expect(outcomes).toEqual([
      rejectedWith('database not open'),
      expect.objectContaining({ state: 'resolved' }),
    ]);
    expect(native.batches()).toContain('ROLLBACK');
  });

  it('rejects a batch whose ROLLBACK is refused too, and runs the next statement', async () => {
    const handle = await openHandle('refused.db');
    native.refuseBatches(
      "couldn't add to queue",
      sqls => sqls.includes('BEGIN') || sqls.includes('ROLLBACK'),
    );

    const outcomes = await Promise.all(
      [
        handle.sqlBatch(["SELECT 'refused'"]),
        handle.executeSql("SELECT 'next'"),
      ].map(settled),
    );

    expect(outcomes).toEqual([
      rejectedWith("error while trying to roll back: couldn't add to queue"),
      expect.objectContaining({ state: 'resolved' }),
    ]);
  });

  it('rejects a batch whose COMMIT is refused, and runs the next statement', async () => {
    const handle = await openHandle('refused.db');
    native.refuseBatches('database has been closed', containing('COMMIT'));

    const outcomes = await Promise.all(
      [
        handle.sqlBatch(["SELECT 'committed'"]),
        handle.executeSql("SELECT 'next'"),
      ].map(settled),
    );

    expect(outcomes).toEqual([
      rejectedWith('error while trying to commit: database has been closed'),
      expect.objectContaining({ state: 'resolved' }),
    ]);
  });

  it('rejects a transaction whose second batch is refused, and runs the next statement', async () => {
    const handle = await openHandle('refused.db');
    native.refuseBatches('database not open', containing("SELECT 'second'"));
    const secondErr = jest.fn<void, [Error]>();

    const outcomes = await Promise.all(
      [
        handle.transaction(tx =>
          tx.executeSql(
            "SELECT 'first'",
            [],
            () => tx.executeSql("SELECT 'second'", [], () => {}, secondErr),
            () => {},
          ),
        ),
        handle.executeSql("SELECT 'next'"),
      ].map(settled),
    );

    expect(outcomes).toEqual([
      rejectedWith('database not open'),
      expect.objectContaining({ state: 'resolved' }),
    ]);
    expect(secondErr).toHaveBeenCalledTimes(1);
    expect(secondErr).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'database not open' }),
    );
    expect(native.batches()).toContain('ROLLBACK');
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

  it('reports a statement aborted by a close before close returns', async () => {
    const handle = await openCallbackHandle('closing.db');
    const ok = jest.fn();
    const err = jest.fn<void, [Error]>();

    handle.executeSql("SELECT 'stranded'", [], ok, err);
    handle.close(
      () => {},
      () => {},
    );

    expect(err).toHaveBeenCalledTimes(1);
    expect(err).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'database not open' }),
    );
    expect(ok).not.toHaveBeenCalled();
  });

  it('rejects a statement issued from an abort callback, and never runs it when the name reopens', async () => {
    const handle = await openCallbackHandle('reissued.db');
    const reissuedOk = jest.fn();
    const reissuedErr = jest.fn<void, [Error]>();

    handle.executeSql(
      "SELECT 'stranded'",
      [],
      () => {},
      () => handle.executeSql("SELECT 'reissued'", [], reissuedOk, reissuedErr),
    );
    handle.close(
      () => {},
      () => {},
    );
    await flush();

    expect(reissuedErr).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'database not open' }),
    );
    expect(reissuedOk).not.toHaveBeenCalled();

    const reopened = await openCallbackHandle('reissued.db');
    reopened.executeSql(
      "SELECT 'after reopen'",
      [],
      () => {},
      () => {},
    );
    await flush();

    expect(native.batches()).toContain("SELECT 'after reopen'");
    expect(native.batches()).not.toContain("SELECT 'stranded'");
    expect(native.batches()).not.toContain("SELECT 'reissued'");
  });

  it('reports a refused batch once, to the error callback', async () => {
    const handle = await openCallbackHandle('refused.db');
    native.refuseBatches('database not open');
    const ok = jest.fn();
    const err = jest.fn<void, [Error]>();

    handle.executeSql("SELECT 'refused'", [], ok, err);
    await flush();

    expect(err).toHaveBeenCalledTimes(1);
    expect(err).toHaveBeenCalledWith(
      expect.objectContaining({ message: 'database not open' }),
    );
    expect(ok).not.toHaveBeenCalled();
  });
});
