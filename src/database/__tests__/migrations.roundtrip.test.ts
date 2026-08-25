/**
 * @jest-environment node
 */
import { DatabaseSync } from 'node:sqlite';
import type { SQLiteDatabase } from 'react-native-sqlite-storage';
import { adaptNodeSqlite } from '../../__tests__/test-utils/sqliteAdapter';
import { runMigrations } from '../migrations';
import { seedInitialData } from '../seeding';

/**
 * Runs the real migrations against a real engine, because the mocked suite in
 * `migrations.test.ts` asserts only which statements are issued — it would pass
 * against a rebuild that dropped the table and copied nothing.
 *
 * The engine here is Node's bundled SQLite, which is far newer than the system
 * SQLite on the minimum supported device (3.22 on API 28). A pass proves the
 * migration's logic, not its compatibility with that older engine; `ALTER TABLE
 * ... RENAME TO` in particular changed semantics in 3.25 and stays covered only
 * by the on-device upgrade check in DEPLOY.md.
 */
const adapt = adaptNodeSqlite;

/** The schema as it stood at v9, so the rebuild has real rows to carry across. */
const seedV9 = (db: DatabaseSync): void => {
  db.exec(`CREATE TABLE categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL CHECK (LENGTH(name) > 0) UNIQUE,
    type TEXT NOT NULL DEFAULT 'both' CHECK (type IN ('expense','income','both')),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );`);
  db.exec(`CREATE TABLE transactions (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    type TEXT NOT NULL DEFAULT 'expense' CHECK (type IN ('expense','income')),
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
    notes TEXT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL
  );`);
  db.exec(`CREATE TABLE app_settings (key TEXT PRIMARY KEY, value TEXT);`);
  db.exec(`CREATE TABLE schema_migrations (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );`);
  for (let version = 1; version <= 9; version += 1) {
    db.prepare(
      'INSERT INTO schema_migrations (version, name) VALUES (?, ?)',
    ).run(version, `v${version}`);
  }

  db.exec(`INSERT INTO categories (name, type) VALUES ('Food', 'both');`);
  db.exec(`INSERT INTO transactions
    (type, description, payee, amount_native, currency_code, fx_rate_to_base,
     base_amount, base_currency_code, date, time, category_id, notes)
    VALUES
    ('expense','Coffee','Cafe',3.5,'USD',1,3.5,'USD','2025-01-10','08:30',1,'note'),
    ('income','Salary','Work',1000,'USD',1,1000,'USD','2025-01-01',NULL,NULL,NULL),
    ('expense','Hotel','Hilton',200,'EUR',1.1,220,'USD','2025-02-01','19:00',1,NULL);`);
};

