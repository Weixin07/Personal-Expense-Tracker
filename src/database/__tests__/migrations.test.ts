import type {
  SQLiteDatabase,
  ResultSet,
  Transaction,
} from 'react-native-sqlite-storage';
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
      expect(version).toBe(12);
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
        .mockResolvedValueOnce([mockCreateTableResult])
        .mockResolvedValueOnce([mockVersionResult]);

      await runMigrations(mockDb);

      expect(mockDb.executeSql).toHaveBeenCalledWith(
        expect.stringContaining('CREATE TABLE IF NOT EXISTS schema_migrations'),
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

      expect(mockDb.transaction).toHaveBeenCalledTimes(12);
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

      expect(mockDb.transaction).toHaveBeenCalledTimes(10);
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
          raw: () => [{ version: 12 }],
          item: (index: number) => (index === 0 ? { version: 12 } : null),
        },
      };

      mockDb.executeSql
        .mockResolvedValueOnce([mockCreateTableResult])
        .mockResolvedValueOnce([mockVersionResult]);

      await runMigrations(mockDb);

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

      const firstTransactionCall = (mockDb.transaction as jest.Mock).mock
        .calls[0];
      const executor = firstTransactionCall[0];

      executor(mockTx);

      expect(mockTx.executeSql).toHaveBeenCalledWith(
        expect.stringContaining('CREATE TABLE IF NOT EXISTS categories'),
        [],
      );
      expect(mockTx.executeSql).toHaveBeenCalledWith(
        expect.stringContaining('CREATE TABLE IF NOT EXISTS expenses'),
        [],
      );
      expect(mockTx.executeSql).toHaveBeenCalledWith(
        expect.stringContaining('CREATE TABLE IF NOT EXISTS app_settings'),
        [],
      );
      expect(mockTx.executeSql).toHaveBeenCalledWith(
        'INSERT INTO schema_migrations (version, name) VALUES (?, ?)',
        [1, 'initial-schema'],
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

      expect(mockDb.transaction).toHaveBeenCalledTimes(9);

      const transactionCall = (mockDb.transaction as jest.Mock).mock.calls[0];
      const executor = transactionCall[0];

      executor(mockTx);

      expect(mockTx.executeSql).toHaveBeenCalledWith(
        'INSERT INTO schema_migrations (version, name) VALUES (?, ?)',
        [4, 'export-queue-file-uri'],
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

      expect(mockDb.transaction).toHaveBeenCalledTimes(12);
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
        'expense-base-currency-and-fx-cache',
        'expense-payee',
        'rename-expenses-to-transactions',
        'transaction-and-category-type',
        'add-transaction-time',
        'funds-and-transfers',
        'transfer-counterpart-currency-required',
        'transaction-confirmed-flag',
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

      // The first transaction past version 2 is migration 3.
      const transactionCall = (mockDb.transaction as jest.Mock).mock.calls[0];
      const executor = transactionCall[0];

      executor(mockTx);

      expect(mockTx.executeSql).toHaveBeenCalledWith(
        expect.stringContaining(
          'ALTER TABLE export_queue ADD COLUMN uploaded_at TEXT NULL',
        ),
        [],
      );
      expect(mockTx.executeSql).toHaveBeenCalledWith(
        expect.stringContaining(
          'ALTER TABLE export_queue ADD COLUMN drive_file_id TEXT NULL',
        ),
        [],
      );
    });

    it('should add base currency column and fx-rate cache in migration 5', async () => {
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

      const transactionCall = (mockDb.transaction as jest.Mock).mock.calls[0];
      const executor = transactionCall[0];

      executor(mockTx);

      expect(mockTx.executeSql).toHaveBeenCalledWith(
        expect.stringContaining(
          'ALTER TABLE expenses ADD COLUMN base_currency_code TEXT NULL',
        ),
        [],
      );
      expect(mockTx.executeSql).toHaveBeenCalledWith(
        expect.stringContaining('CREATE TABLE IF NOT EXISTS currency_fx_rates'),
        [],
      );
      expect(mockTx.executeSql).toHaveBeenCalledWith(
        'INSERT INTO schema_migrations (version, name) VALUES (?, ?)',
        [5, 'expense-base-currency-and-fx-cache'],
      );
    });

    it('should add the payee column with a backfill default in migration 6', async () => {
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
          raw: () => [{ version: 5 }],
          item: (index: number) => (index === 0 ? { version: 5 } : null),
        },
      };

      mockDb.executeSql
        .mockResolvedValueOnce([mockCreateTableResult])
        .mockResolvedValueOnce([mockVersionResult]);

      await runMigrations(mockDb);

      const transactionCall = (mockDb.transaction as jest.Mock).mock.calls[0];
      const executor = transactionCall[0];

      executor(mockTx);

      expect(mockTx.executeSql).toHaveBeenCalledWith(
        expect.stringContaining(
          "ALTER TABLE expenses ADD COLUMN payee TEXT NOT NULL DEFAULT 'Unknown'",
        ),
        [],
      );
      expect(mockTx.executeSql).toHaveBeenCalledWith(
        'INSERT INTO schema_migrations (version, name) VALUES (?, ?)',
        [6, 'expense-payee'],
      );
    });

    it('should rename the expenses table and its indexes in migration 7', async () => {
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
          raw: () => [{ version: 6 }],
          item: (index: number) => (index === 0 ? { version: 6 } : null),
        },
      };

      mockDb.executeSql
        .mockResolvedValueOnce([mockCreateTableResult])
        .mockResolvedValueOnce([mockVersionResult]);

      await runMigrations(mockDb);

      const transactionCall = (mockDb.transaction as jest.Mock).mock.calls[0];
      const executor = transactionCall[0];

      executor(mockTx);

      expect(mockTx.executeSql).toHaveBeenCalledWith(
        expect.stringContaining('ALTER TABLE expenses RENAME TO transactions'),
        [],
      );
      expect(mockTx.executeSql).toHaveBeenCalledWith(
        expect.stringContaining('DROP INDEX IF EXISTS idx_expenses_date'),
        [],
      );
      expect(mockTx.executeSql).toHaveBeenCalledWith(
        expect.stringContaining(
          'DROP INDEX IF EXISTS idx_expenses_category_id',
        ),
        [],
      );
      expect(mockTx.executeSql).toHaveBeenCalledWith(
        expect.stringContaining(
          'CREATE INDEX IF NOT EXISTS idx_transactions_date ON transactions(date DESC)',
        ),
        [],
      );
      expect(mockTx.executeSql).toHaveBeenCalledWith(
        expect.stringContaining(
          'CREATE INDEX IF NOT EXISTS idx_transactions_category_id ON transactions(category_id)',
        ),
        [],
      );
      expect(mockTx.executeSql).toHaveBeenCalledWith(
        'INSERT INTO schema_migrations (version, name) VALUES (?, ?)',
        [7, 'rename-expenses-to-transactions'],
      );
    });

    it('should add the type columns with backfilling defaults in migration 8', async () => {
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
          raw: () => [{ version: 7 }],
          item: (index: number) => (index === 0 ? { version: 7 } : null),
        },
      };

      mockDb.executeSql
        .mockResolvedValueOnce([mockCreateTableResult])
        .mockResolvedValueOnce([mockVersionResult]);

      await runMigrations(mockDb);

      const transactionCall = (mockDb.transaction as jest.Mock).mock.calls[0];
      const executor = transactionCall[0];

      executor(mockTx);

      expect(mockTx.executeSql).toHaveBeenCalledWith(
        expect.stringContaining(
          "ALTER TABLE transactions ADD COLUMN type TEXT NOT NULL DEFAULT 'expense'",
        ),
        [],
      );
      expect(mockTx.executeSql).toHaveBeenCalledWith(
        expect.stringContaining(
          "ALTER TABLE categories ADD COLUMN type TEXT NOT NULL DEFAULT 'both'",
        ),
        [],
      );
      expect(mockTx.executeSql).toHaveBeenCalledWith(
        'INSERT INTO schema_migrations (version, name) VALUES (?, ?)',
        [8, 'transaction-and-category-type'],
      );
    });

    it('should add the nullable time column and reindex in migration 9', async () => {
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
          raw: () => [{ version: 8 }],
          item: (index: number) => (index === 0 ? { version: 8 } : null),
        },
      };

      mockDb.executeSql
        .mockResolvedValueOnce([mockCreateTableResult])
        .mockResolvedValueOnce([mockVersionResult]);

      await runMigrations(mockDb);

      const transactionCall = (mockDb.transaction as jest.Mock).mock.calls[0];
      const executor = transactionCall[0];

      const statements: string[] = [];
      const capturedTx = {
        executeSql: jest.fn((sql: string) => {
          statements.push(sql);
        }),
      } as unknown as Transaction;
      executor(capturedTx);

      expect(statements[0]).toContain(
        'ALTER TABLE transactions ADD COLUMN time TEXT NULL',
      );
      expect(statements[0]).toContain(
        'CHECK (time IS NULL OR LENGTH(time) = 5)',
      );
      expect(statements[1]).toContain(
        'DROP INDEX IF EXISTS idx_transactions_date',
      );
      expect(statements[2]).toContain(
        'CREATE INDEX IF NOT EXISTS idx_transactions_date_time ON transactions(date DESC, time DESC)',
      );
    });

    it('should add the time column before the index that references it', async () => {
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
          raw: () => [{ version: 8 }],
          item: (index: number) => (index === 0 ? { version: 8 } : null),
        },
      };

      mockDb.executeSql
        .mockResolvedValueOnce([mockCreateTableResult])
        .mockResolvedValueOnce([mockVersionResult]);

      await runMigrations(mockDb);

      const executor = (mockDb.transaction as jest.Mock).mock.calls[0][0];
      const statements: string[] = [];
      const capturedTx = {
        executeSql: jest.fn((sql: string) => {
          statements.push(sql);
        }),
      } as unknown as Transaction;
      executor(capturedTx);

      const addColumnIndex = statements.findIndex(sql =>
        sql.includes('ADD COLUMN time'),
      );
      const createIndexIndex = statements.findIndex(sql =>
        sql.includes('idx_transactions_date_time'),
      );

      expect(addColumnIndex).toBeGreaterThanOrEqual(0);
      expect(createIndexIndex).toBeGreaterThan(addColumnIndex);
    });
  });
});

