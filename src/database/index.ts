import SQLite, { type SQLiteDatabase } from 'react-native-sqlite-storage';
import { latestMigrationVersion, runMigrations } from './migrations';
import { seedInitialData } from './seeding';
import { captureMigrationSnapshot } from './snapshot';

SQLite.enablePromise(true);

export const DATABASE_OPEN_TIMEOUT_MS = 15_000;

let databaseInstance: SQLiteDatabase | null = null;
let pendingOpen: Promise<SQLiteDatabase> | null = null;
// Android answers a second open of a database that is still opening with
// success, so an open in flight is rejoined, never repeated.
let nativeOpen: Promise<SQLiteDatabase> | null = null;

const DATABASE_NAME = 'expense_tracker.db';

type WithDatabaseCallback<T> = (db: SQLiteDatabase) => Promise<T>;

const applyPragmas = async (db: SQLiteDatabase): Promise<void> => {
  await db.executeSql('PRAGMA foreign_keys = ON');
  await db.executeSql('PRAGMA journal_mode = WAL');
};

// The library's promise resolves before the open completes; only the
// callbacks report whether it succeeded.
const openNativeDatabase = (): Promise<SQLiteDatabase> =>
  new Promise((resolve, reject) => {
    SQLite.openDatabase(
      { name: DATABASE_NAME, location: 'default' },
      resolve,
      reject,
    ).catch(reject);
  });

const joinNativeOpen = (): Promise<SQLiteDatabase> => {
  if (nativeOpen) {
    return nativeOpen;
  }
  const open = openNativeDatabase();
  nativeOpen = open;
  const forget = () => {
    if (nativeOpen === open) {
      nativeOpen = null;
    }
  };
  open.then(forget, forget);
  return open;
};

const openNativeDatabaseWithTimeout = async (): Promise<SQLiteDatabase> => {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(
      () =>
        reject(new Error('Opening the database took longer than 15 seconds.')),
      DATABASE_OPEN_TIMEOUT_MS,
    );
  });
  try {
    return await Promise.race([joinNativeOpen(), timeout]);
  } finally {
    clearTimeout(timer);
  }
};

const initialiseDatabase = async (): Promise<SQLiteDatabase> => {
  const db = await openNativeDatabaseWithTimeout();

  await applyPragmas(db);
  await captureMigrationSnapshot(db, DATABASE_NAME, latestMigrationVersion());
  await runMigrations(db);
  await seedInitialData(db);

  databaseInstance = db;
  return db;
};

/**
 * Concurrent callers share one initialisation. A failed one is not kept, so
 * the next call opens again.
 */
export const openDatabase = (): Promise<SQLiteDatabase> => {
  if (databaseInstance) {
    return Promise.resolve(databaseInstance);
  }
  if (pendingOpen) {
    return pendingOpen;
  }
  const chain = initialiseDatabase();
  pendingOpen = chain;
  const forget = () => {
    if (pendingOpen === chain) {
      pendingOpen = null;
    }
  };
  chain.then(forget, forget);
  return chain;
};

export const closeDatabase = async (): Promise<void> => {
  pendingOpen = null;
  if (!databaseInstance) {
    return;
  }
  await databaseInstance.close();
  databaseInstance = null;
};

/**
 * Resolves with the callback's result. Rejects when the database cannot be
 * opened, its open exceeds `DATABASE_OPEN_TIMEOUT_MS`, or initialisation
 * fails; the next call then opens again, or waits on an open still in
 * flight.
 */
export const withDatabase = async <T>(
  callback: WithDatabaseCallback<T>,
): Promise<T> => {
  const db = await openDatabase();
  return callback(db);
};

export const withTransaction = async <T>(
  db: SQLiteDatabase,
  work: (db: SQLiteDatabase) => Promise<T>,
): Promise<T> => {
  await db.executeSql('BEGIN TRANSACTION');
  try {
    const result = await work(db);
    await db.executeSql('COMMIT');
    return result;
  } catch (error) {
    try {
      await db.executeSql('ROLLBACK');
    } catch {
      // A failed rollback must not mask the original error.
    }
    throw error;
  }
};

export const currentSchemaVersion = async (): Promise<number> => {
  const db = await openDatabase();
  const [result] = await db.executeSql(
    'SELECT MAX(version) AS version FROM schema_migrations',
  );
  if (result.rows.length === 0) {
    return 0;
  }
  const row = result.rows.item(0) as { version: number | null };
  return row?.version ?? 0;
};

export const expectedSchemaVersion = (): number => latestMigrationVersion();

export * from './repositories';
export * from './types';