describe('migration v10 against a real SQLite engine', () => {
  let raw: DatabaseSync;
  let db: SQLiteDatabase;

  beforeEach(async () => {
    raw = new DatabaseSync(':memory:');
    raw.exec('PRAGMA foreign_keys = ON');
    seedV9(raw);
    db = adapt(raw);
    await runMigrations(db);
  });

  afterEach(() => {
    raw.close();
  });

  it('carries every row across the rebuild with its values intact', () => {
    const rows = raw
      .prepare('SELECT * FROM transactions ORDER BY id')
      .all() as Record<string, unknown>[];

    expect(rows).toHaveLength(3);
    expect(rows[0]).toMatchObject({
      id: 1,
      type: 'expense',
      description: 'Coffee',
      payee: 'Cafe',
      amount_native: 3.5,
      currency_code: 'USD',
      base_amount: 3.5,
      base_currency_code: 'USD',
      date: '2025-01-10',
      time: '08:30',
      category_id: 1,
      notes: 'note',
    });
    expect(rows[2]).toMatchObject({
      description: 'Hotel',
      currency_code: 'EUR',
      fx_rate_to_base: 1.1,
      base_amount: 220,
    });
  });

  it('backfills every row to the seeded General fund', () => {
    const general = raw
      .prepare("SELECT id FROM funds WHERE name = 'General'")
      .get() as { id: number };
    const distinct = raw
      .prepare('SELECT DISTINCT fund_id FROM transactions')
      .all() as { fund_id: number }[];

    expect(distinct).toEqual([{ fund_id: general.id }]);
  });

  it('recreates every index the rebuild drops', () => {
    const names = (
      raw
        .prepare("SELECT name FROM sqlite_master WHERE type = 'index'")
        .all() as { name: string }[]
    ).map(row => row.name);

    expect(names).toEqual(
      expect.arrayContaining([
        'idx_transactions_date_time',
        'idx_transactions_category_id',
        'idx_transactions_fund_id',
        'idx_transactions_counterpart_fund_id',
      ]),
    );
  });

  it('indexes only transfers on the counterpart column', () => {
    const [{ sql }] = raw
      .prepare(
        "SELECT sql FROM sqlite_master WHERE name = 'idx_transactions_counterpart_fund_id'",
      )
      .all() as { sql: string }[];

    expect(sql).toContain('WHERE counterpart_fund_id IS NOT NULL');
  });

  it('rejects a transfer with no counterpart', () => {
    expect(() =>
      raw.exec(`INSERT INTO transactions
        (type, description, payee, amount_native, currency_code, fx_rate_to_base,
         base_amount, date, fund_id)
        VALUES ('transfer','Move','',50,'USD',1,50,'2025-03-01',1);`),
    ).toThrow(/CHECK constraint failed/);
  });

  it('rejects a transfer whose two funds are the same', () => {
    expect(() =>
      raw.exec(`INSERT INTO transactions
        (type, description, payee, amount_native, currency_code, fx_rate_to_base,
         base_amount, date, fund_id, counterpart_fund_id, counterpart_amount)
        VALUES ('transfer','Move','',50,'USD',1,50,'2025-03-01',1,1,50);`),
    ).toThrow(/CHECK constraint failed/);
  });

  it('rejects counterpart fields on a non-transfer', () => {
    expect(() =>
      raw.exec(`INSERT INTO transactions
        (type, description, payee, amount_native, currency_code, fx_rate_to_base,
         base_amount, date, fund_id, counterpart_fund_id, counterpart_amount)
        VALUES ('expense','Coffee','Cafe',3,'USD',1,3,'2025-03-01',1,2,3);`),
    ).toThrow(/CHECK constraint failed/);
  });

  it('refuses to delete a fund a transaction still references', () => {
    expect(() => raw.exec('DELETE FROM funds WHERE id = 1')).toThrow(
      /FOREIGN KEY constraint failed/,
    );
  });

  it('treats fund names case-insensitively', () => {
    expect(() =>
      raw.exec("INSERT INTO funds (name) VALUES ('general')"),
    ).toThrow(/UNIQUE constraint failed/);
  });

  it('admits a well-formed transfer between two funds', () => {
    raw.exec("INSERT INTO funds (name) VALUES ('Travel')");
    raw.exec(`INSERT INTO transactions
      (type, description, payee, amount_native, currency_code, fx_rate_to_base,
       base_amount, base_currency_code, date, fund_id, counterpart_fund_id,
       counterpart_amount, counterpart_currency_code)
      VALUES ('transfer','','',100,'GBP',1,100,'GBP','2025-03-01',1,2,117,'EUR');`);

    const row = raw
      .prepare("SELECT * FROM transactions WHERE type = 'transfer'")
      .get() as Record<string, unknown>;

    expect(row).toMatchObject({
      fund_id: 1,
      counterpart_fund_id: 2,
      counterpart_amount: 117,
      counterpart_currency_code: 'EUR',
    });
  });

  it('reports the schema at version 11', () => {
    const [{ version }] = raw
      .prepare('SELECT MAX(version) AS version FROM schema_migrations')
      .all() as { version: number }[];

    expect(version).toBe(11);
  });
});

/**
 * The schema as it stood at v10, whose CHECK admits a transfer carrying no
 * counterpart currency. `baseCurrency` is the value of the `base_currency`
 * setting, and may be null — the placeholder seeding writes for a user who has
 * never chosen one.
 */
