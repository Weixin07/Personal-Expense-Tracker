import type { SQLiteDatabase, Transaction } from 'react-native-sqlite-storage';

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
    version: 12,
    name: 'transaction-confirmed-flag',
    statements: [
      // The default applies to every existing row as the column is added, so a
      // ledger recorded before the flag existed reads back confirmed.
      {
        sql: `ALTER TABLE transactions ADD COLUMN is_confirmed INTEGER NOT NULL DEFAULT 1 CHECK (is_confirmed IN (0,1));`,
      },
    ],
  },
  {
    version: 11,
    name: 'transfer-counterpart-currency-required',
    statements: [
      // Same rebuild procedure as v10, and for the same reason: SQLite cannot
      // alter a CHECK constraint. See sqlite.org/lang_altertable.html#otherALTER.
      {
        sql: `CREATE TABLE transactions_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            type TEXT NOT NULL DEFAULT 'expense' CHECK (type IN ('expense','income','transfer')),
            description TEXT NOT NULL,
            payee TEXT NOT NULL DEFAULT 'Unknown',
            amount_native REAL NOT NULL CHECK (amount_native > 0),
            currency_code TEXT NOT NULL CHECK (LENGTH(currency_code) = 3),
            fx_rate_to_base REAL NOT NULL CHECK (fx_rate_to_base > 0),
            base_amount REAL NOT NULL CHECK (base_amount >= 0),
            base_currency_code TEXT NULL,
            date TEXT NOT NULL CHECK (LENGTH(date) = 10),
            time TEXT NULL CHECK (time IS NULL OR LENGTH(time) = 5),
            category_id INTEGER NULL,
            fund_id INTEGER NOT NULL,
            counterpart_fund_id INTEGER NULL,
            counterpart_amount REAL NULL CHECK (counterpart_amount IS NULL OR counterpart_amount > 0),
            counterpart_currency_code TEXT NULL CHECK (counterpart_currency_code IS NULL OR LENGTH(counterpart_currency_code) = 3),
            notes TEXT NULL,
            created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
            updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
            CHECK (
              (type = 'transfer'
                AND counterpart_fund_id IS NOT NULL
                AND counterpart_amount IS NOT NULL
                AND counterpart_currency_code IS NOT NULL
                AND counterpart_fund_id <> fund_id)
              OR
              (type <> 'transfer'
                AND counterpart_fund_id IS NULL
                AND counterpart_amount IS NULL
                AND counterpart_currency_code IS NULL)
            ),
            FOREIGN KEY (category_id)
              REFERENCES categories(id)
              ON DELETE SET NULL
              ON UPDATE CASCADE,
            FOREIGN KEY (fund_id)
              REFERENCES funds(id)
              ON DELETE RESTRICT
              ON UPDATE CASCADE,
            FOREIGN KEY (counterpart_fund_id)
              REFERENCES funds(id)
              ON DELETE RESTRICT
              ON UPDATE CASCADE
          );`,
      },
      // The currency is resolved during the copy rather than by a later UPDATE:
      // the CHECK is evaluated per inserted row, so a transfer missing one would
      // be rejected before an UPDATE could supply it.
      //
      // The last fallback is the row's own currency_code, which is NOT NULL and
      // so makes the expression total. A base currency the user never set is
      // stored as NULL, and a fund may hold no currency of its own, so the two
      // preceding levels can both yield nothing — and a NULL here would fail the
      // CHECK and leave the database unopenable.
      {
        sql: `INSERT INTO transactions_new (
            id, type, description, payee, amount_native, currency_code,
            fx_rate_to_base, base_amount, base_currency_code, date, time,
            category_id, fund_id, counterpart_fund_id, counterpart_amount,
            counterpart_currency_code, notes, created_at, updated_at
          )
          SELECT
            id, type, description, payee, amount_native, currency_code,
            fx_rate_to_base, base_amount, base_currency_code, date, time,
            category_id, fund_id, counterpart_fund_id, counterpart_amount,
            CASE WHEN type = 'transfer' THEN COALESCE(
              counterpart_currency_code,
              (SELECT f.currency_code FROM funds f WHERE f.id = transactions.counterpart_fund_id),
              (SELECT value FROM app_settings WHERE key = 'base_currency'),
              currency_code
            ) ELSE NULL END,
            notes, created_at, updated_at
          FROM transactions;`,
      },
      {
        sql: `DROP TABLE transactions;`,
      },
      {
        sql: `ALTER TABLE transactions_new RENAME TO transactions;`,
      },
      {
        sql: `CREATE INDEX IF NOT EXISTS idx_transactions_date_time ON transactions(date DESC, time DESC);`,
      },
      {
        sql: `CREATE INDEX IF NOT EXISTS idx_transactions_category_id ON transactions(category_id);`,
      },
      {
        sql: `CREATE INDEX IF NOT EXISTS idx_transactions_fund_id ON transactions(fund_id);`,
      },
      {
        sql: `CREATE INDEX IF NOT EXISTS idx_transactions_counterpart_fund_id ON transactions(counterpart_fund_id) WHERE counterpart_fund_id IS NOT NULL;`,
      },
    ],
  },
  {
    version: 10,
    name: 'funds-and-transfers',
    statements: [
      {
        sql: `CREATE TABLE IF NOT EXISTS funds (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE COLLATE NOCASE CHECK (LENGTH(name) > 0),
            currency_code TEXT NULL CHECK (currency_code IS NULL OR LENGTH(currency_code) = 3),
            opening_balance REAL NOT NULL DEFAULT 0,
            notes TEXT NULL,
            created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
            updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
          );`,
      },
      {
        sql: `INSERT INTO funds (name) VALUES ('General');`,
      },
      // SQLite cannot alter a CHECK constraint, and `type` carries one from v8,
      // so admitting 'transfer' means rebuilding the table. This follows the
      // procedure at sqlite.org/lang_altertable.html#otherALTER. The rebuild is
      // safe with foreign keys enforced because no table references
      // transactions(id) — it is only ever a child.
      {
        sql: `CREATE TABLE transactions_new (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            type TEXT NOT NULL DEFAULT 'expense' CHECK (type IN ('expense','income','transfer')),
            description TEXT NOT NULL,
            payee TEXT NOT NULL DEFAULT 'Unknown',
            amount_native REAL NOT NULL CHECK (amount_native > 0),
            currency_code TEXT NOT NULL CHECK (LENGTH(currency_code) = 3),
            fx_rate_to_base REAL NOT NULL CHECK (fx_rate_to_base > 0),
            base_amount REAL NOT NULL CHECK (base_amount >= 0),
            base_currency_code TEXT NULL,
            date TEXT NOT NULL CHECK (LENGTH(date) = 10),
            time TEXT NULL CHECK (time IS NULL OR LENGTH(time) = 5),
            category_id INTEGER NULL,
            fund_id INTEGER NOT NULL,
            counterpart_fund_id INTEGER NULL,
            counterpart_amount REAL NULL CHECK (counterpart_amount IS NULL OR counterpart_amount > 0),
            counterpart_currency_code TEXT NULL CHECK (counterpart_currency_code IS NULL OR LENGTH(counterpart_currency_code) = 3),
            notes TEXT NULL,
            created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
            updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
            CHECK (
              (type = 'transfer'
                AND counterpart_fund_id IS NOT NULL
                AND counterpart_amount IS NOT NULL
                AND counterpart_fund_id <> fund_id)
              OR
              (type <> 'transfer'
                AND counterpart_fund_id IS NULL
                AND counterpart_amount IS NULL)
            ),
            FOREIGN KEY (category_id)
              REFERENCES categories(id)
              ON DELETE SET NULL
              ON UPDATE CASCADE,
            FOREIGN KEY (fund_id)
              REFERENCES funds(id)
              ON DELETE RESTRICT
              ON UPDATE CASCADE,
            FOREIGN KEY (counterpart_fund_id)
              REFERENCES funds(id)
              ON DELETE RESTRICT
              ON UPDATE CASCADE
          );`,
      },
      // The default fund is addressed by name because MigrationStatement has no
      // way to read back the id the insert above generated.
      {
        sql: `INSERT INTO transactions_new (
            id, type, description, payee, amount_native, currency_code,
            fx_rate_to_base, base_amount, base_currency_code, date, time,
            category_id, fund_id, counterpart_fund_id, counterpart_amount,
            counterpart_currency_code, notes, created_at, updated_at
          )
          SELECT
            id, type, description, payee, amount_native, currency_code,
            fx_rate_to_base, base_amount, base_currency_code, date, time,
            category_id, (SELECT id FROM funds WHERE name = 'General'),
            NULL, NULL, NULL, notes, created_at, updated_at
          FROM transactions;`,
      },
      {
        sql: `DROP TABLE transactions;`,
      },
      {
        sql: `ALTER TABLE transactions_new RENAME TO transactions;`,
      },
      // The rebuild drops the table's indexes; the ones it carried are
      // recreated here alongside those the new columns need.
      {
        sql: `CREATE INDEX IF NOT EXISTS idx_transactions_date_time ON transactions(date DESC, time DESC);`,
      },
      {
        sql: `CREATE INDEX IF NOT EXISTS idx_transactions_category_id ON transactions(category_id);`,
      },
      {
        sql: `CREATE INDEX IF NOT EXISTS idx_transactions_fund_id ON transactions(fund_id);`,
      },
      {
        // Partial: the column is NULL on every non-transfer row, so a full
        // index would carry an entry per row to serve a small minority of them.
        sql: `CREATE INDEX IF NOT EXISTS idx_transactions_counterpart_fund_id ON transactions(counterpart_fund_id) WHERE counterpart_fund_id IS NOT NULL;`,
      },
    ],
  },
  {
    version: 9,
    name: 'add-transaction-time',
    statements: [
      {
        sql: `ALTER TABLE transactions ADD COLUMN time TEXT NULL CHECK (time IS NULL OR LENGTH(time) = 5);`,
      },
      {
        sql: `DROP INDEX IF EXISTS idx_transactions_date;`,
      },
      {
        sql: `CREATE INDEX IF NOT EXISTS idx_transactions_date_time ON transactions(date DESC, time DESC);`,
      },
    ],
  },
  {
    version: 8,
    name: 'transaction-and-category-type',
    statements: [
      {
        sql: `ALTER TABLE transactions ADD COLUMN type TEXT NOT NULL DEFAULT 'expense' CHECK (type IN ('expense','income'));`,
      },
      {
        sql: `ALTER TABLE categories ADD COLUMN type TEXT NOT NULL DEFAULT 'both' CHECK (type IN ('expense','income','both'));`,
      },
    ],
  },
  {
    version: 7,
    name: 'rename-expenses-to-transactions',
    statements: [
      {
        sql: `ALTER TABLE expenses RENAME TO transactions;`,
      },
      {
        sql: `DROP INDEX IF EXISTS idx_expenses_date;`,
      },
      {
        sql: `DROP INDEX IF EXISTS idx_expenses_category_id;`,
      },
      {
        sql: `CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date DESC);`,
      },
      {
        sql: `CREATE INDEX IF NOT EXISTS idx_transactions_category_id ON transactions(category_id);`,
      },
    ],
  },
  {
    version: 6,
    name: 'expense-payee',
    statements: [
      {
        sql: `ALTER TABLE expenses ADD COLUMN payee TEXT NOT NULL DEFAULT 'Unknown';`,
      },
    ],
  },
  {
    version: 5,
    name: 'expense-base-currency-and-fx-cache',
    statements: [
      {
        sql: `ALTER TABLE expenses ADD COLUMN base_currency_code TEXT NULL;`,
      },
      {
        sql: `UPDATE expenses
            SET base_currency_code = (
              SELECT value FROM app_settings WHERE key = 'base_currency'
            )
            WHERE base_currency_code IS NULL;`,
      },
      {
        sql: `CREATE TABLE IF NOT EXISTS currency_fx_rates (
            base_currency_code TEXT NOT NULL CHECK (LENGTH(base_currency_code) = 3),
            currency_code TEXT NOT NULL CHECK (LENGTH(currency_code) = 3),
            fx_rate_to_base REAL NOT NULL CHECK (fx_rate_to_base > 0),
            updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
            PRIMARY KEY (base_currency_code, currency_code)
          );`,
      },
    ],
  },
  {
    version: 4,
    name: 'export-queue-file-uri',
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
    name: 'export-queue-metadata',
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
    name: 'export-queue',
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
    name: 'initial-schema',
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
    db.transaction(
      executor,
      error => reject(error),
      () => resolve(),
    );
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
  const pending = MIGRATIONS.filter(
    migration => migration.version > currentVersion,
  ).sort((a, b) => a.version - b.version);

  for (const migration of pending) {
    await applyMigration(db, migration);
  }
};

export const latestMigrationVersion = (): number =>
  MIGRATIONS.reduce(
    (version, migration) => Math.max(version, migration.version),
    0,
  );
