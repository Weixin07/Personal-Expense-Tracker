import type { SQLiteDatabase } from "react-native-sqlite-storage";
import type { AppSettingRecord } from "../types";

export const setSetting = async (
  db: SQLiteDatabase,
  key: string,
  value: string | null,
): Promise<void> => {
  await db.executeSql(
    `INSERT INTO app_settings (key, value)
      VALUES (?, ?)
      ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    [key, value],
  );
};

export const getSetting = async (
  db: SQLiteDatabase,
  key: string,
): Promise<string | null> => {
  const [result] = await db.executeSql(
    `SELECT value FROM app_settings WHERE key = ? LIMIT 1`,
    [key],
  );
  if (result.rows.length === 0) {
    return null;
  }
  const row = result.rows.item(0) as { value: string | null };
  return row.value ?? null;
};

export const deleteSetting = async (
  db: SQLiteDatabase,
  key: string,
): Promise<void> => {
  await db.executeSql(`DELETE FROM app_settings WHERE key = ?`, [key]);
};

export const getAllSettings = async (
  db: SQLiteDatabase,
): Promise<AppSettingRecord[]> => {
  const [result] = await db.executeSql(
    `SELECT key, value FROM app_settings ORDER BY key ASC`,
  );
  const settings: AppSettingRecord[] = [];
  for (let index = 0; index < result.rows.length; index += 1) {
    const row = result.rows.item(index) as AppSettingRecord;
    settings.push({ key: row.key, value: row.value ?? null });
  }
  return settings;
};