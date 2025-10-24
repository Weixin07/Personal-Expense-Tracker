import type { ResultSet, SQLiteDatabase } from "react-native-sqlite-storage";
import type {
  ExpenseQueryFilters,
  ExpenseRecord,
  NewExpenseRecord,
  UpdateExpenseRecord,
} from "../types";

const EXPENSE_COLUMNS = `
  id,
  description,
  amount_native,
  currency_code,
  fx_rate_to_base,
  base_amount,
  date,
  category_id,
  notes,
  created_at,
  updated_at
`;

type RawExpenseRow = {
  id: number;
  description: string;
  amount_native: number;
  currency_code: string;
  fx_rate_to_base: number;
  base_amount: number;
  date: string;
  category_id: number | null;
  notes: string | null;
  created_at: string;
  updated_at: string;
};

const toExpenseRecord = (row: RawExpenseRow): ExpenseRecord => ({
  id: row.id,
  description: row.description,
  amountNative: row.amount_native,
  currencyCode: row.currency_code,
  fxRateToBase: row.fx_rate_to_base,
  baseAmount: row.base_amount,
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
      amount_native,
      currency_code,
      fx_rate_to_base,
      base_amount,
      date,
      category_id,
      notes
    ) VALUES (?, ?, ?, ?, ?, ?, ?, ?)`,
    [
      payload.description,
      payload.amountNative,
      payload.currencyCode,
      payload.fxRateToBase,
      payload.baseAmount,
      payload.date,
      payload.categoryId ?? null,
      payload.notes ?? null,
    ],
  );

  const insertResult = resultSet[0];
  const insertedId = insertResult.insertId;
  if (typeof insertedId !== "number") {
    throw new Error("Failed to determine inserted expense ID");
  }

  const expense = await getExpenseById(db, insertedId);
  if (!expense) {
    throw new Error("Failed to load inserted expense");
  }
  return expense;
};

export const updateExpense = async (
  db: SQLiteDatabase,
  payload: UpdateExpenseRecord,
): Promise<ExpenseRecord> => {
  const { id, ...fields } = payload;
  const resultSet = await db.executeSql(
    `UPDATE expenses SET
      description = ?,
      amount_native = ?,
      currency_code = ?,
      fx_rate_to_base = ?,
      base_amount = ?,
      date = ?,
      category_id = ?,
      notes = ?,
      updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
    WHERE id = ?`,
    [
      fields.description,
      fields.amountNative,
      fields.currencyCode,
      fields.fxRateToBase,
      fields.baseAmount,
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
    throw new Error("Failed to load updated expense");
  }

  return expense;
};

export const deleteExpense = async (
  db: SQLiteDatabase,
  id: number,
): Promise<void> => {
  const resultSet = await db.executeSql('DELETE FROM expenses WHERE id = ?', [id]);
  if (resultSet[0].rowsAffected === 0) {
    throw new Error(`Expense ${id} not found`);
  }
};

export const getExpenseById = async (
  db: SQLiteDatabase,
  id: number,
): Promise<ExpenseRecord | null> => {
  const [result] = await db.executeSql(
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

  if (typeof filters.categoryId === "number") {
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

  const whereClause = conditions.length > 0 ? `WHERE ${conditions.join(' AND ')}` : '';
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