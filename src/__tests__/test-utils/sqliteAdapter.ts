import type { DatabaseSync } from 'node:sqlite';
import type { SQLiteDatabase, Transaction } from 'react-native-sqlite-storage';

/**
 * Presents Node's bundled SQLite through the `react-native-sqlite-storage`
 * surface, so production code can be exercised against a real engine rather
 * than a mock that cannot enforce a constraint.
 *
 * Node's engine is far newer than the system SQLite on the minimum supported
 * device (3.22 on API 28), so a pass proves logic, never compatibility with that
 * older engine — see the on-device checks in DEPLOY.md.
 */
export const adaptNodeSqlite = (db: DatabaseSync): SQLiteDatabase => {
  const executeSql = async (sql: string, args: unknown[] = []) => {
    const trimmed = sql.trim();
    if (/^select/i.test(trimmed)) {
      const rows = db.prepare(trimmed).all(...(args as never[]));
      return [
        {
          insertId: undefined,
          rowsAffected: 0,
          rows: {
            length: rows.length,
            raw: () => rows,
            item: (index: number) => rows[index] ?? null,
          },
        },
      ];
    }
    const result = db.prepare(trimmed).run(...(args as never[]));
    return [
      {
        insertId: Number(result.lastInsertRowid),
        rowsAffected: Number(result.changes),
        rows: { length: 0, raw: () => [], item: () => null },
      },
    ];
  };

  return {
    executeSql,
    transaction: (
      executor: (tx: Transaction) => void,
      onError?: (error: Error) => void,
      onSuccess?: () => void,
    ) => {
      const statements: [string, unknown[]][] = [];
      executor({
        executeSql: (sql: string, args: unknown[] = []) => {
          statements.push([sql, args]);
        },
      } as unknown as Transaction);
      try {
        db.exec('BEGIN');
        for (const [sql, args] of statements) {
          db.prepare(sql.trim()).run(...(args as never[]));
        }
        db.exec('COMMIT');
        onSuccess?.();
      } catch (error) {
        db.exec('ROLLBACK');
        onError?.(error as Error);
        throw error;
      }
    },
  } as unknown as SQLiteDatabase;
};
