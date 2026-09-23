/**
 * @jest-environment node
 */
import { DatabaseSync } from 'node:sqlite';
import type { SQLiteDatabase } from 'react-native-sqlite-storage';
import { adaptNodeSqlite } from '../../../__tests__/test-utils/sqliteAdapter';
import {
  AS_OF_EXPECTATIONS,
  AS_OF_SERIES,
} from '../../../__tests__/test-utils/fxRateFixtures';
import { runMigrations } from '../../migrations';
import {
  getCurrencyFxRate,
  getCurrencyFxRateAsOf,
  listCurrencyFxRates,
  upsertCurrencyFxRate,
} from '../currencyFxRatesRepository';

describe('currencyFxRatesRepository', () => {
  let raw: DatabaseSync;
  let db: SQLiteDatabase;

  const save = (
    rate: number,
    effectiveDate: string,
    confirmedAt: string,
    currencyCode = 'EUR',
  ) =>
    upsertCurrencyFxRate(
      db,
      'MYR',
      currencyCode,
      rate,
      effectiveDate,
      confirmedAt,
    );

  beforeEach(async () => {
    raw = new DatabaseSync(':memory:');
    db = adaptNodeSqlite(raw);
    await runMigrations(db);
  });

  afterEach(() => {
    raw.close();
  });

  describe('upsertCurrencyFxRate', () => {
    it('stores every column it is given, without the ON CONFLICT form API 28 lacks', async () => {
      const spy = jest.spyOn(db, 'executeSql');
      await save(4.9, '2026-08-10', '2026-08-10T09:00:00.000Z');

      expect(spy).toHaveBeenCalledWith(
        expect.stringContaining('INSERT OR REPLACE INTO currency_fx_rates'),
        ['MYR', 'EUR', '2026-08-10', 4.9, '2026-08-10T09:00:00.000Z'],
      );
      expect(spy).not.toHaveBeenCalledWith(
        expect.stringContaining('ON CONFLICT'),
        expect.anything(),
      );
      expect(await listCurrencyFxRates(db)).toEqual([
        {
          baseCurrencyCode: 'MYR',
          currencyCode: 'EUR',
          fxRateToBase: 4.9,
          effectiveDate: '2026-08-10',
          confirmedAt: '2026-08-10T09:00:00.000Z',
        },
      ]);
    });

    it('keeps one rate per pair per day, the later write replacing the earlier', async () => {
      await save(4.9, '2026-08-10', '2026-08-10T09:00:00.000Z');
      await save(4.95, '2026-08-10', '2026-08-10T18:00:00.000Z');
      await save(4.6, '2026-01-15', '2026-08-20T09:00:00.000Z');

      const series = await listCurrencyFxRates(db);
      expect(
        series.map(rate => [rate.effectiveDate, rate.fxRateToBase]),
      ).toEqual([
        ['2026-01-15', 4.6],
        ['2026-08-10', 4.95],
      ]);
    });
  });

  describe('getCurrencyFxRate', () => {
    it('answers with the latest-dated rate, not the latest-confirmed one', async () => {
      await save(4.9, '2026-08-10', '2026-08-10T09:00:00.000Z');
      await save(4.6, '2026-01-15', '2026-08-20T09:00:00.000Z');

      expect((await getCurrencyFxRate(db, 'MYR', 'EUR'))?.fxRateToBase).toBe(
        4.9,
      );
    });

    it('has no answer for a pair never saved', async () => {
      expect(await getCurrencyFxRate(db, 'MYR', 'EUR')).toBeNull();
    });
  });

  describe('getCurrencyFxRateAsOf', () => {
    it.each(AS_OF_EXPECTATIONS)(
      'resolves $point to $expected',
      async ({ point, expected }) => {
        // Written in reverse, so the answer cannot depend on insertion order.
        for (const rate of [...AS_OF_SERIES].reverse()) {
          await upsertCurrencyFxRate(
            db,
            rate.baseCurrencyCode,
            rate.currencyCode,
            rate.fxRateToBase,
            rate.effectiveDate,
            rate.confirmedAt,
          );
        }

        const found = await getCurrencyFxRateAsOf(db, 'MYR', 'EUR', point);
        expect(found?.fxRateToBase ?? null).toBe(expected);
      },
    );
  });

  describe('listCurrencyFxRates', () => {
    it('lists every pair oldest first, whatever order they were written in', async () => {
      await save(0.03, '2026-02-01', '2026-02-01T09:00:00.000Z', 'JPY');
      await save(4.9, '2026-08-10', '2026-08-10T09:00:00.000Z');
      await save(4.6, '2026-01-15', '2026-08-20T09:00:00.000Z');

      expect(
        (await listCurrencyFxRates(db)).map(rate => [
          rate.currencyCode,
          rate.effectiveDate,
        ]),
      ).toEqual([
        ['EUR', '2026-01-15'],
        ['EUR', '2026-08-10'],
        ['JPY', '2026-02-01'],
      ]);
    });
  });
});
