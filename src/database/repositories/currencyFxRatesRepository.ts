import type { SQLiteDatabase } from 'react-native-sqlite-storage';
import type { CurrencyFxRateRecord } from '../types';

type RawCurrencyFxRateRow = {
  base_currency_code: string;
  currency_code: string;
  effective_date: string;
  fx_rate_to_base: number;
  confirmed_at: string;
};

const toRecord = (row: RawCurrencyFxRateRow): CurrencyFxRateRecord => ({
  baseCurrencyCode: row.base_currency_code,
  currencyCode: row.currency_code,
  fxRateToBase: row.fx_rate_to_base,
  effectiveDate: row.effective_date,
  confirmedAt: row.confirmed_at,
});

const firstRecord = (result: {
  rows: { length: number; item: (index: number) => unknown };
}): CurrencyFxRateRecord | null =>
  result.rows.length === 0
    ? null
    : toRecord(result.rows.item(0) as RawCurrencyFxRateRow);

/**
 * Records `fxRateToBase` as the pair's rate on `effectiveDate`, replacing any
 * rate already held for that day. `confirmedAt` is bound rather than generated,
 * so a caller mirroring the row in memory holds the instant stored here.
 */
export const upsertCurrencyFxRate = async (
  db: SQLiteDatabase,
  baseCurrencyCode: string,
  currencyCode: string,
  fxRateToBase: number,
  effectiveDate: string,
  confirmedAt: string,
): Promise<void> => {
  // Not an UPSERT, under the rule on `setSetting`. Every column is supplied
  // below, so the row REPLACE writes is complete.
  await db.executeSql(
    `INSERT OR REPLACE INTO currency_fx_rates (
        base_currency_code,
        currency_code,
        effective_date,
        fx_rate_to_base,
        confirmed_at
      ) VALUES (?, ?, ?, ?, ?)`,
    [baseCurrencyCode, currencyCode, effectiveDate, fxRateToBase, confirmedAt],
  );
};

/**
 * The pair's current rate, under the rule on `currentFxRates`, or null when the
 * pair has none.
 */
export const getCurrencyFxRate = async (
  db: SQLiteDatabase,
  baseCurrencyCode: string,
  currencyCode: string,
): Promise<CurrencyFxRateRecord | null> => {
  const [result] = await db.executeSql(
    `SELECT base_currency_code, currency_code, effective_date, fx_rate_to_base, confirmed_at
       FROM currency_fx_rates
       WHERE base_currency_code = ? AND currency_code = ?
       ORDER BY effective_date DESC, confirmed_at DESC
       LIMIT 1`,
    [baseCurrencyCode, currencyCode],
  );
  return firstRecord(result);
};

/**
 * The rate in force for the pair on `isoDate` under the rule on `rateAsOf`, or
 * null when no rate held is in force by then.
 */
export const getCurrencyFxRateAsOf = async (
  db: SQLiteDatabase,
  baseCurrencyCode: string,
  currencyCode: string,
  isoDate: string,
): Promise<CurrencyFxRateRecord | null> => {
  const [result] = await db.executeSql(
    `SELECT base_currency_code, currency_code, effective_date, fx_rate_to_base, confirmed_at
       FROM currency_fx_rates
       WHERE base_currency_code = ? AND currency_code = ? AND effective_date <= ?
       ORDER BY effective_date DESC, confirmed_at DESC
       LIMIT 1`,
    [baseCurrencyCode, currencyCode, isoDate],
  );
  return firstRecord(result);
};

/** Every dated rate held, each pair's history oldest first. */
export const listCurrencyFxRates = async (
  db: SQLiteDatabase,
): Promise<CurrencyFxRateRecord[]> => {
  const [result] = await db.executeSql(
    `SELECT base_currency_code, currency_code, effective_date, fx_rate_to_base, confirmed_at
       FROM currency_fx_rates
       ORDER BY base_currency_code, currency_code, effective_date, confirmed_at`,
  );
  const records: CurrencyFxRateRecord[] = [];
  for (let index = 0; index < result.rows.length; index += 1) {
    records.push(toRecord(result.rows.item(index) as RawCurrencyFxRateRow));
  }
  return records;
};