describe('migration v10 rebuild', () => {
  const statementsOf = (
    version: number,
  ): { db: jest.Mocked<SQLiteDatabase>; captured: string[] } => {
    const captured: string[] = [];
    const mockTx = {
      executeSql: jest.fn((sql: string) => {
        captured.push(sql);
      }),
    } as unknown as Transaction;

    const db = {
      executeSql: jest
        .fn()
        .mockResolvedValueOnce([
          {
            insertId: undefined,
            rowsAffected: 0,
            rows: { length: 0, raw: () => [], item: () => null },
          } as unknown as ResultSet,
        ])
        .mockResolvedValueOnce([
          {
            insertId: undefined,
            rowsAffected: 0,
            rows: {
              length: 1,
              raw: () => [{ version: version - 1 }],
              item: (index: number) =>
                index === 0 ? { version: version - 1 } : null,
            },
          } as unknown as ResultSet,
        ]),
      transaction: jest.fn(
        (
          executor: (tx: Transaction) => void,
          _onError?: unknown,
          onSuccess?: () => void,
        ) => {
          executor(mockTx);
          onSuccess?.();
        },
      ),
    } as unknown as jest.Mocked<SQLiteDatabase>;

    return { db, captured };
  };

  it('carries every column across and backfills the fund', async () => {
    const { db, captured } = statementsOf(10);
    await runMigrations(db);

    const copy = captured.find(sql =>
      sql.includes('INSERT INTO transactions_new'),
    );
    expect(copy).toBeDefined();
    [
      'id',
      'type',
      'description',
      'payee',
      'amount_native',
      'currency_code',
      'fx_rate_to_base',
      'base_amount',
      'base_currency_code',
      'date',
      'time',
      'category_id',
      'notes',
      'created_at',
      'updated_at',
    ].forEach(column => {
      expect(copy).toContain(column);
    });
    expect(copy).toContain("SELECT id FROM funds WHERE name = 'General'");
    expect(copy).toContain('FROM transactions;');
  });

  it('recreates every index the rebuild drops', async () => {
    const { db, captured } = statementsOf(10);
    await runMigrations(db);

    const created = captured.filter(sql => sql.includes('CREATE INDEX'));
    expect(created.join(' ')).toContain('idx_transactions_date_time');
    expect(created.join(' ')).toContain('idx_transactions_category_id');
    expect(created.join(' ')).toContain('idx_transactions_fund_id');
  });

  it('drops the old table only after the copy', async () => {
    const { db, captured } = statementsOf(10);
    await runMigrations(db);

    const copyAt = captured.findIndex(sql =>
      sql.includes('INSERT INTO transactions_new'),
    );
    const dropAt = captured.findIndex(sql =>
      sql.includes('DROP TABLE transactions;'),
    );
    const renameAt = captured.findIndex(sql => sql.includes('RENAME TO'));
    expect(copyAt).toBeGreaterThanOrEqual(0);
    expect(dropAt).toBeGreaterThan(copyAt);
    expect(renameAt).toBeGreaterThan(dropAt);
  });

  it('creates the default fund before anything references it', async () => {
    const { db, captured } = statementsOf(10);
    await runMigrations(db);

    const insertFundAt = captured.findIndex(sql =>
      sql.includes('INSERT INTO funds'),
    );
    const copyAt = captured.findIndex(sql =>
      sql.includes('INSERT INTO transactions_new'),
    );
    expect(insertFundAt).toBeGreaterThanOrEqual(0);
    expect(copyAt).toBeGreaterThan(insertFundAt);
  });

  it('binds the transfer shape to the type', async () => {
    const { db, captured } = statementsOf(10);
    await runMigrations(db);

    const create = captured.find(sql =>
      sql.includes('CREATE TABLE transactions_new'),
    );
    expect(create).toContain("type IN ('expense','income','transfer')");
    expect(create).toContain('counterpart_fund_id <> fund_id');
    expect(create).toContain('ON DELETE RESTRICT');
  });
});
