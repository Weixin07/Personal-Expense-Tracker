import type { SQLiteDatabase, Transaction } from "react-native-sqlite-storage";
import { DEFAULT_CATEGORIES } from "../constants/defaultCategories";

const BASE_CURRENCY_KEY = "base_currency";

const ensureBaseCurrencyPlaceholder = async (db: SQLiteDatabase): Promise<void> => {
  const [result] = await db.executeSql(
    `SELECT 1 FROM app_settings WHERE key = ? LIMIT 1`,
    [BASE_CURRENCY_KEY],
  );
  if (result.rows.length > 0) {
    return;
  }
  await db.executeSql(
    `INSERT INTO app_settings (key, value) VALUES (?, NULL)`,
    [BASE_CURRENCY_KEY],
  );
};

const ensureDefaultCategories = async (db: SQLiteDatabase): Promise<void> => {
  const [result] = await db.executeSql(
    `SELECT COUNT(*) AS count FROM categories`,
  );
  const row = result.rows.item(0) as { count: number };
  if (row.count > 0) {
    return;
  }

  await new Promise<void>((resolve, reject) => {
    db.transaction(
      (tx: Transaction) => {
        DEFAULT_CATEGORIES.forEach(name => {
          tx.executeSql(`INSERT INTO categories (name) VALUES (?)`, [name]);
        });
      },
      error => reject(error),
      () => resolve(),
    );
  });
};

export const seedInitialData = async (db: SQLiteDatabase): Promise<void> => {
  await ensureBaseCurrencyPlaceholder(db);
  await ensureDefaultCategories(db);
};