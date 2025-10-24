import type { SQLiteDatabase } from "react-native-sqlite-storage";
import type { ExportQueueRecord } from "../types";

export type InsertExportQueueItem = {
  id: string;
  filename: string;
  filePath: string;
  fileUri: string | null;
  status: ExportQueueRecord['status'];
  lastError?: string | null;
};

export type UpdateExportQueueFields = Partial<{
  status: ExportQueueRecord['status'];
  lastError: string | null;
  driveFileId: string | null;
  uploadedAt: string | null;
  filePath: string;
  fileUri: string | null;
  filename: string;
}>;

export type UpdateExportQueueStatusOptions = Partial<{
  lastError: string | null;
  driveFileId: string | null;
  uploadedAt: string | null;
  filePath: string;
  fileUri: string | null;
  filename: string;
}>;

const mapRowToRecord = (row: any): ExportQueueRecord => ({
  id: row.id,
  filename: row.filename,
  filePath: row.filePath,
  fileUri: row.fileUri ?? null,
  status: row.status,
  createdAt: row.createdAt,
  updatedAt: row.updatedAt,
  uploadedAt: row.uploadedAt ?? null,
  driveFileId: row.driveFileId ?? null,
  lastError: row.lastError ?? null,
});

export const listExportQueue = async (
  db: SQLiteDatabase,
): Promise<ExportQueueRecord[]> => {
  const [result] = await db.executeSql(
    `SELECT id,
            filename,
            file_path AS filePath,
            file_uri AS fileUri,
            status,
            created_at AS createdAt,
            updated_at AS updatedAt,
            uploaded_at AS uploadedAt,
            drive_file_id AS driveFileId,
            last_error AS lastError
       FROM export_queue
       ORDER BY created_at ASC`,
  );

  const items: ExportQueueRecord[] = [];
  for (let index = 0; index < result.rows.length; index += 1) {
    items.push(mapRowToRecord(result.rows.item(index)));
  }
  return items;
};

export const insertExportQueueItem = async (
  db: SQLiteDatabase,
  payload: InsertExportQueueItem,
): Promise<void> => {
  await db.executeSql(
    `INSERT INTO export_queue (
        id,
        filename,
        file_path,
        file_uri,
        status,
        created_at,
        updated_at,
        uploaded_at,
        drive_file_id,
        last_error
      )
      VALUES (
        ?,
        ?,
        ?,
        ?,
        ?,
        (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        (strftime('%Y-%m-%dT%H:%M:%fZ','now')),
        NULL,
        NULL,
        ?
      )`,
    [
      payload.id,
      payload.filename,
      payload.filePath,
      payload.fileUri ?? null,
      payload.status,
      payload.lastError ?? null,
    ],
  );
};

export const updateExportQueueItem = async (
  db: SQLiteDatabase,
  id: string,
  updates: UpdateExportQueueFields,
): Promise<void> => {
  const fields: string[] = [];
  const values: Array<string | null> = [];

  if (updates.status !== undefined) {
    fields.push('status = ?');
    values.push(updates.status);
  }

  if (Object.prototype.hasOwnProperty.call(updates, 'lastError')) {
    fields.push('last_error = ?');
    values.push(updates.lastError ?? null);
  }

  if (Object.prototype.hasOwnProperty.call(updates, 'driveFileId')) {
    fields.push('drive_file_id = ?');
    values.push(updates.driveFileId ?? null);
  }

  if (Object.prototype.hasOwnProperty.call(updates, 'uploadedAt')) {
    fields.push('uploaded_at = ?');
    values.push(updates.uploadedAt ?? null);
  }

  if (updates.filePath !== undefined) {
    fields.push('file_path = ?');
    values.push(updates.filePath);
  }

  if (Object.prototype.hasOwnProperty.call(updates, 'fileUri')) {
    fields.push('file_uri = ?');
    values.push(updates.fileUri ?? null);
  }

  if (updates.filename !== undefined) {
    fields.push('filename = ?');
    values.push(updates.filename);
  }

  if (fields.length === 0) {
    return;
  }

  fields.push("updated_at = (strftime('%Y-%m-%dT%H:%M:%fZ','now'))");

  const query = `UPDATE export_queue SET ${fields.join(', ')} WHERE id = ?`;
  const [result] = await db.executeSql(query, [...values, id]);

  if (result.rowsAffected === 0) {
    throw new Error(`Export queue item ${id} not found`);
  }
};

export const updateExportQueueStatus = async (
  db: SQLiteDatabase,
  id: string,
  status: ExportQueueRecord['status'],
  options: UpdateExportQueueStatusOptions = {},
): Promise<void> => {
  const updates: UpdateExportQueueFields = { status };

  if (options.lastError !== undefined) {
    updates.lastError = options.lastError;
  }

  if (options.driveFileId !== undefined) {
    updates.driveFileId = options.driveFileId;
  }

  if (options.uploadedAt !== undefined) {
    updates.uploadedAt = options.uploadedAt;
  }

  if (options.filePath !== undefined) {
    updates.filePath = options.filePath;
  }

  if (options.fileUri !== undefined) {
    updates.fileUri = options.fileUri;
  }

  if (options.filename !== undefined) {
    updates.filename = options.filename;
  }

  await updateExportQueueItem(db, id, updates);
};

export const removeExportQueueItem = async (
  db: SQLiteDatabase,
  id: string,
): Promise<void> => {
  const [result] = await db.executeSql('DELETE FROM export_queue WHERE id = ?', [id]);
  if (result.rowsAffected === 0) {
    throw new Error(`Export queue item ${id} not found`);
  }
};

export const clearCompletedExportQueueItems = async (
  db: SQLiteDatabase,
): Promise<number> => {
  const [result] = await db.executeSql(
    "DELETE FROM export_queue WHERE status IN ('completed','failed')",
  );
  return result.rowsAffected ?? 0;
};
