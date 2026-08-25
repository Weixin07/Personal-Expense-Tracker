/**
 * @jest-environment node
 */
import { DatabaseSync } from 'node:sqlite';
import type { SQLiteDatabase } from 'react-native-sqlite-storage';
import { adaptNodeSqlite } from '../../__tests__/test-utils/sqliteAdapter';
import { runMigrations } from '../migrations';
import { seedInitialData } from '../seeding';
import {
  createTransaction,
  createTransactionsBulk,
  updateTransaction,
} from '../repositories/transactionsRepository';
import { createFund } from '../repositories/fundsRepository';
import type { NewTransactionRecord } from '../types';

/**
 * The repository suite mocks the driver, so it cannot show whether the SQL it
 * builds satisfies the schema it writes into. These run the real repository
 * against a real engine carrying the v11 CHECK.
 */
describe('the transfer invariant against a real SQLite engine', () => {
  let raw: DatabaseSync;
  let db: SQLiteDatabase;

  const transfer = (
    overrides: Partial<NewTransactionRecord> = {},
  ): NewTransactionRecord => ({
    type: 'transfer',
    description: '',
    payee: '',
    amountNative: 1000,
    currencyCode: 'MYR',
    fxRateToBase: 1,
    baseAmount: 1000,
    baseCurrencyCode: 'MYR',
    date: '2025-02-01',
    time: null,
    categoryId: null,
    fundId: 1,
    counterpartFundId: 2,
    counterpartAmount: 195,
    counterpartCurrencyCode: 'EUR',
    notes: null,
    ...overrides,
  });

  beforeEach(async () => {
    raw = new DatabaseSync(':memory:');
    raw.exec('PRAGMA foreign_keys = ON');
    db = adaptNodeSqlite(raw);
    await runMigrations(db);
    await seedInitialData(db);
    await createFund(db, {
      name: 'Travel',
      currencyCode: 'EUR',
      openingBalance: 0,
      notes: null,
    });
  });

  afterEach(() => {
    raw.close();
  });

  it('writes a well-formed transfer through the repository', async () => {
    const created = await createTransaction(db, transfer());

    expect(created.counterpartAmount).toBe(195);
    expect(created.counterpartCurrencyCode).toBe('EUR');
  });

  it('writes a well-formed transfer through the bulk path the import uses', async () => {
    const inserted = await createTransactionsBulk(db, [transfer()]);

    expect(inserted).toBe(1);
    const [row] = raw
      .prepare("SELECT * FROM transactions WHERE type = 'transfer'")
      .all() as Record<string, unknown>[];
    expect(row.counterpart_currency_code).toBe('EUR');
  });

  it('refuses a transfer the caller left with no received currency', async () => {
    await expect(
      createTransactionsBulk(db, [transfer({ counterpartCurrencyCode: null })]),
    ).rejects.toThrow(/CHECK constraint failed/);
  });

  it('writes a non-transfer with all three counterpart columns empty', async () => {
    const created = await createTransaction(
      db,
      transfer({
        type: 'expense',
        description: 'Coffee',
        payee: 'Cafe',
        counterpartFundId: null,
        counterpartAmount: null,
        counterpartCurrencyCode: null,
      }),
    );

    expect(created.counterpartCurrencyCode).toBeNull();
  });

  it('clears every counterpart column when a transfer becomes an expense', async () => {
    const created = await createTransaction(db, transfer());

    const updated = await updateTransaction(db, {
      ...created,
      type: 'expense',
      description: 'Coffee',
      payee: 'Cafe',
      counterpartFundId: null,
      counterpartAmount: null,
      counterpartCurrencyCode: null,
    });

    expect(updated.type).toBe('expense');
    expect(updated.counterpartCurrencyCode).toBeNull();
  });
});
