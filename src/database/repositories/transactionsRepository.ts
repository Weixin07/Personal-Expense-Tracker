import type { ResultSet, SQLiteDatabase } from 'react-native-sqlite-storage';
import type {
  TransactionQueryFilters,
  TransactionRecord,
  TransactionType,
  NewTransactionRecord,
  UpdateTransactionRecord,
} from '../types';

const TRANSACTION_COLUMNS = `
  id,
  type,
  description,
  payee,
  amount_native,
  currency_code,
  fx_rate_to_base,
  base_amount,
  base_currency_code,
  date,
  time,
  category_id,
  notes,
  created_at,
  updated_at
`;

type RawTransactionRow = {
  id: number;
  type: string;
  description: string;
  payee: string;
  amount_native: number;
  currency_code: string;
  fx_rate_to_base: number;
  base_amount: number;
  base_currency_code: string | null;
  date: string;
  time: string | null;
  category_id: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

const toTransactionRecord = (row: RawTransactionRow): TransactionRecord => ({
  id: row.id,
  type: row.type as TransactionType,
  description: row.description,
  payee: row.payee,
  amountNative: row.amount_native,
  currencyCode: row.currency_code,
  fxRateToBase: row.fx_rate_to_base,
  baseAmount: row.base_amount,
  baseCurrencyCode: row.base_currency_code ?? null,
  date: row.date,
  time: row.time ?? null,
  categoryId: row.category_id,
  notes: row.notes,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const mapResultSetToTransactions = (result: ResultSet): TransactionRecord[] => {
  const items: TransactionRecord[] = [];
  for (let index = 0; index < result.rows.length; index += 1) {
    const row = result.rows.item(index) as RawTransactionRow;
    items.push(toTransactionRecord(row));
  }
  return items;
};

export const createTransaction = async (
  db: SQLiteDatabase,
  payload: NewTransactionRecord,
): Promise<TransactionRecord> => {
  const resultSet = await db.executeSql(
    `INSERT INTO transactions (
      type,
      description,
      payee,
      amount_native,
      currency_code,
      fx_rate_to_base,
      base_amount,
      base_currency_code,
      date,
      time,
      category_id,
      notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      payload.type,
      payload.description,
      payload.payee,
      payload.amountNative,
      payload.currencyCode,
      payload.fxRateToBase,
      payload.baseAmount,
      payload.baseCurrencyCode ?? null,
      payload.date,
      payload.time ?? null,
      payload.categoryId ?? null,
      payload.notes ?? null,
    ],
  );

  const insertResult = resultSet[0];
  const insertedId = insertResult.insertId;
  if (typeof insertedId !== 'number') {
    throw new Error('Failed to determine inserted transaction ID');
  }

  const transaction = await getTransactionById(db, insertedId);
  if (!transaction) {
    throw new Error('Failed to load inserted transaction');
  }
  return transaction;
};

const BULK_INSERT_COLUMN_COUNT = 12;
// SQLite caps host parameters per statement (SQLITE_MAX_VARIABLE_NUMBER, 999 on
// older builds). Rows per INSERT are derived from the column count so the cap
// cannot be breached by adding a column.
const SQLITE_MAX_HOST_PARAMS = 999;
const BULK_INSERT_MAX_ROWS = Math.floor(
  SQLITE_MAX_HOST_PARAMS / BULK_INSERT_COLUMN_COUNT,
);

const toBulkInsertParams = (
  payload: NewTransactionRecord,
): Array<string | number | null> => [
  payload.type,
  payload.description,
  payload.payee,
  payload.amountNative,
  payload.currencyCode,
  payload.fxRateToBase,
  payload.baseAmount,
  payload.baseCurrencyCode ?? null,
  payload.date,
  payload.time ?? null,
  payload.categoryId ?? null,
  payload.notes ?? null,
];

export const createTransactionsBulk = async (
  db: SQLiteDatabase,
  payloads: readonly NewTransactionRecord[],
): Promise<number> => {
  if (payloads.length === 0) {
    return 0;
  }

  const rowPlaceholder = `(${Array(BULK_INSERT_COLUMN_COUNT).fill('?').join(', ')})`;

  for (let start = 0; start < payloads.length; start += BULK_INSERT_MAX_ROWS) {
    const batch = payloads.slice(start, start + BULK_INSERT_MAX_ROWS);
    const placeholders = Array(batch.length).fill(rowPlaceholder).join(', ');
    const params = batch.flatMap(toBulkInsertParams);
    await db.executeSql(
      // eslint-disable-next-line no-restricted-syntax -- placeholder groups are a trusted constant; every row value is parameterized
      `INSERT INTO transactions (
        type,
        description,
        payee,
        amount_native,
        currency_code,
        fx_rate_to_base,
        base_amount,
        base_currency_code,
        date,
        time,
        category_id,
        notes
      ) VALUES ${placeholders}`,
      params,
    );
  }

  return payloads.length;
};

export const updateTransaction = async (
  db: SQLiteDatabase,
  payload: UpdateTransactionRecord,
): Promise<TransactionRecord> => {
  const { id, ...fields } = payload;
  const resultSet = await db.executeSql(
    `UPDATE transactions SET
      type = ?,
      description = ?,
      payee = ?,
      amount_native = ?,
      currency_code = ?,
      fx_rate_to_base = ?,
      base_amount = ?,
      base_currency_code = ?,
      date = ?,
      time = ?,
      category_id = ?,
      notes = ?,
      updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    WHERE id = ?`,
    [
      fields.type,
      fields.description,
      fields.payee,
      fields.amountNative,
      fields.currencyCode,
      fields.fxRateToBase,
      fields.baseAmount,
      fields.baseCurrencyCode ?? null,
      fields.date,
      fields.time ?? null,
      fields.categoryId ?? null,
      fields.notes ?? null,
      id,
    ],
  );

  if (resultSet[0].rowsAffected === 0) {
    throw new Error(`Transaction ${id} not found`);
  }

  const transaction = await getTransactionById(db, id);
  if (!transaction) {
    throw new Error('Failed to load updated transaction');
  }

  return transaction;
};

export const deleteTransaction = async (
  db: SQLiteDatabase,
  id: number,
): Promise<void> => {
  const resultSet = await db.executeSql(
    'DELETE FROM transactions WHERE id = ?',
    [id],
  );
  if (resultSet[0].rowsAffected === 0) {
    throw new Error(`Transaction ${id} not found`);
  }
};

export const getTransactionById = async (
  db: SQLiteDatabase,
  id: number,
): Promise<TransactionRecord | null> => {
  const [result] = await db.executeSql(
    // eslint-disable-next-line no-restricted-syntax -- TRANSACTION_COLUMNS is a trusted constant column list, not user input
    `SELECT ${TRANSACTION_COLUMNS} FROM transactions WHERE id = ? LIMIT 1`,
    [id],
  );
  if (result.rows.length === 0) {
    return null;
  }
  return toTransactionRecord(result.rows.item(0) as RawTransactionRow);
};

export const listTransactions = async (
  db: SQLiteDatabase,
  filters: TransactionQueryFilters = {},
): Promise<TransactionRecord[]> => {
  const conditions: string[] = [];
  const params: Array<number | string> = [];

  if (filters.type) {
    conditions.push('type = ?');
    params.push(filters.type);
  }
  if (typeof filters.categoryId === 'number') {
    conditions.push('category_id = ?');
    params.push(filters.categoryId);
  }
  if (filters.startDate) {
    conditions.push('date >= ?');
    params.push(filters.startDate);
  }
  if (filters.endDate) {
    conditions.push('date <= ?');
    params.push(filters.endDate);
  }

  const whereClause =
    conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
  let limitClause = '';
  if (typeof filters.limit === 'number') {
    limitClause += ' LIMIT ?';
    params.push(filters.limit);
  }
  if (typeof filters.offset === 'number') {
    limitClause += limitClause ? ' OFFSET ?' : ' LIMIT -1 OFFSET ?';
    params.push(filters.offset);
  }

  // SQLite orders NULL below every other value, so `time DESC` already places
  // untimed rows after timed ones within a date. An explicit NULLS LAST would
  // require SQLite 3.30 and change nothing.
  const query = `SELECT ${TRANSACTION_COLUMNS} FROM transactions ${whereClause} ORDER BY date DESC, time DESC, id DESC${limitClause}`;
  const [result] = await db.executeSql(query, params);
  return mapResultSetToTransactions(result);
};
