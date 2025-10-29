import type { SQLiteDatabase, ResultSet, Transaction } from 'react-native-sqlite-storage';
import { runMigrations, latestMigrationVersion } from '../migrations';

describe('migrations', () => {
  let mockDb: jest.Mocked<SQLiteDatabase>;
  let mockTx: jest.Mocked<Transaction>;

  beforeEach(() => {
    mockTx = {
      executeSql: jest.fn(),
    } as unknown as jest.Mocked<Transaction>;

    mockDb = {
      executeSql: jest.fn(),
      transaction: jest.fn((executor, errorCallback, successCallback) => {
        executor(mockTx);
        if (successCallback) {
          successCallback();
        }
      }),
    } as unknown as jest.Mocked<SQLiteDatabase>;
  });

  describe('latestMigrationVersion', () => {
    it('should return the latest migration version', () => {
      const version = latestMigrationVersion();
      expect(version).toBe(4);
    });
  });

  describe('runMigrations', () => {
    it('should create schema_migrations table if not exists', async () => {
      const mockCreateTableResult: ResultSet = {
        insertId: undefined,
        rowsAffected: 0,
        rows: {
          length: 0,
          raw: () => [],
          item: () => null,
        },
      };

      const mockVersionResult: ResultSet = {
        insertId: undefined,
        rowsAffected: 0,
        rows: {
          length: 1,
          raw: () => [{ version: 4 }],
          item: (index: number) => (index === 0 ? { version: 4 } : null),
        },
      };

      mockDb.executeSql
        .mockResolvedValueOnce([mockCreateTableResult]) // CREATE TABLE schema_migrations
        .mockResolvedValueOnce([mockVersionResult]); // SELECT MAX(version)

      await runMigrations(mockDb);

      expect(mockDb.executeSql).toHaveBeenCalledWith(
        expect.stringContaining('CREATE TABLE IF NOT EXISTS schema_migrations')
      );
    });

    it('should run all migrations when starting from version 0', async () => {
      const mockCreateTableResult: ResultSet = {
        insertId: undefined,
        rowsAffected: 0,
        rows: {
          length: 0,
          raw: () => [],
          item: () => null,
        },
      };

      const mockVersionResult: ResultSet = {
        insertId: undefined,
        rowsAffected: 0,
        rows: {
          length: 1,
          raw: () => [{ version: null }],
          item: (index: number) => (index === 0 ? { version: null } : null),
        },
      };

      mockDb.executeSql
        .mockResolvedValueOnce([mockCreateTableResult])
        .mockResolvedValueOnce([mockVersionResult]);

      await runMigrations(mockDb);

      // Should execute transaction 4 times (one for each migration)
      expect(mockDb.transaction).toHaveBeenCalledTimes(4);
    });

    it('should run only pending migrations', async () => {
      const mockCreateTableResult: ResultSet = {
        insertId: undefined,
        rowsAffected: 0,
        rows: {
          length: 0,
          raw: () => [],
          item: () => null,
        },
      };

      const mockVersionResult: ResultSet = {
        insertId: undefined,
        rowsAffected: 0,
        rows: {
          length: 1,
          raw: () => [{ version: 2 }],
          item: (index: number) => (index === 0 ? { version: 2 } : null),
        },
      };

      mockDb.executeSql
        .mockResolvedValueOnce([mockCreateTableResult])
        .mockResolvedValueOnce([mockVersionResult]);

      await runMigrations(mockDb);

      // Should execute transaction 2 times (migrations 3 and 4)
      expect(mockDb.transaction).toHaveBeenCalledTimes(2);
    });

    it('should not run any migrations if already at latest version', async () => {
      const mockCreateTableResult: ResultSet = {
        insertId: undefined,
        rowsAffected: 0,
        rows: {
          length: 0,
          raw: () => [],
          item: () => null,
        },
      };

      const mockVersionResult: ResultSet = {
        insertId: undefined,
        rowsAffected: 0,
        rows: {
          length: 1,
          raw: () => [{ version: 4 }],
          item: (index: number) => (index === 0 ? { version: 4 } : null),
        },
      };

      mockDb.executeSql
        .mockResolvedValueOnce([mockCreateTableResult])
        .mockResolvedValueOnce([mockVersionResult]);

      await runMigrations(mockDb);

      // Should not execute any transactions
      expect(mockDb.transaction).not.toHaveBeenCalled();
    });

    it('should execute migration statements in order within a transaction', async () => {
      const mockCreateTableResult: ResultSet = {
        insertId: undefined,
        rowsAffected: 0,
        rows: {
          length: 0,
          raw: () => [],
          item: () => null,
        },
      };

      const mockVersionResult: ResultSet = {
        insertId: undefined,
        rowsAffected: 0,
        rows: {
          length: 1,
          raw: () => [{ version: 0 }],
          item: (index: number) => (index === 0 ? { version: 0 } : null),
        },
      };

      mockDb.executeSql
        .mockResolvedValueOnce([mockCreateTableResult])
        .mockResolvedValueOnce([mockVersionResult]);

      await runMigrations(mockDb);

      // Verify migration 1 (initial-schema) was executed
      const firstTransactionCall = (mockDb.transaction as jest.Mock).mock.calls[0];
      const executor = firstTransactionCall[0];

      executor(mockTx);

      // Migration 1 has 3 DDL statements + 2 indexes + 1 settings table = 6 statements total
      // Plus 1 INSERT into schema_migrations
      expect(mockTx.executeSql).toHaveBeenCalledWith(
        expect.stringContaining('CREATE TABLE IF NOT EXISTS categories'),
        []
      );
      expect(mockTx.executeSql).toHaveBeenCalledWith(
        expect.stringContaining('CREATE TABLE IF NOT EXISTS expenses'),
        []
      );
      expect(mockTx.executeSql).toHaveBeenCalledWith(
        expect.stringContaining('CREATE TABLE IF NOT EXISTS app_settings'),
        []
      );
      expect(mockTx.executeSql).toHaveBeenCalledWith(
        'INSERT INTO schema_migrations (version, name) VALUES (?, ?)',
        [1, 'initial-schema']
      );
    });

    it('should record each migration in schema_migrations table', async () => {
      const mockCreateTableResult: ResultSet = {
        insertId: undefined,
        rowsAffected: 0,
        rows: {
          length: 0,
          raw: () => [],
          item: () => null,
        },
      };

      const mockVersionResult: ResultSet = {
        insertId: undefined,
        rowsAffected: 0,
        rows: {
          length: 1,
          raw: () => [{ version: 3 }],
          item: (index: number) => (index === 0 ? { version: 3 } : null),
        },
      };

      mockDb.executeSql
        .mockResolvedValueOnce([mockCreateTableResult])
        .mockResolvedValueOnce([mockVersionResult]);

      await runMigrations(mockDb);

      // Should execute transaction 1 time (migration 4 only)
      expect(mockDb.transaction).toHaveBeenCalledTimes(1);

      const transactionCall = (mockDb.transaction as jest.Mock).mock.calls[0];
      const executor = transactionCall[0];

      executor(mockTx);

      expect(mockTx.executeSql).toHaveBeenCalledWith(
        'INSERT INTO schema_migrations (version, name) VALUES (?, ?)',
        [4, 'export-queue-file-uri']
      );
    });

    it('should handle empty schema_migrations table (version 0)', async () => {
      const mockCreateTableResult: ResultSet = {
        insertId: undefined,
        rowsAffected: 0,
        rows: {
          length: 0,
          raw: () => [],
          item: () => null,
        },
      };

      const mockVersionResult: ResultSet = {
        insertId: undefined,
        rowsAffected: 0,
        rows: {
          length: 0,
          raw: () => [],
          item: () => null,
        },
      };

      mockDb.executeSql
        .mockResolvedValueOnce([mockCreateTableResult])
        .mockResolvedValueOnce([mockVersionResult]);

      await runMigrations(mockDb);

      // Should run all 4 migrations
      expect(mockDb.transaction).toHaveBeenCalledTimes(4);
    });

    it('should apply migrations in version order', async () => {
      const mockCreateTableResult: ResultSet = {
        insertId: undefined,
        rowsAffected: 0,
        rows: {
          length: 0,
          raw: () => [],
          item: () => null,
        },
      };

      const mockVersionResult: ResultSet = {
        insertId: undefined,
        rowsAffected: 0,
        rows: {
          length: 1,
          raw: () => [{ version: 0 }],
          item: (index: number) => (index === 0 ? { version: 0 } : null),
        },
      };

      mockDb.executeSql
        .mockResolvedValueOnce([mockCreateTableResult])
        .mockResolvedValueOnce([mockVersionResult]);

      await runMigrations(mockDb);

      const transactionCalls = (mockDb.transaction as jest.Mock).mock.calls;

      // Execute all transactions and verify order
      const migrationNames: string[] = [];
      transactionCalls.forEach((call: unknown[]) => {
        const executor = call[0] as (tx: Transaction) => void;
        const capturedMockTx = {
          executeSql: jest.fn((sql: string, args?: unknown[]) => {
            if (sql.includes('INSERT INTO schema_migrations')) {
              migrationNames.push((args as [number, string])[1]);
            }
          }),
        } as unknown as Transaction;
        executor(capturedMockTx);
      });

      expect(migrationNames).toEqual([
        'initial-schema',
        'export-queue',
        'export-queue-metadata',
        'export-queue-file-uri',
      ]);
    });

    it('should execute migration statements with correct parameters', async () => {
      const mockCreateTableResult: ResultSet = {
        insertId: undefined,
        rowsAffected: 0,
        rows: {
          length: 0,
          raw: () => [],
          item: () => null,
        },
      };

      const mockVersionResult: ResultSet = {
        insertId: undefined,
        rowsAffected: 0,
        rows: {
          length: 1,
          raw: () => [{ version: 2 }],
          item: (index: number) => (index === 0 ? { version: 2 } : null),
        },
      };

      mockDb.executeSql
        .mockResolvedValueOnce([mockCreateTableResult])
        .mockResolvedValueOnce([mockVersionResult]);

      await runMigrations(mockDb);

      // Should execute migration 3 (export-queue-metadata)
      const transactionCall = (mockDb.transaction as jest.Mock).mock.calls[0];
      const executor = transactionCall[0];

      executor(mockTx);

      expect(mockTx.executeSql).toHaveBeenCalledWith(
        expect.stringContaining('ALTER TABLE export_queue ADD COLUMN uploaded_at TEXT NULL'),
        []
      );
      expect(mockTx.executeSql).toHaveBeenCalledWith(
        expect.stringContaining('ALTER TABLE export_queue ADD COLUMN drive_file_id TEXT NULL'),
        []
      );
    });
  });
});
