import type { SQLiteDatabase } from 'react-native-sqlite-storage';
import type { CurrencyFxRateRecord } from '../types';

type RawCurrencyFxRateRow = {
  base_currency_code: string;
  currency_code: string;
  fx_rate_to_base: number;
  updated_at: string;
};

const toRecord = (row: RawCurrencyFxRateRow): CurrencyFxRateRecord => ({
  baseCurrencyCode: row.base_currency_code,
  currencyCode: row.currency_code,
  fxRateToBase: row.fx_rate_to_base,
  updatedAt: row.updated_at,
});

export const upsertCurrencyFxRate = async (
  db: SQLiteDatabase,
  baseCurrencyCode: string,
  currencyCode: string,
  fxRateToBase: number,
): Promise<void> => {
  await db.executeSql(
    `INSERT INTO currency_fx_rates (
        base_currency_code,
        currency_code,
        fx_rate_to_base,
        updated_at
      ) VALUES (?, ?, ?, strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      ON CONFLICT(base_currency_code, currency_code) DO UPDATE SET
        fx_rate_to_base = excluded.fx_rate_to_base,
        updated_at = excluded.updated_at`,
    [baseCurrencyCode, currencyCode, fxRateToBase],
  );
};

export const getCurrencyFxRate = async (
  db: SQLiteDatabase,
  baseCurrencyCode: string,
  currencyCode: string,
): Promise<CurrencyFxRateRecord | null> => {
  const [result] = await db.executeSql(
    `SELECT base_currency_code, currency_code, fx_rate_to_base, updated_at
       FROM currency_fx_rates
       WHERE base_currency_code = ? AND currency_code = ?
       LIMIT 1`,
    [baseCurrencyCode, currencyCode],
  );
  if (result.rows.length === 0) {
    return null;
  }
  return toRecord(result.rows.item(0) as RawCurrencyFxRateRow);
};

export const listCurrencyFxRates = async (
  db: SQLiteDatabase,
): Promise<CurrencyFxRateRecord[]> => {
  const [result] = await db.executeSql(
    `SELECT base_currency_code, currency_code, fx_rate_to_base, updated_at
       FROM currency_fx_rates`,
  );
  const records: CurrencyFxRateRecord[] = [];
  for (let index = 0; index < result.rows.length; index += 1) {
    records.push(toRecord(result.rows.item(index) as RawCurrencyFxRateRow));
  }
  return records;
};
