import type { ResultSet, SQLiteDatabase } from "react-native-sqlite-storage";
import type {
  CategoryRecord,
  NewCategoryRecord,
  UpdateCategoryRecord,
} from "../types";

type RawCategoryRow = {
  id: number;
  name: string;
  created_at: string;
  updated_at: string;
};

const CATEGORY_COLUMNS = 'id, name, created_at, updated_at';

const toCategoryRecord = (row: RawCategoryRow): CategoryRecord => ({
  id: row.id,
  name: row.name,
  createdAt: row.created_at,
  updatedAt: row.updated_at,
});

const mapResultSetToCategories = (result: ResultSet): CategoryRecord[] => {
  const items: CategoryRecord[] = [];
  for (let index = 0; index < result.rows.length; index += 1) {
    const row = result.rows.item(index) as RawCategoryRow;
    items.push(toCategoryRecord(row));
  }
  return items;
};

export const createCategory = async (
  db: SQLiteDatabase,
  payload: NewCategoryRecord,
): Promise<CategoryRecord> => {
  const result = await db.executeSql(
    `INSERT INTO categories (name) VALUES (?)`,
    [payload.name.trim()],
  );
  const insertedId = result[0].insertId;
  if (typeof insertedId !== 'number') {
    throw new Error('Failed to create category');
  }
  const category = await getCategoryById(db, insertedId);
  if (!category) {
    throw new Error('Failed to load created category');
  }
  return category;
};

export const updateCategory = async (
  db: SQLiteDatabase,
  payload: UpdateCategoryRecord,
): Promise<CategoryRecord> => {
  const result = await db.executeSql(
    `UPDATE categories
      SET name = ?,
          updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ','now'))
      WHERE id = ?`,
    [payload.name.trim(), payload.id],
  );
  if (result[0].rowsAffected === 0) {
    throw new Error(`Category ${payload.id} not found`);
  }
  const category = await getCategoryById(db, payload.id);
  if (!category) {
    throw new Error('Failed to load updated category');
  }
  return category;
};

export const deleteCategory = async (
  db: SQLiteDatabase,
  id: number,
): Promise<void> => {
  await db.executeSql(`DELETE FROM categories WHERE id = ?`, [id]);
};

export const getCategoryById = async (
  db: SQLiteDatabase,
  id: number,
): Promise<CategoryRecord | null> => {
  const [result] = await db.executeSql(
    `SELECT ${CATEGORY_COLUMNS} FROM categories WHERE id = ? LIMIT 1`,
    [id],
  );
  if (result.rows.length === 0) {
    return null;
  }
  return toCategoryRecord(result.rows.item(0) as RawCategoryRow);
};

export const getCategoryByName = async (
  db: SQLiteDatabase,
  name: string,
): Promise<CategoryRecord | null> => {
  const [result] = await db.executeSql(
    `SELECT ${CATEGORY_COLUMNS} FROM categories WHERE LOWER(name) = LOWER(?) LIMIT 1`,
    [name.trim()],
  );
  if (result.rows.length === 0) {
    return null;
  }
  return toCategoryRecord(result.rows.item(0) as RawCategoryRow);
};

export const listCategories = async (
  db: SQLiteDatabase,
): Promise<CategoryRecord[]> => {
  const [result] = await db.executeSql(
    `SELECT ${CATEGORY_COLUMNS} FROM categories ORDER BY name COLLATE NOCASE ASC`,
  );
  return mapResultSetToCategories(result);
};