const seedV10 = (db: DatabaseSync, baseCurrency: string | null): void => {
  db.exec(`CREATE TABLE categories (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL CHECK (LENGTH(name) > 0) UNIQUE,
    type TEXT NOT NULL DEFAULT 'both' CHECK (type IN ('expense','income','both')),
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );`);
  db.exec(`CREATE TABLE funds (
    id INTEGER PRIMARY KEY AUTOINCREMENT,
    name TEXT NOT NULL UNIQUE COLLATE NOCASE CHECK (LENGTH(name) > 0),
    currency_code TEXT NULL CHECK (currency_code IS NULL OR LENGTH(currency_code) = 3),
    opening_balance REAL NOT NULL DEFAULT 0,
    notes TEXT NULL,
    created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
    updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );`);
  db.exec(`CREATE TABLE transactions (
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
    FOREIGN KEY (category_id) REFERENCES categories(id) ON DELETE SET NULL,
    FOREIGN KEY (fund_id) REFERENCES funds(id) ON DELETE RESTRICT,
    FOREIGN KEY (counterpart_fund_id) REFERENCES funds(id) ON DELETE RESTRICT
  );`);
  db.exec(`CREATE TABLE app_settings (key TEXT PRIMARY KEY, value TEXT);`);
  db.exec(`CREATE TABLE schema_migrations (
    version INTEGER PRIMARY KEY,
    name TEXT NOT NULL,
    applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
  );`);
  for (let version = 1; version <= 10; version += 1) {
    db.prepare(
      'INSERT INTO schema_migrations (version, name) VALUES (?, ?)',
    ).run(version, `v${version}`);
  }

  db.prepare('INSERT INTO app_settings (key, value) VALUES (?, ?)').run(
    'base_currency',
    baseCurrency,
  );
  db.exec(`INSERT INTO categories (name, type) VALUES ('Food', 'both');`);
  db.exec(`INSERT INTO funds (name, currency_code) VALUES
    ('General', NULL), ('Travel', 'EUR'), ('Pocket', NULL);`);
  db.exec(`INSERT INTO transactions
    (type, description, payee, amount_native, currency_code, fx_rate_to_base,
     base_amount, base_currency_code, date, time, category_id, fund_id,
     counterpart_fund_id, counterpart_amount, counterpart_currency_code, notes)
    VALUES
    ('expense','Coffee','Cafe',3.5,'MYR',1,3.5,'MYR','2025-01-10','08:30',1,1,NULL,NULL,NULL,'note'),
    ('transfer','','',1000,'MYR',1,1000,'MYR','2025-02-01',NULL,NULL,1,2,1000,NULL,NULL),
    ('transfer','','',500,'MYR',1,500,'MYR','2025-02-02',NULL,NULL,1,3,500,NULL,NULL),
    ('transfer','','',100,'MYR',1,100,'MYR','2025-02-03',NULL,NULL,1,2,20,'GBP',NULL);`);
};

