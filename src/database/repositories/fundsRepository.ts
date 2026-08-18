import type { ResultSet, SQLiteDatabase } from 'react-native-sqlite-storage';
import type { FundRecord, NewFundRecord, UpdateFundRecord } from '../types';

type RawFundRow = {
  id: number;
  name: string;
  currency_code: string | null;
  opening_balance: number;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

const FUND_COLUMNS =
  'id, name, currency_code, opening_balance, notes, created_at, updated_at';

const toFundRecord = (row: RawFundRow): FundRecord => ({
  id: row.id,
  name: row.name,
  currencyCode: row.currency_code ?? null,
  openingBalance: row.opening_balance,
  notes: row.notes ?? null,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const mapResultSetToFunds = (result: ResultSet): FundRecord[] => {
  const items: FundRecord[] = [];
  for (let index = 0; index < result.rows.length; index += 1) {
    const row = result.rows.item(index) as RawFundRow;
    items.push(toFundRecord(row));
  }
  return items;
};

export const createFund = async (
  db: SQLiteDatabase,
  payload: NewFundRecord,
): Promise<FundRecord> => {
  const result = await db.executeSql(
    `INSERT INTO funds (name, currency_code, opening_balance, notes) VALUES (?, ?, ?, ?)`,
    [
      payload.name.trim(),
      payload.currencyCode,
      payload.openingBalance,
      payload.notes,
    ],
  );
  const insertedId = result[0].insertId;
  if (typeof insertedId !== 'number') {
    throw new Error('Failed to create fund');
  }
  const fund = await getFundById(db, insertedId);
  if (!fund) {
    throw new Error('Failed to load created fund');
  }
  return fund;
};

export const updateFund = async (
  db: SQLiteDatabase,
  payload: UpdateFundRecord,
): Promise<FundRecord> => {
  const result = await db.executeSql(
    `UPDATE funds
      SET name = ?,
          currency_code = ?,
          opening_balance = ?,
          notes = ?,
          updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      WHERE id = ?`,
    [
      payload.name.trim(),
      payload.currencyCode,
      payload.openingBalance,
      payload.notes,
      payload.id,
    ],
  );
  if (result[0].rowsAffected === 0) {
    throw new Error(`Fund ${payload.id} not found`);
  }
  const fund = await getFundById(db, payload.id);
  if (!fund) {
    throw new Error('Failed to load updated fund');
  }
  return fund;
};

/**
 * Removal is refused by the schema while any transaction still references the
 * fund, on either side of a transfer.
 */
export const deleteFund = async (
  db: SQLiteDatabase,
  id: number,
): Promise<void> => {
  await db.executeSql(`DELETE FROM funds WHERE id = ?`, [id]);
};

export const getFundById = async (
  db: SQLiteDatabase,
  id: number,
): Promise<FundRecord | null> => {
  const [result] = await db.executeSql(
    // eslint-disable-next-line no-restricted-syntax -- FUND_COLUMNS is a trusted constant column list, not user input
    `SELECT ${FUND_COLUMNS} FROM funds WHERE id = ? LIMIT 1`,
    [id],
  );
  if (result.rows.length === 0) {
    return null;
  }
  return toFundRecord(result.rows.item(0) as RawFundRow);
};

/**
 * Case-insensitive without folding either side: `funds.name` is declared
 * `COLLATE NOCASE`, so the comparison and the UNIQUE constraint that rejects a
 * duplicate cannot disagree about what counts as the same name.
 */
export const getFundByName = async (
  db: SQLiteDatabase,
  name: string,
): Promise<FundRecord | null> => {
  const [result] = await db.executeSql(
    // eslint-disable-next-line no-restricted-syntax -- FUND_COLUMNS is a trusted constant column list, not user input
    `SELECT ${FUND_COLUMNS} FROM funds WHERE name = ? LIMIT 1`,
    [name.trim()],
  );
  if (result.rows.length === 0) {
    return null;
  }
  return toFundRecord(result.rows.item(0) as RawFundRow);
};

export const listFunds = async (db: SQLiteDatabase): Promise<FundRecord[]> => {
  const [result] = await db.executeSql(
    // eslint-disable-next-line no-restricted-syntax -- FUND_COLUMNS is a trusted constant column list, not user input
    `SELECT ${FUND_COLUMNS} FROM funds ORDER BY name ASC`,
  );
  return mapResultSetToFunds(result);
};
