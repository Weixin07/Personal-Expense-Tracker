import type { SQLiteDatabase, ResultSet } from 'react-native-sqlite-storage';
import {
  createExpense,
  updateExpense,
  deleteExpense,
  getExpenseById,
  listExpenses,
} from '../expensesRepository';
import type { NewExpenseRecord, UpdateExpenseRecord } from '../../types';

describe('expensesRepository', () => {
  let mockDb: jest.Mocked<SQLiteDatabase>;

  beforeEach(() => {
    mockDb = {
      executeSql: jest.fn(),
    } as unknown as jest.Mocked<SQLiteDatabase>;
  });

  describe('createExpense', () => {
    it('should create an expense and return the created record', async () => {
      const newExpense: NewExpenseRecord = {
        description: 'Test expense',
        amountNative: 100.50,
        currencyCode: 'USD',
        fxRateToBase: 1.0,
        baseAmount: 100.50,
        date: '2025-01-15',
        categoryId: 1,
        notes: 'Test notes',
      };

      const mockInsertResult: ResultSet = {
        insertId: 42,
        rowsAffected: 1,
        rows: {
          length: 0,
          raw: () => [],
          item: () => null,
        },
      };

      const mockExpense = {
        id: 42,
        description: 'Test expense',
        amount_native: 100.50,
        currency_code: 'USD',
        fx_rate_to_base: 1.0,
        base_amount: 100.50,
        date: '2025-01-15',
        category_id: 1,
        notes: 'Test notes',
        created_at: '2025-01-15T10:00:00.000Z',
        updated_at: '2025-01-15T10:00:00.000Z',
      };

      const mockSelectResult: ResultSet = {
        insertId: undefined,
        rowsAffected: 0,
        rows: {
          length: 1,
          raw: () => [mockExpense],
          item: (index: number) => (index === 0 ? mockExpense : null),
        },
      };

      mockDb.executeSql
        .mockResolvedValueOnce([mockInsertResult])
        .mockResolvedValueOnce([mockSelectResult]);

      const result = await createExpense(mockDb, newExpense);

      expect(mockDb.executeSql).toHaveBeenCalledTimes(2);
      expect(mockDb.executeSql).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO expenses'),
        [
          'Test expense',
          100.50,
          'USD',
          1.0,
          100.50,
          '2025-01-15',
          1,
          'Test notes',
        ]
      );

      expect(result).toEqual({
        id: 42,
        description: 'Test expense',
        amountNative: 100.50,
        currencyCode: 'USD',
        fxRateToBase: 1.0,
        baseAmount: 100.50,
        date: '2025-01-15',
        categoryId: 1,
        notes: 'Test notes',
        createdAt: '2025-01-15T10:00:00.000Z',
        updatedAt: '2025-01-15T10:00:00.000Z',
      });
    });

    it('should handle null categoryId and notes', async () => {
      const newExpense: NewExpenseRecord = {
        description: 'Test expense',
        amountNative: 50.0,
        currencyCode: 'USD',
        fxRateToBase: 1.0,
        baseAmount: 50.0,
        date: '2025-01-15',
      };

      const mockInsertResult: ResultSet = {
        insertId: 43,
        rowsAffected: 1,
        rows: {
          length: 0,
          raw: () => [],
          item: () => null,
        },
      };

      const mockExpense = {
        id: 43,
        description: 'Test expense',
        amount_native: 50.0,
        currency_code: 'USD',
        fx_rate_to_base: 1.0,
        base_amount: 50.0,
        date: '2025-01-15',
        category_id: null,
        notes: null,
        created_at: '2025-01-15T10:00:00.000Z',
        updated_at: '2025-01-15T10:00:00.000Z',
      };

      const mockSelectResult: ResultSet = {
        insertId: undefined,
        rowsAffected: 0,
        rows: {
          length: 1,
          raw: () => [mockExpense],
          item: (index: number) => (index === 0 ? mockExpense : null),
        },
      };

      mockDb.executeSql
        .mockResolvedValueOnce([mockInsertResult])
        .mockResolvedValueOnce([mockSelectResult]);

      const result = await createExpense(mockDb, newExpense);

      expect(mockDb.executeSql).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO expenses'),
        ['Test expense', 50.0, 'USD', 1.0, 50.0, '2025-01-15', null, null]
      );

      expect(result.categoryId).toBeNull();
      expect(result.notes).toBeNull();
    });

    it('should throw error if insertId is not returned', async () => {
      const newExpense: NewExpenseRecord = {
        description: 'Test expense',
        amountNative: 100.50,
        currencyCode: 'USD',
        fxRateToBase: 1.0,
        baseAmount: 100.50,
        date: '2025-01-15',
      };

      const mockInsertResult: ResultSet = {
        insertId: undefined,
        rowsAffected: 1,
        rows: {
          length: 0,
          raw: () => [],
          item: () => null,
        },
      };

      mockDb.executeSql.mockResolvedValueOnce([mockInsertResult]);

      await expect(createExpense(mockDb, newExpense)).rejects.toThrow(
        'Failed to determine inserted expense ID'
      );
    });

    it('should throw error if expense cannot be loaded after insert', async () => {
      const newExpense: NewExpenseRecord = {
        description: 'Test expense',
        amountNative: 100.50,
        currencyCode: 'USD',
        fxRateToBase: 1.0,
        baseAmount: 100.50,
        date: '2025-01-15',
      };

      const mockInsertResult: ResultSet = {
        insertId: 42,
        rowsAffected: 1,
        rows: {
          length: 0,
          raw: () => [],
          item: () => null,
        },
      };

      const mockSelectResult: ResultSet = {
        insertId: undefined,
        rowsAffected: 0,
        rows: {
          length: 0,
          raw: () => [],
          item: () => null,
        },
      };

      mockDb.executeSql
        .mockResolvedValueOnce([mockInsertResult])
        .mockResolvedValueOnce([mockSelectResult]);

      await expect(createExpense(mockDb, newExpense)).rejects.toThrow(
        'Failed to load inserted expense'
      );
    });
  });

  describe('updateExpense', () => {
    it('should update an expense and return the updated record', async () => {
      const updatePayload: UpdateExpenseRecord = {
        id: 42,
        description: 'Updated expense',
        amountNative: 200.75,
        currencyCode: 'EUR',
        fxRateToBase: 1.1,
        baseAmount: 220.825,
        date: '2025-01-16',
        categoryId: 2,
        notes: 'Updated notes',
      };

      const mockUpdateResult: ResultSet = {
        insertId: undefined,
        rowsAffected: 1,
        rows: {
          length: 0,
          raw: () => [],
          item: () => null,
        },
      };

      const mockExpense = {
        id: 42,
        description: 'Updated expense',
        amount_native: 200.75,
        currency_code: 'EUR',
        fx_rate_to_base: 1.1,
        base_amount: 220.825,
        date: '2025-01-16',
        category_id: 2,
        notes: 'Updated notes',
        created_at: '2025-01-15T10:00:00.000Z',
        updated_at: '2025-01-16T10:00:00.000Z',
      };

      const mockSelectResult: ResultSet = {
        insertId: undefined,
        rowsAffected: 0,
        rows: {
          length: 1,
          raw: () => [mockExpense],
          item: (index: number) => (index === 0 ? mockExpense : null),
        },
      };

      mockDb.executeSql
        .mockResolvedValueOnce([mockUpdateResult])
        .mockResolvedValueOnce([mockSelectResult]);

      const result = await updateExpense(mockDb, updatePayload);

      expect(mockDb.executeSql).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE expenses SET'),
        [
          'Updated expense',
          200.75,
          'EUR',
          1.1,
          220.825,
          '2025-01-16',
          2,
          'Updated notes',
          42,
        ]
      );

      expect(result).toEqual({
        id: 42,
        description: 'Updated expense',
        amountNative: 200.75,
        currencyCode: 'EUR',
        fxRateToBase: 1.1,
        baseAmount: 220.825,
        date: '2025-01-16',
        categoryId: 2,
        notes: 'Updated notes',
        createdAt: '2025-01-15T10:00:00.000Z',
        updatedAt: '2025-01-16T10:00:00.000Z',
      });
    });

    it('should throw error if expense not found', async () => {
      const updatePayload: UpdateExpenseRecord = {
        id: 999,
        description: 'Updated expense',
        amountNative: 200.75,
        currencyCode: 'EUR',
        fxRateToBase: 1.1,
        baseAmount: 220.825,
        date: '2025-01-16',
      };

      const mockUpdateResult: ResultSet = {
        insertId: undefined,
        rowsAffected: 0,
        rows: {
          length: 0,
          raw: () => [],
          item: () => null,
        },
      };

      mockDb.executeSql.mockResolvedValueOnce([mockUpdateResult]);

      await expect(updateExpense(mockDb, updatePayload)).rejects.toThrow(
        'Expense 999 not found'
      );
    });

    it('should handle null categoryId and notes', async () => {
      const updatePayload: UpdateExpenseRecord = {
        id: 42,
        description: 'Updated expense',
        amountNative: 200.75,
        currencyCode: 'EUR',
        fxRateToBase: 1.1,
        baseAmount: 220.825,
        date: '2025-01-16',
        categoryId: null,
        notes: null,
      };

      const mockUpdateResult: ResultSet = {
        insertId: undefined,
        rowsAffected: 1,
        rows: {
          length: 0,
          raw: () => [],
          item: () => null,
        },
      };

      const mockExpense = {
        id: 42,
        description: 'Updated expense',
        amount_native: 200.75,
        currency_code: 'EUR',
        fx_rate_to_base: 1.1,
        base_amount: 220.825,
        date: '2025-01-16',
        category_id: null,
        notes: null,
        created_at: '2025-01-15T10:00:00.000Z',
        updated_at: '2025-01-16T10:00:00.000Z',
      };

      const mockSelectResult: ResultSet = {
        insertId: undefined,
        rowsAffected: 0,
        rows: {
          length: 1,
          raw: () => [mockExpense],
          item: (index: number) => (index === 0 ? mockExpense : null),
        },
      };

      mockDb.executeSql
        .mockResolvedValueOnce([mockUpdateResult])
        .mockResolvedValueOnce([mockSelectResult]);

      const result = await updateExpense(mockDb, updatePayload);

      expect(result.categoryId).toBeNull();
      expect(result.notes).toBeNull();
    });
  });

  describe('deleteExpense', () => {
    it('should delete an expense', async () => {
      const mockDeleteResult: ResultSet = {
        insertId: undefined,
        rowsAffected: 1,
        rows: {
          length: 0,
          raw: () => [],
          item: () => null,
        },
      };

      mockDb.executeSql.mockResolvedValueOnce([mockDeleteResult]);

      await deleteExpense(mockDb, 42);

      expect(mockDb.executeSql).toHaveBeenCalledWith(
        'DELETE FROM expenses WHERE id = ?',
        [42]
      );
    });

    it('should throw error if expense not found', async () => {
      const mockDeleteResult: ResultSet = {
        insertId: undefined,
        rowsAffected: 0,
        rows: {
          length: 0,
          raw: () => [],
          item: () => null,
        },
      };

      mockDb.executeSql.mockResolvedValueOnce([mockDeleteResult]);

      await expect(deleteExpense(mockDb, 999)).rejects.toThrow(
        'Expense 999 not found'
      );
    });
  });

  describe('getExpenseById', () => {
    it('should return an expense by id', async () => {
      const mockExpense = {
        id: 42,
        description: 'Test expense',
        amount_native: 100.50,
        currency_code: 'USD',
        fx_rate_to_base: 1.0,
        base_amount: 100.50,
        date: '2025-01-15',
        category_id: 1,
        notes: 'Test notes',
        created_at: '2025-01-15T10:00:00.000Z',
        updated_at: '2025-01-15T10:00:00.000Z',
      };

      const mockSelectResult: ResultSet = {
        insertId: undefined,
        rowsAffected: 0,
        rows: {
          length: 1,
          raw: () => [mockExpense],
          item: (index: number) => (index === 0 ? mockExpense : null),
        },
      };

      mockDb.executeSql.mockResolvedValueOnce([mockSelectResult]);

      const result = await getExpenseById(mockDb, 42);

      expect(mockDb.executeSql).toHaveBeenCalledWith(
        expect.stringContaining('SELECT'),
        [42]
      );

      expect(result).toEqual({
        id: 42,
        description: 'Test expense',
        amountNative: 100.50,
        currencyCode: 'USD',
        fxRateToBase: 1.0,
        baseAmount: 100.50,
        date: '2025-01-15',
        categoryId: 1,
        notes: 'Test notes',
        createdAt: '2025-01-15T10:00:00.000Z',
        updatedAt: '2025-01-15T10:00:00.000Z',
      });
    });

    it('should return null if expense not found', async () => {
      const mockSelectResult: ResultSet = {
        insertId: undefined,
        rowsAffected: 0,
        rows: {
          length: 0,
          raw: () => [],
          item: () => null,
        },
      };

      mockDb.executeSql.mockResolvedValueOnce([mockSelectResult]);

      const result = await getExpenseById(mockDb, 999);

      expect(result).toBeNull();
    });
  });

  describe('listExpenses', () => {
    it('should return all expenses with no filters', async () => {
      const mockExpenses = [
        {
          id: 1,
          description: 'Expense 1',
          amount_native: 100.0,
          currency_code: 'USD',
          fx_rate_to_base: 1.0,
          base_amount: 100.0,
          date: '2025-01-15',
          category_id: 1,
          notes: null,
          created_at: '2025-01-15T10:00:00.000Z',
          updated_at: '2025-01-15T10:00:00.000Z',
        },
        {
          id: 2,
          description: 'Expense 2',
          amount_native: 200.0,
          currency_code: 'EUR',
          fx_rate_to_base: 1.1,
          base_amount: 220.0,
          date: '2025-01-14',
          category_id: 2,
          notes: 'Test',
          created_at: '2025-01-14T10:00:00.000Z',
          updated_at: '2025-01-14T10:00:00.000Z',
        },
      ];

      const mockSelectResult: ResultSet = {
        insertId: undefined,
        rowsAffected: 0,
        rows: {
          length: 2,
          raw: () => mockExpenses,
          item: (index: number) => mockExpenses[index] ?? null,
        },
      };

      mockDb.executeSql.mockResolvedValueOnce([mockSelectResult]);

      const result = await listExpenses(mockDb);

      expect(mockDb.executeSql).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY date DESC, id DESC'),
        []
      );

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe(1);
      expect(result[1].id).toBe(2);
    });

    it('should filter by categoryId', async () => {
      const mockExpense = {
        id: 1,
        description: 'Expense 1',
        amount_native: 100.0,
        currency_code: 'USD',
        fx_rate_to_base: 1.0,
        base_amount: 100.0,
        date: '2025-01-15',
        category_id: 1,
        notes: null,
        created_at: '2025-01-15T10:00:00.000Z',
        updated_at: '2025-01-15T10:00:00.000Z',
      };

      const mockSelectResult: ResultSet = {
        insertId: undefined,
        rowsAffected: 0,
        rows: {
          length: 1,
          raw: () => [mockExpense],
          item: (index: number) => (index === 0 ? mockExpense : null),
        },
      };

      mockDb.executeSql.mockResolvedValueOnce([mockSelectResult]);

      const result = await listExpenses(mockDb, { categoryId: 1 });

      expect(mockDb.executeSql).toHaveBeenCalledWith(
        expect.stringContaining('WHERE category_id = ?'),
        [1]
      );

      expect(result).toHaveLength(1);
      expect(result[0].categoryId).toBe(1);
    });

    it('should filter by date range', async () => {
      const mockExpense = {
        id: 1,
        description: 'Expense 1',
        amount_native: 100.0,
        currency_code: 'USD',
        fx_rate_to_base: 1.0,
        base_amount: 100.0,
        date: '2025-01-15',
        category_id: 1,
        notes: null,
        created_at: '2025-01-15T10:00:00.000Z',
        updated_at: '2025-01-15T10:00:00.000Z',
      };

      const mockSelectResult: ResultSet = {
        insertId: undefined,
        rowsAffected: 0,
        rows: {
          length: 1,
          raw: () => [mockExpense],
          item: (index: number) => (index === 0 ? mockExpense : null),
        },
      };

      mockDb.executeSql.mockResolvedValueOnce([mockSelectResult]);

      const result = await listExpenses(mockDb, {
        startDate: '2025-01-10',
        endDate: '2025-01-20',
      });

      expect(mockDb.executeSql).toHaveBeenCalledWith(
        expect.stringContaining('WHERE date >= ? AND date <= ?'),
        ['2025-01-10', '2025-01-20']
      );

      expect(result).toHaveLength(1);
    });

    it('should apply limit and offset', async () => {
      const mockExpenses = [
        {
          id: 2,
          description: 'Expense 2',
          amount_native: 200.0,
          currency_code: 'EUR',
          fx_rate_to_base: 1.1,
          base_amount: 220.0,
          date: '2025-01-14',
          category_id: 2,
          notes: 'Test',
          created_at: '2025-01-14T10:00:00.000Z',
          updated_at: '2025-01-14T10:00:00.000Z',
        },
      ];

      const mockSelectResult: ResultSet = {
        insertId: undefined,
        rowsAffected: 0,
        rows: {
          length: 1,
          raw: () => mockExpenses,
          item: (index: number) => mockExpenses[index] ?? null,
        },
      };

      mockDb.executeSql.mockResolvedValueOnce([mockSelectResult]);

      const result = await listExpenses(mockDb, { limit: 10, offset: 5 });

      expect(mockDb.executeSql).toHaveBeenCalledWith(
        expect.stringContaining('LIMIT ? OFFSET ?'),
        [10, 5]
      );

      expect(result).toHaveLength(1);
    });

    it('should combine multiple filters', async () => {
      const mockExpense = {
        id: 1,
        description: 'Expense 1',
        amount_native: 100.0,
        currency_code: 'USD',
        fx_rate_to_base: 1.0,
        base_amount: 100.0,
        date: '2025-01-15',
        category_id: 1,
        notes: null,
        created_at: '2025-01-15T10:00:00.000Z',
        updated_at: '2025-01-15T10:00:00.000Z',
      };

      const mockSelectResult: ResultSet = {
        insertId: undefined,
        rowsAffected: 0,
        rows: {
          length: 1,
          raw: () => [mockExpense],
          item: (index: number) => (index === 0 ? mockExpense : null),
        },
      };

      mockDb.executeSql.mockResolvedValueOnce([mockSelectResult]);

      const result = await listExpenses(mockDb, {
        categoryId: 1,
        startDate: '2025-01-10',
        endDate: '2025-01-20',
        limit: 10,
      });

      expect(mockDb.executeSql).toHaveBeenCalledWith(
        expect.stringContaining('WHERE category_id = ? AND date >= ? AND date <= ?'),
        [1, '2025-01-10', '2025-01-20', 10]
      );

      expect(result).toHaveLength(1);
    });
  });
});
