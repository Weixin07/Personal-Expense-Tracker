import type { SQLiteDatabase, Transaction } from "react-native-sqlite-storage";

export type MigrationStatement = {
  sql: string;
  args?: Array<string | number | null>;
};

export type Migration = {
  version: number;
  name: string;
  statements: readonly MigrationStatement[];
};

const MIGRATIONS: readonly Migration[] = [
  {
    version: 4,
    name: "export-queue-file-uri",
    statements: [
      {
        sql: `ALTER TABLE export_queue ADD COLUMN file_uri TEXT NULL;`,
      },
      {
        sql: `UPDATE export_queue SET file_uri = file_path WHERE file_uri IS NULL;`,
      },
    ],
  },
  {
    version: 3,
    name: "export-queue-metadata",
    statements: [
      {
        sql: `ALTER TABLE export_queue ADD COLUMN uploaded_at TEXT NULL;`,
      },
      {
        sql: `ALTER TABLE export_queue ADD COLUMN drive_file_id TEXT NULL;`,
      },
      {
        sql: `CREATE INDEX IF NOT EXISTS idx_export_queue_uploaded_at ON export_queue(uploaded_at);`,
      },
      {
        sql: `CREATE INDEX IF NOT EXISTS idx_export_queue_drive_file_id ON export_queue(drive_file_id);`,
      },
    ],
  },
  {
    version: 2,
    name: "export-queue",
    statements: [
      {
        sql: `CREATE TABLE IF NOT EXISTS export_queue (
            id TEXT PRIMARY KEY,
            filename TEXT NOT NULL,
            file_path TEXT NOT NULL,
            status TEXT NOT NULL CHECK (status IN ('pending','uploading','completed','failed')),
            created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
            updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
            last_error TEXT NULL
          );`,
      },
      {
        sql: `CREATE INDEX IF NOT EXISTS idx_export_queue_status ON export_queue(status);`,
      },
    ],
  },
  {
    version: 1,
    name: "initial-schema",
    statements: [
      {
        sql: `CREATE TABLE IF NOT EXISTS categories (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL CHECK (LENGTH(name) > 0) UNIQUE,
            created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
            updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
          );`,
      },
      {
        sql: `CREATE TABLE IF NOT EXISTS expenses (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            description TEXT NOT NULL,
            amount_native REAL NOT NULL CHECK (amount_native > 0),
            currency_code TEXT NOT NULL CHECK (LENGTH(currency_code) = 3),
            fx_rate_to_base REAL NOT NULL CHECK (fx_rate_to_base > 0),
            base_amount REAL NOT NULL CHECK (base_amount >= 0),
            date TEXT NOT NULL CHECK (LENGTH(date) = 10),
            category_id INTEGER NULL,
            notes TEXT NULL,
            created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
            updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
            FOREIGN KEY (category_id)
              REFERENCES categories(id)
              ON DELETE SET NULL
              ON UPDATE CASCADE
          );`,
      },
      {
        sql: `CREATE INDEX IF NOT EXISTS idx_expenses_date ON expenses(date DESC);`,
      },
      {
        sql: `CREATE INDEX IF NOT EXISTS idx_expenses_category_id ON expenses(category_id);`,
      },
      {
        sql: `CREATE TABLE IF NOT EXISTS app_settings (
            key TEXT PRIMARY KEY,
            value TEXT
          );`,
      },
    ],
  },
];

const ensureMigrationsTable = async (db: SQLiteDatabase): Promise<void> => {
  await db.executeSql(`
    CREATE TABLE IF NOT EXISTS schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );
  `);
};

const getCurrentVersion = async (db: SQLiteDatabase): Promise<number> => {
  const [result] = await db.executeSql(
    'SELECT MAX(version) as version FROM schema_migrations',
  );
  if (result.rows.length === 0) {
    return 0;
  }
  const row = result.rows.item(0) as { version: number | null };
  return row?.version ?? 0;
};

const runInTransaction = (
  db: SQLiteDatabase,
  executor: (tx: Transaction) => void,
): Promise<void> => {
  return new Promise((resolve, reject) => {
    db.transaction(executor, error => reject(error), () => resolve());
  });
};

const applyMigration = async (
  db: SQLiteDatabase,
  migration: Migration,
): Promise<void> => {
  await runInTransaction(db, tx => {
    migration.statements.forEach(statement => {
      tx.executeSql(statement.sql, statement.args ?? []);
    });
    tx.executeSql(
      'INSERT INTO schema_migrations (version, name) VALUES (?, ?)',
      [migration.version, migration.name],
    );
  });
};

export const runMigrations = async (db: SQLiteDatabase): Promise<void> => {
  await ensureMigrationsTable(db);
  const currentVersion = await getCurrentVersion(db);
  const pending = MIGRATIONS.filter(migration => migration.version > currentVersion).sort(
    (a, b) => a.version - b.version,
  );

  for (const migration of pending) {
    await applyMigration(db, migration);
  }
};

export const latestMigrationVersion = (): number =>
  MIGRATIONS.reduce((version, migration) => Math.max(version, migration.version), 0);
