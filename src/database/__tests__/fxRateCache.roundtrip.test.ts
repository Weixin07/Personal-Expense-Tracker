/**
 * @jest-environment node
 */
import { DatabaseSync } from 'node:sqlite';
import type { SQLiteDatabase } from 'react-native-sqlite-storage';
import { adaptNodeSqlite } from '../../__tests__/test-utils/sqliteAdapter';
import { runMigrations } from '../migrations';
import { seedInitialData } from '../seeding';
import { createTransaction } from '../repositories/transactionsRepository';
import { createFund } from '../repositories/fundsRepository';
import {
  getCurrencyFxRate,
  listCurrencyFxRates,
  upsertCurrencyFxRate,
} from '../repositories/currencyFxRatesRepository';
import { convertToCurrency, ratesForTransaction } from '../../utils/fxRates';
import type { NewTransactionRecord } from '../types';

/**
 * The context suite mocks the driver, so it can show which rates were offered
 * to the repository but not what the column keeps or what a second write to the
 * same pair does to the first. These run the real repository against a real
 * engine carrying the v11 schema.
 */
describe('the rates a saved transaction leaves behind', () => {
  let raw: DatabaseSync;
  let db: SQLiteDatabase;
  let euroPotId: number;
  let euroSavingsId: number;
  let yenPotId: number;
  let dongPotId: number;

  const transfer = (
    overrides: Partial<NewTransactionRecord> = {},
  ): NewTransactionRecord => ({
    type: 'transfer',
    description: '',
    payee: '',
    amountNative: 100,
    currencyCode: 'EUR',
    fxRateToBase: 5,
    baseAmount: 500,
    baseCurrencyCode: 'MYR',
    date: '2025-02-01',
    time: null,
    categoryId: null,
    fundId: euroPotId,
    counterpartFundId: yenPotId,
    counterpartAmount: 17000,
    counterpartCurrencyCode: 'JPY',
    notes: null,
    ...overrides,
  });

  /** The write sequence `createTransaction` performs, against a real engine. */
  const save = async (payload: NewTransactionRecord) => {
    const created = await createTransaction(db, payload);
    for (const rate of ratesForTransaction(created)) {
      await upsertCurrencyFxRate(
        db,
        rate.baseCurrencyCode,
        rate.currencyCode,
        rate.fxRateToBase,
      );
    }
    return created;
  };

  beforeEach(async () => {
    raw = new DatabaseSync(':memory:');
    raw.exec('PRAGMA foreign_keys = ON');
    db = adaptNodeSqlite(raw);
    await runMigrations(db);
    await seedInitialData(db);
    const pot = (name: string, currencyCode: string) =>
      createFund(db, { name, currencyCode, openingBalance: 0, notes: null });
    euroPotId = (await pot('Euro pot', 'EUR')).id;
    euroSavingsId = (await pot('Euro savings', 'EUR')).id;
    yenPotId = (await pot('Yen pot', 'JPY')).id;
    dongPotId = (await pot('Dong pot', 'VND')).id;
  });

  afterEach(() => {
    raw.close();
  });

  it('writes nothing for a transaction already in the base currency', async () => {
    await save(
      transfer({
        type: 'expense',
        description: 'Coffee',
        payee: 'Cafe',
        currencyCode: 'MYR',
        fxRateToBase: 1,
        amountNative: 500,
        fundId: euroPotId,
        counterpartFundId: null,
        counterpartAmount: null,
        counterpartCurrencyCode: null,
      }),
    );

    expect(await listCurrencyFxRates(db)).toEqual([]);
  });

  it('writes both legs of a cross-currency transfer', async () => {
    await save(transfer());

    const stored = (await listCurrencyFxRates(db)).map(item => [
      item.currencyCode,
      item.fxRateToBase,
    ]);
    expect(stored).toEqual([
      ['EUR', 5],
      ['JPY', 500 / 17000],
    ]);
  });

  it('keeps a derived rate exactly enough to return the amount received', async () => {
    await save(
      transfer({
        amountNative: 50,
        baseAmount: 250,
        counterpartFundId: dongPotId,
        counterpartAmount: 1450000,
        counterpartCurrencyCode: 'VND',
      }),
    );

    const stored = await getCurrencyFxRate(db, 'MYR', 'VND');
    expect(convertToCurrency(250, 'VND', 'MYR', [stored!])).toBe(1450000);
  });

  it('leaves the source leg standing when a same-currency transfer loses a fee', async () => {
    await save(transfer());

    await save(
      transfer({
        date: '2025-02-02',
        counterpartFundId: euroSavingsId,
        counterpartAmount: 98,
        counterpartCurrencyCode: 'EUR',
      }),
    );

    expect((await getCurrencyFxRate(db, 'MYR', 'EUR'))?.fxRateToBase).toBe(5);
  });

  it('refreshes both legs when a stored transfer is corrected', async () => {
    const created = await save(transfer());

    for (const rate of ratesForTransaction({
      ...created,
      counterpartAmount: 16000,
    })) {
      await upsertCurrencyFxRate(
        db,
        rate.baseCurrencyCode,
        rate.currencyCode,
        rate.fxRateToBase,
      );
    }

    expect((await getCurrencyFxRate(db, 'MYR', 'JPY'))?.fxRateToBase).toBe(
      500 / 16000,
    );
  });
});
