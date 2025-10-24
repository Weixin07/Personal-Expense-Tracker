import SQLite, { type SQLiteDatabase } from "react-native-sqlite-storage";
import { latestMigrationVersion, runMigrations } from "./migrations";
import { seedInitialData } from "./seeding";

SQLite.enablePromise(true);

let databaseInstance: SQLiteDatabase | null = null;

const DATABASE_NAME = "expense_tracker.db";

type WithDatabaseCallback<T> = (db: SQLiteDatabase) => Promise<T>;

const applyPragmas = async (db: SQLiteDatabase): Promise<void> => {
  await db.executeSql("PRAGMA foreign_keys = ON");
  await db.executeSql("PRAGMA journal_mode = WAL");
};

export const openDatabase = async (): Promise<SQLiteDatabase> => {
  if (databaseInstance) {
    return databaseInstance;
  }

  const db = await SQLite.openDatabase({
    name: DATABASE_NAME,
    location: "default",
  });

  await applyPragmas(db);
  await runMigrations(db);
  await seedInitialData(db);

  databaseInstance = db;
  return db;
};

export const closeDatabase = async (): Promise<void> => {
  if (!databaseInstance) {
    return;
  }
  await databaseInstance.close();
  databaseInstance = null;
};

export const withDatabase = async <T>(callback: WithDatabaseCallback<T>): Promise<T> => {
  const db = await openDatabase();
  return callback(db);
};

export const currentSchemaVersion = async (): Promise<number> => {
  const db = await openDatabase();
  const [result] = await db.executeSql(
    "SELECT MAX(version) AS version FROM schema_migrations",
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
