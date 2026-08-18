import type { SQLiteDatabase, Transaction } from 'react-native-sqlite-storage';
import { DEFAULT_CATEGORIES } from '../constants/defaultCategories';

const BASE_CURRENCY_KEY = 'base_currency';
const DRIVE_FOLDER_ID_KEY = 'drive_folder_id';

/**
 * Migration v10 writes this same name as a literal. The two are deliberately
 * not shared: a migration's SQL is fixed at the version it belongs to, while
 * this constant is free to change.
 */
const DEFAULT_FUND_NAME = 'General';

const ensureBaseCurrencyPlaceholder = async (
  db: SQLiteDatabase,
): Promise<void> => {
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

const ensureDriveFolderIdPlaceholder = async (
  db: SQLiteDatabase,
): Promise<void> => {
  const [result] = await db.executeSql(
    `SELECT 1 FROM app_settings WHERE key = ? LIMIT 1`,
    [DRIVE_FOLDER_ID_KEY],
  );
  if (result.rows.length > 0) {
    return;
  }
  await db.executeSql(
    `INSERT INTO app_settings (key, value) VALUES (?, NULL)`,
    [DRIVE_FOLDER_ID_KEY],
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
        DEFAULT_CATEGORIES.forEach(({ name, type }) => {
          tx.executeSql(`INSERT INTO categories (name, type) VALUES (?, ?)`, [
            name,
            type,
          ]);
        });
      },
      error => reject(error),
      () => resolve(),
    );
  });
};

/**
 * Migration v10 inserts this fund on both the fresh-install and upgrade paths,
 * so this is the safety net for a `funds` table that was emptied — every
 * transaction requires a fund, and the import and the entry form both need one
 * to fall back to.
 */
const ensureDefaultFund = async (db: SQLiteDatabase): Promise<void> => {
  const [result] = await db.executeSql(`SELECT COUNT(*) AS count FROM funds`);
  const row = result.rows.item(0) as { count: number };
  if (row.count > 0) {
    return;
  }
  await db.executeSql(`INSERT INTO funds (name) VALUES (?)`, [
    DEFAULT_FUND_NAME,
  ]);
};

export const seedInitialData = async (db: SQLiteDatabase): Promise<void> => {
  await ensureBaseCurrencyPlaceholder(db);
  await ensureDriveFolderIdPlaceholder(db);
  await ensureDefaultCategories(db);
  await ensureDefaultFund(db);
};
