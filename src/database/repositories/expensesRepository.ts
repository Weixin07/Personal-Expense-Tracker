import type { ResultSet, SQLiteDatabase } from 'react-native-sqlite-storage';
import type {
  ExpenseQueryFilters,
  ExpenseRecord,
  NewExpenseRecord,
  UpdateExpenseRecord,
} from '../types';

const EXPENSE_COLUMNS = `
  id,
  description,
  payee,
  amount_native,
  currency_code,
  fx_rate_to_base,
  base_amount,
  base_currency_code,
  date,
  category_id,
  notes,
  created_at,
  updated_at
`;

type RawExpenseRow = {
  id: number;
  description: string;
  payee: string;
  amount_native: number;
  currency_code: string;
  fx_rate_to_base: number;
  base_amount: number;
  base_currency_code: string | null;
  date: string;
  category_id: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

const toExpenseRecord = (row: RawExpenseRow): ExpenseRecord => ({
  id: row.id,
  description: row.description,
  payee: row.payee,
  amountNative: row.amount_native,
  currencyCode: row.currency_code,
  fxRateToBase: row.fx_rate_to_base,
  baseAmount: row.base_amount,
  baseCurrencyCode: row.base_currency_code ?? null,
  date: row.date,
  categoryId: row.category_id,
  notes: row.notes,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const mapResultSetToExpenses = (result: ResultSet): ExpenseRecord[] => {
  const items: ExpenseRecord[] = [];
  for (let index = 0; index < result.rows.length; index += 1) {
    const row = result.rows.item(index) as RawExpenseRow;
    items.push(toExpenseRecord(row));
  }
  return items;
};

export const createExpense = async (
  db: SQLiteDatabase,
  payload: NewExpenseRecord,
): Promise<ExpenseRecord> => {
  const resultSet = await db.executeSql(
    `INSERT INTO expenses (
      description,
      payee,
      amount_native,
      currency_code,
      fx_rate_to_base,
      base_amount,
      base_currency_code,
      date,
      category_id,
      notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      payload.description,
      payload.payee,
      payload.amountNative,
      payload.currencyCode,
      payload.fxRateToBase,
      payload.baseAmount,
      payload.baseCurrencyCode ?? null,
      payload.date,
      payload.categoryId ?? null,
      payload.notes ?? null,
    ],
  );

  const insertResult = resultSet[0];
  const insertedId = insertResult.insertId;
  if (typeof insertedId !== 'number') {
    throw new Error('Failed to determine inserted expense ID');
  }

  const expense = await getExpenseById(db, insertedId);
  if (!expense) {
    throw new Error('Failed to load inserted expense');
  }
  return expense;
};

const BULK_INSERT_COLUMN_COUNT = 10;
// SQLite caps host parameters per statement (SQLITE_MAX_VARIABLE_NUMBER, 999 on
// older builds). Cap rows per INSERT so column_count * rows stays under it.
const BULK_INSERT_MAX_ROWS = 90;

const toBulkInsertParams = (
  payload: NewExpenseRecord,
): Array<string | number | null> => [
  payload.description,
  payload.payee,
  payload.amountNative,
  payload.currencyCode,
  payload.fxRateToBase,
  payload.baseAmount,
  payload.baseCurrencyCode ?? null,
  payload.date,
  payload.categoryId ?? null,
  payload.notes ?? null,
];

export const createExpensesBulk = async (
  db: SQLiteDatabase,
  payloads: readonly NewExpenseRecord[],
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
      `INSERT INTO expenses (
        description,
        payee,
        amount_native,
        currency_code,
        fx_rate_to_base,
        base_amount,
        base_currency_code,
        date,
        category_id,
        notes
      ) VALUES ${placeholders}`,
      params,
    );
  }

  return payloads.length;
};

export const updateExpense = async (
  db: SQLiteDatabase,
  payload: UpdateExpenseRecord,
): Promise<ExpenseRecord> => {
  const { id, ...fields } = payload;
  const resultSet = await db.executeSql(
    `UPDATE expenses SET
      description = ?,
      payee = ?,
      amount_native = ?,
      currency_code = ?,
      fx_rate_to_base = ?,
      base_amount = ?,
      base_currency_code = ?,
      date = ?,
      category_id = ?,
      notes = ?,
      updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    WHERE id = ?`,
    [
      fields.description,
      fields.payee,
      fields.amountNative,
      fields.currencyCode,
      fields.fxRateToBase,
      fields.baseAmount,
      fields.baseCurrencyCode ?? null,
      fields.date,
      fields.categoryId ?? null,
      fields.notes ?? null,
      id,
    ],
  );

  if (resultSet[0].rowsAffected === 0) {
    throw new Error(`Expense ${id} not found`);
  }

  const expense = await getExpenseById(db, id);
  if (!expense) {
    throw new Error('Failed to load updated expense');
  }

  return expense;
};

export const deleteExpense = async (
  db: SQLiteDatabase,
  id: number,
): Promise<void> => {
  const resultSet = await db.executeSql('DELETE FROM expenses WHERE id = ?', [
    id,
  ]);
  if (resultSet[0].rowsAffected === 0) {
    throw new Error(`Expense ${id} not found`);
  }
};

export const getExpenseById = async (
  db: SQLiteDatabase,
  id: number,
): Promise<ExpenseRecord | null> => {
  const [result] = await db.executeSql(
    // eslint-disable-next-line no-restricted-syntax -- EXPENSE_COLUMNS is a trusted constant column list, not user input
    `SELECT ${EXPENSE_COLUMNS} FROM expenses WHERE id = ? LIMIT 1`,
    [id],
  );
  if (result.rows.length === 0) {
    return null;
  }
  return toExpenseRecord(result.rows.item(0) as RawExpenseRow);
};

export const listExpenses = async (
  db: SQLiteDatabase,
  filters: ExpenseQueryFilters = {},
): Promise<ExpenseRecord[]> => {
  const conditions: string[] = [];
  const params: Array<number | string> = [];

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

  const query = `SELECT ${EXPENSE_COLUMNS} FROM expenses ${whereClause} ORDER BY date DESC, id DESC${limitClause}`;
  const [result] = await db.executeSql(query, params);
  return mapResultSetToExpenses(result);
};
