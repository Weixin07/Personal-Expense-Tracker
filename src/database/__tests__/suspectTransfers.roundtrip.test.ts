/**
 * @jest-environment node
 */
import { DatabaseSync } from 'node:sqlite';
import type { SQLiteDatabase } from 'react-native-sqlite-storage';
import { adaptNodeSqlite } from '../../__tests__/test-utils/sqliteAdapter';
import { runMigrations } from '../migrations';
import {
  listTransactions,
  updateTransaction,
} from '../repositories/transactionsRepository';
import { listFunds } from '../repositories/fundsRepository';
import { isSuspectTransferRate } from '../../utils/fxRates';
import { resolveTransferCurrency } from '../../utils/funds';

/**
 * The upgrade path for a transfer recorded before a received amount had to be
 * converted: it must survive the migration, be identifiable afterwards, and
 * stop being identifiable once corrected.
 */
describe('a transfer recorded across two currencies at parity', () => {
  let raw: DatabaseSync;
  let db: SQLiteDatabase;

  /** A v10 ledger holding MYR 1000 moved into a fund denominated in euro. */
  const seedV10 = (): void => {
    raw.exec(`CREATE TABLE categories (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL CHECK (LENGTH(name) > 0) UNIQUE,
      type TEXT NOT NULL DEFAULT 'both' CHECK (type IN ('expense','income','both')),
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );`);
    raw.exec(`CREATE TABLE funds (
      id INTEGER PRIMARY KEY AUTOINCREMENT,
      name TEXT NOT NULL UNIQUE COLLATE NOCASE CHECK (LENGTH(name) > 0),
      currency_code TEXT NULL CHECK (currency_code IS NULL OR LENGTH(currency_code) = 3),
      opening_balance REAL NOT NULL DEFAULT 0,
      notes TEXT NULL,
      created_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
      updated_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );`);
    raw.exec(`CREATE TABLE transactions (
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
    raw.exec(`CREATE TABLE app_settings (key TEXT PRIMARY KEY, value TEXT);`);
    raw.exec(`CREATE TABLE schema_migrations (
      version INTEGER PRIMARY KEY,
      name TEXT NOT NULL,
      applied_at TEXT NOT NULL DEFAULT (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    );`);
    for (let version = 1; version <= 10; version += 1) {
      raw
        .prepare('INSERT INTO schema_migrations (version, name) VALUES (?, ?)')
        .run(version, `v${version}`);
    }
    raw
      .prepare('INSERT INTO app_settings (key, value) VALUES (?, ?)')
      .run('base_currency', 'MYR');
    raw.exec(`INSERT INTO funds (name, currency_code) VALUES
      ('General', NULL), ('Euro trip', 'EUR');`);
    raw.exec(`INSERT INTO transactions
      (type, description, payee, amount_native, currency_code, fx_rate_to_base,
       base_amount, base_currency_code, date, fund_id, counterpart_fund_id,
       counterpart_amount, counterpart_currency_code)
      VALUES ('transfer','','',1000,'MYR',1,1000,'MYR','2025-02-01',1,2,1000,NULL);`);
  };

  const suspect = async (): Promise<boolean> => {
    const [stored] = await listTransactions(db, { type: 'transfer' });
    const funds = await listFunds(db);
    const destination =
      funds.find(fund => fund.id === stored.counterpartFundId) ?? null;
    return isSuspectTransferRate({
      amountNative: stored.amountNative,
      counterpartAmount: stored.counterpartAmount,
      currencyCode: stored.currencyCode,
      counterpartCurrencyCode: resolveTransferCurrency(
        stored.counterpartCurrencyCode,
        destination,
        'MYR',
        stored.currencyCode,
      ),
    });
  };

  beforeEach(async () => {
    raw = new DatabaseSync(':memory:');
    raw.exec('PRAGMA foreign_keys = ON');
    seedV10();
    db = adaptNodeSqlite(raw);
    await runMigrations(db);
  });

  afterEach(() => {
    raw.close();
  });

  it('survives the upgrade carrying the destination fund currency', async () => {
    const [stored] = await listTransactions(db, { type: 'transfer' });

    expect(stored.amountNative).toBe(1000);
    expect(stored.currencyCode).toBe('MYR');
    expect(stored.counterpartAmount).toBe(1000);
    expect(stored.counterpartCurrencyCode).toBe('EUR');
  });

  it('is identifiable as needing review once upgraded', async () => {
    await expect(suspect()).resolves.toBe(true);
  });

  it('stops needing review once the received amount is corrected', async () => {
    const [stored] = await listTransactions(db, { type: 'transfer' });

    await updateTransaction(db, { ...stored, counterpartAmount: 195 });

    await expect(suspect()).resolves.toBe(false);
  });
});