describe('migration v11 against a real SQLite engine', () => {
  let raw: DatabaseSync;

  const migrateFromV10 = async (baseCurrency: string | null): Promise<void> => {
    raw = new DatabaseSync(':memory:');
    raw.exec('PRAGMA foreign_keys = ON');
    seedV10(raw, baseCurrency);
    await runMigrations(adapt(raw));
  };

  const transfers = (): Record<string, unknown>[] =>
    raw
      .prepare("SELECT * FROM transactions WHERE type = 'transfer' ORDER BY id")
      .all() as Record<string, unknown>[];

  afterEach(() => {
    raw.close();
  });

  it('carries every row across the rebuild', async () => {
    await migrateFromV10('MYR');

    const rows = raw
      .prepare('SELECT * FROM transactions ORDER BY id')
      .all() as Record<string, unknown>[];

    expect(rows).toHaveLength(4);
    expect(rows[0]).toMatchObject({
      id: 1,
      type: 'expense',
      description: 'Coffee',
      payee: 'Cafe',
      amount_native: 3.5,
      currency_code: 'MYR',
      base_amount: 3.5,
      date: '2025-01-10',
      time: '08:30',
      category_id: 1,
      fund_id: 1,
      notes: 'note',
    });
  });

  it('backfills an unlabelled transfer from the destination fund', async () => {
    await migrateFromV10('MYR');

    expect(transfers()[0]).toMatchObject({
      counterpart_fund_id: 2,
      counterpart_amount: 1000,
      counterpart_currency_code: 'EUR',
    });
  });

  it('falls back to the base currency when the destination fund holds none', async () => {
    await migrateFromV10('SGD');

    expect(transfers()[1]).toMatchObject({
      counterpart_fund_id: 3,
      counterpart_currency_code: 'SGD',
    });
  });

  it('falls back to the row s own currency when no base currency is set', async () => {
    await migrateFromV10(null);

    expect(transfers()[1]).toMatchObject({
      counterpart_fund_id: 3,
      counterpart_currency_code: 'MYR',
    });
  });

  it('never overwrites a currency the transfer already carried', async () => {
    await migrateFromV10('MYR');

    expect(transfers()[2]).toMatchObject({
      counterpart_amount: 20,
      counterpart_currency_code: 'GBP',
    });
  });

  it('leaves a non-transfer with no counterpart currency', async () => {
    await migrateFromV10(null);

    const [row] = raw
      .prepare("SELECT * FROM transactions WHERE type = 'expense'")
      .all() as Record<string, unknown>[];

    expect(row.counterpart_currency_code).toBeNull();
  });

  it('rejects a transfer carrying no counterpart currency', async () => {
    await migrateFromV10('MYR');

    expect(() =>
      raw.exec(`INSERT INTO transactions
        (type, description, payee, amount_native, currency_code, fx_rate_to_base,
         base_amount, date, fund_id, counterpart_fund_id, counterpart_amount)
        VALUES ('transfer','','',50,'MYR',1,50,'2025-03-01',1,2,10);`),
    ).toThrow(/CHECK constraint failed/);
  });

  it('rejects a counterpart currency on a non-transfer', async () => {
    await migrateFromV10('MYR');

    expect(() =>
      raw.exec(`INSERT INTO transactions
        (type, description, payee, amount_native, currency_code, fx_rate_to_base,
         base_amount, date, fund_id, counterpart_currency_code)
        VALUES ('expense','Coffee','Cafe',3,'MYR',1,3,'2025-03-01',1,'EUR');`),
    ).toThrow(/CHECK constraint failed/);
  });

  it('recreates every index the rebuild drops', async () => {
    await migrateFromV10('MYR');

    const names = (
      raw
        .prepare("SELECT name FROM sqlite_master WHERE type = 'index'")
        .all() as { name: string }[]
    ).map(row => row.name);

    expect(names).toEqual(
      expect.arrayContaining([
        'idx_transactions_date_time',
        'idx_transactions_category_id',
        'idx_transactions_fund_id',
        'idx_transactions_counterpart_fund_id',
      ]),
    );
  });

  it('keeps the counterpart index partial', async () => {
    await migrateFromV10('MYR');

    const [{ sql }] = raw
      .prepare(
        "SELECT sql FROM sqlite_master WHERE name = 'idx_transactions_counterpart_fund_id'",
      )
      .all() as { sql: string }[];

    expect(sql).toContain('WHERE counterpart_fund_id IS NOT NULL');
  });
});

describe('seeding the default fund against a real SQLite engine', () => {
  let raw: DatabaseSync;
  let db: SQLiteDatabase;

  const fundCount = (): number =>
    (
      raw.prepare('SELECT COUNT(*) AS count FROM funds').all() as {
        count: number;
      }[]
    )[0].count;

  beforeEach(async () => {
    raw = new DatabaseSync(':memory:');
    raw.exec('PRAGMA foreign_keys = ON');
    seedV9(raw);
    db = adapt(raw);
    await runMigrations(db);
  });

  afterEach(() => {
    raw.close();
  });

  it('leaves the fund the migration already inserted alone', async () => {
    await seedInitialData(db);

    expect(fundCount()).toBe(1);
  });

  it('restores a fallback fund for an emptied table', async () => {
    raw.exec('DELETE FROM transactions');
    raw.exec('DELETE FROM funds');

    await seedInitialData(db);

    expect(fundCount()).toBe(1);
  });

  it('leaves a transaction insertable once the fallback is restored', async () => {
    raw.exec('DELETE FROM transactions');
    raw.exec('DELETE FROM funds');
    await seedInitialData(db);

    const [{ id }] = raw.prepare('SELECT id FROM funds').all() as {
      id: number;
    }[];
    raw
      .prepare(
        `INSERT INTO transactions
          (type, description, payee, amount_native, currency_code,
           fx_rate_to_base, base_amount, base_currency_code, date, fund_id)
         VALUES ('expense','Tea','Cafe',2,'USD',1,2,'USD','2025-03-01',?)`,
      )
      .run(id);

    expect(
      (
        raw.prepare('SELECT COUNT(*) AS count FROM transactions').all() as {
          count: number;
        }[]
      )[0].count,
    ).toBe(1);
  });
});
