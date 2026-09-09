import type { SQLiteDatabase, ResultSet } from 'react-native-sqlite-storage';
import {
  createTransaction,
  createTransactionsBulk,
  updateTransaction,
  deleteTransaction,
  setTransactionConfirmed,
  getTransactionById,
  listTransactions,
} from '../transactionsRepository';
import type {
  NewTransactionRecord,
  UpdateTransactionRecord,
} from '../../types';

const makeNewExpense = (
  overrides: Partial<NewTransactionRecord> = {},
): NewTransactionRecord => ({
  type: 'expense',
  description: 'Item',
  payee: 'Store',
  amountNative: 10,
  currencyCode: 'USD',
  fxRateToBase: 1,
  baseAmount: 10,
  baseCurrencyCode: 'USD',
  date: '2025-01-15',
  time: null,
  categoryId: null,
  fundId: 1,
  counterpartFundId: null,
  counterpartAmount: null,
  counterpartCurrencyCode: null,
  notes: null,
  ...overrides,
});

describe('transactionsRepository', () => {
  let mockDb: jest.Mocked<SQLiteDatabase>;

  beforeEach(() => {
    mockDb = {
      executeSql: jest.fn(),
    } as unknown as jest.Mocked<SQLiteDatabase>;
  });

  describe('createTransaction', () => {
    it('should create an expense and return the created record', async () => {
      const newExpense: NewTransactionRecord = {
        type: 'expense',
        description: 'Test expense',
        payee: 'Acme Store',
        amountNative: 100.5,
        currencyCode: 'USD',
        fxRateToBase: 1.0,
        baseAmount: 100.5,
        baseCurrencyCode: 'USD',
        date: '2025-01-15',
        time: null,
        categoryId: 1,
        fundId: 1,
        counterpartFundId: null,
        counterpartAmount: null,
        counterpartCurrencyCode: null,
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
        payee: 'Acme Store',
        amount_native: 100.5,
        currency_code: 'USD',
        fx_rate_to_base: 1.0,
        base_amount: 100.5,
        base_currency_code: 'USD',
        date: '2025-01-15',
        category_id: 1,
        fund_id: 1,
        counterpart_fund_id: null,
        counterpart_amount: null,
        counterpart_currency_code: null,
        notes: 'Test notes',
        is_confirmed: 1,
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

      const result = await createTransaction(mockDb, newExpense);

      expect(mockDb.executeSql).toHaveBeenCalledTimes(2);
      expect(mockDb.executeSql).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO transactions'),
        [
          'expense',
          'Test expense',
          'Acme Store',
          100.5,
          'USD',
          1.0,
          100.5,
          'USD',
          '2025-01-15',
          null,
          1,
          1,
          null,
          null,
          null,
          'Test notes',
          1,
        ],
      );

      expect(result).toEqual({
        id: 42,
        description: 'Test expense',
        payee: 'Acme Store',
        amountNative: 100.5,
        currencyCode: 'USD',
        fxRateToBase: 1.0,
        baseAmount: 100.5,
        baseCurrencyCode: 'USD',
        date: '2025-01-15',
        time: null,
        categoryId: 1,
        fundId: 1,
        counterpartFundId: null,
        counterpartAmount: null,
        counterpartCurrencyCode: null,
        notes: 'Test notes',
        isConfirmed: true,
        createdAt: '2025-01-15T10:00:00.000Z',
        updatedAt: '2025-01-15T10:00:00.000Z',
      });
    });

    it('should handle null categoryId and notes', async () => {
      const newExpense: NewTransactionRecord = {
        type: 'expense',
        description: 'Test expense',
        payee: 'Acme Store',
        amountNative: 50.0,
        currencyCode: 'USD',
        fxRateToBase: 1.0,
        baseAmount: 50.0,
        baseCurrencyCode: null,
        date: '2025-01-15',
        time: null,
        categoryId: null,
        fundId: 1,
        counterpartFundId: null,
        counterpartAmount: null,
        counterpartCurrencyCode: null,
        notes: null,
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
        payee: 'Acme Store',
        amount_native: 50.0,
        currency_code: 'USD',
        fx_rate_to_base: 1.0,
        base_amount: 50.0,
        base_currency_code: null,
        date: '2025-01-15',
        category_id: null,
        fund_id: 1,
        counterpart_fund_id: null,
        counterpart_amount: null,
        counterpart_currency_code: null,
        notes: null,
        is_confirmed: 1,
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

      const result = await createTransaction(mockDb, newExpense);

      expect(mockDb.executeSql).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO transactions'),
        [
          'expense',
          'Test expense',
          'Acme Store',
          50.0,
          'USD',
          1.0,
          50.0,
          null,
          '2025-01-15',
          null,
          null,
          1,
          null,
          null,
          null,
          null,
          1,
        ],
      );

      expect(result.categoryId).toBeNull();
      expect(result.notes).toBeNull();
    });

    it('should throw error if insertId is not returned', async () => {
      const newExpense: NewTransactionRecord = {
        type: 'expense',
        description: 'Test expense',
        payee: 'Acme Store',
        amountNative: 100.5,
        currencyCode: 'USD',
        fxRateToBase: 1.0,
        baseAmount: 100.5,
        baseCurrencyCode: 'USD',
        date: '2025-01-15',
        time: null,
        categoryId: null,
        fundId: 1,
        counterpartFundId: null,
        counterpartAmount: null,
        counterpartCurrencyCode: null,
        notes: null,
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

      await expect(createTransaction(mockDb, newExpense)).rejects.toThrow(
        'Failed to determine inserted transaction ID',
      );
    });

    it('should throw error if expense cannot be loaded after insert', async () => {
      const newExpense: NewTransactionRecord = {
        type: 'expense',
        description: 'Test expense',
        payee: 'Acme Store',
        amountNative: 100.5,
        currencyCode: 'USD',
        fxRateToBase: 1.0,
        baseAmount: 100.5,
        baseCurrencyCode: 'USD',
        date: '2025-01-15',
        time: null,
        categoryId: null,
        fundId: 1,
        counterpartFundId: null,
        counterpartAmount: null,
        counterpartCurrencyCode: null,
        notes: null,
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

      await expect(createTransaction(mockDb, newExpense)).rejects.toThrow(
        'Failed to load inserted transaction',
      );
    });
  });

  describe('updateTransaction', () => {
    it('should update an expense and return the updated record', async () => {
      const updatePayload: UpdateTransactionRecord = {
        type: 'expense',
        id: 42,
        description: 'Updated expense',
        payee: 'Acme Store',
        amountNative: 200.75,
        currencyCode: 'EUR',
        fxRateToBase: 1.1,
        baseAmount: 220.825,
        baseCurrencyCode: 'USD',
        date: '2025-01-16',
        time: null,
        categoryId: 2,
        fundId: 1,
        counterpartFundId: null,
        counterpartAmount: null,
        counterpartCurrencyCode: null,
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
        payee: 'Acme Store',
        amount_native: 200.75,
        currency_code: 'EUR',
        fx_rate_to_base: 1.1,
        base_amount: 220.825,
        base_currency_code: 'USD',
        date: '2025-01-16',
        category_id: 2,
        fund_id: 1,
        counterpart_fund_id: null,
        counterpart_amount: null,
        counterpart_currency_code: null,
        notes: 'Updated notes',
        is_confirmed: 1,
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

      const result = await updateTransaction(mockDb, updatePayload);

      expect(mockDb.executeSql).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE transactions SET'),
        [
          'expense',
          'Updated expense',
          'Acme Store',
          200.75,
          'EUR',
          1.1,
          220.825,
          'USD',
          '2025-01-16',
          null,
          2,
          1,
          null,
          null,
          null,
          'Updated notes',
          42,
        ],
      );

      expect(result).toEqual({
        id: 42,
        description: 'Updated expense',
        payee: 'Acme Store',
        amountNative: 200.75,
        currencyCode: 'EUR',
        fxRateToBase: 1.1,
        baseAmount: 220.825,
        baseCurrencyCode: 'USD',
        date: '2025-01-16',
        time: null,
        categoryId: 2,
        fundId: 1,
        counterpartFundId: null,
        counterpartAmount: null,
        counterpartCurrencyCode: null,
        notes: 'Updated notes',
        isConfirmed: true,
        createdAt: '2025-01-15T10:00:00.000Z',
        updatedAt: '2025-01-16T10:00:00.000Z',
      });
    });

    it('should throw error if expense not found', async () => {
      const updatePayload: UpdateTransactionRecord = {
        type: 'expense',
        id: 999,
        description: 'Updated expense',
        payee: 'Acme Store',
        amountNative: 200.75,
        currencyCode: 'EUR',
        fxRateToBase: 1.1,
        baseAmount: 220.825,
        baseCurrencyCode: 'USD',
        date: '2025-01-16',
        time: null,
        categoryId: null,
        fundId: 1,
        counterpartFundId: null,
        counterpartAmount: null,
        counterpartCurrencyCode: null,
        notes: null,
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

      await expect(updateTransaction(mockDb, updatePayload)).rejects.toThrow(
        'Transaction 999 not found',
      );
    });

    it('should handle null categoryId and notes', async () => {
      const updatePayload: UpdateTransactionRecord = {
        type: 'expense',
        id: 42,
        description: 'Updated expense',
        payee: 'Acme Store',
        amountNative: 200.75,
        currencyCode: 'EUR',
        fxRateToBase: 1.1,
        baseAmount: 220.825,
        baseCurrencyCode: 'USD',
        date: '2025-01-16',
        time: null,
        categoryId: null,
        fundId: 1,
        counterpartFundId: null,
        counterpartAmount: null,
        counterpartCurrencyCode: null,
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
        payee: 'Acme Store',
        amount_native: 200.75,
        currency_code: 'EUR',
        fx_rate_to_base: 1.1,
        base_amount: 220.825,
        date: '2025-01-16',
        category_id: null,
        fund_id: 1,
        counterpart_fund_id: null,
        counterpart_amount: null,
        counterpart_currency_code: null,
        notes: null,
        is_confirmed: 1,
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

      const result = await updateTransaction(mockDb, updatePayload);

      expect(result.categoryId).toBeNull();
      expect(result.notes).toBeNull();
    });

    // Guards the alignment rule on `toSharedColumnParams`.
    it('never writes the confirmed flag, and binds one value per assignment', async () => {
      const updatePayload: UpdateTransactionRecord = {
        id: 42,
        type: 'expense',
        description: 'Updated expense',
        payee: 'Acme Store',
        amountNative: 200.75,
        currencyCode: 'EUR',
        fxRateToBase: 1.1,
        baseAmount: 220.825,
        baseCurrencyCode: 'USD',
        date: '2025-01-16',
        time: null,
        categoryId: null,
        fundId: 1,
        counterpartFundId: null,
        counterpartAmount: null,
        counterpartCurrencyCode: null,
        notes: null,
      };

      const storedRow = {
        id: 42,
        type: 'expense',
        description: 'Updated expense',
        payee: 'Acme Store',
        amount_native: 200.75,
        currency_code: 'EUR',
        fx_rate_to_base: 1.1,
        base_amount: 220.825,
        base_currency_code: 'USD',
        date: '2025-01-16',
        time: null,
        category_id: null,
        fund_id: 1,
        counterpart_fund_id: null,
        counterpart_amount: null,
        counterpart_currency_code: null,
        notes: null,
        is_confirmed: 1,
        created_at: '2025-01-15T10:00:00.000Z',
        updated_at: '2025-01-16T10:00:00.000Z',
      };

      mockDb.executeSql
        .mockResolvedValueOnce([
          {
            insertId: undefined,
            rowsAffected: 1,
            rows: { length: 0, raw: () => [], item: () => null },
          } as ResultSet,
        ])
        .mockResolvedValueOnce([
          {
            insertId: undefined,
            rowsAffected: 0,
            rows: {
              length: 1,
              raw: () => [storedRow],
              item: (index: number) => (index === 0 ? storedRow : null),
            },
          } as ResultSet,
        ]);

      const result = await updateTransaction(mockDb, updatePayload);

      expect(result.isConfirmed).toBe(true);

      const [sql, params] = mockDb.executeSql.mock.calls[0] as [
        string,
        unknown[],
      ];
      expect(sql).not.toContain('is_confirmed');
      // Every `?` except the trailing WHERE binding is a SET assignment.
      expect((sql.match(/\?/g) ?? []).length).toBe(params.length);
    });

    it('throws when the row cannot be read back after the update', async () => {
      const updatePayload: UpdateTransactionRecord = {
        id: 42,
        type: 'expense',
        description: 'Updated expense',
        payee: 'Acme Store',
        amountNative: 200.75,
        currencyCode: 'EUR',
        fxRateToBase: 1.1,
        baseAmount: 220.825,
        baseCurrencyCode: 'USD',
        date: '2025-01-16',
        time: null,
        categoryId: null,
        fundId: 1,
        counterpartFundId: null,
        counterpartAmount: null,
        counterpartCurrencyCode: null,
        notes: null,
      };

      mockDb.executeSql
        .mockResolvedValueOnce([
          {
            insertId: undefined,
            rowsAffected: 1,
            rows: { length: 0, raw: () => [], item: () => null },
          } as ResultSet,
        ])
        .mockResolvedValueOnce([
          {
            insertId: undefined,
            rowsAffected: 0,
            rows: { length: 0, raw: () => [], item: () => null },
          } as ResultSet,
        ]);

      await expect(updateTransaction(mockDb, updatePayload)).rejects.toThrow(
        'Failed to load updated transaction',
      );
    });
  });

  describe('setTransactionConfirmed', () => {
    const rowWith = (isConfirmed: number) => ({
      id: 42,
      type: 'expense',
      description: 'Test expense',
      payee: 'Acme Store',
      amount_native: 100.5,
      currency_code: 'USD',
      fx_rate_to_base: 1,
      base_amount: 100.5,
      base_currency_code: 'USD',
      date: '2025-01-15',
      time: null,
      category_id: null,
      fund_id: 1,
      counterpart_fund_id: null,
      counterpart_amount: null,
      counterpart_currency_code: null,
      notes: null,
      is_confirmed: isConfirmed,
      created_at: '2025-01-15T10:00:00.000Z',
      updated_at: '2025-01-15T10:00:00.000Z',
    });

    const selectResultFor = (isConfirmed: number): ResultSet => ({
      insertId: undefined,
      rowsAffected: 0,
      rows: {
        length: 1,
        raw: () => [rowWith(isConfirmed)],
        item: (index: number) => (index === 0 ? rowWith(isConfirmed) : null),
      },
    });

    const updateResult: ResultSet = {
      insertId: undefined,
      rowsAffected: 1,
      rows: { length: 0, raw: () => [], item: () => null },
    };

    it('stores the flag as an integer and returns the stored row', async () => {
      mockDb.executeSql
        .mockResolvedValueOnce([updateResult])
        .mockResolvedValueOnce([selectResultFor(0)]);

      const result = await setTransactionConfirmed(mockDb, 42, false);

      expect(mockDb.executeSql).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE transactions SET'),
        [0, 42],
      );
      expect(result.isConfirmed).toBe(false);
    });

    it('confirms a row the same way it unconfirms one', async () => {
      mockDb.executeSql
        .mockResolvedValueOnce([updateResult])
        .mockResolvedValueOnce([selectResultFor(1)]);

      const result = await setTransactionConfirmed(mockDb, 42, true);

      expect(mockDb.executeSql).toHaveBeenCalledWith(
        expect.anything(),
        [1, 42],
      );
      expect(result.isConfirmed).toBe(true);
    });

    it('bumps updated_at alongside the flag', async () => {
      mockDb.executeSql
        .mockResolvedValueOnce([updateResult])
        .mockResolvedValueOnce([selectResultFor(1)]);

      await setTransactionConfirmed(mockDb, 42, true);

      expect(mockDb.executeSql.mock.calls[0][0]).toContain('updated_at =');
    });

    it('throws when no transaction carries the id', async () => {
      mockDb.executeSql.mockResolvedValueOnce([
        { ...updateResult, rowsAffected: 0 },
      ]);

      await expect(setTransactionConfirmed(mockDb, 999, true)).rejects.toThrow(
        'Transaction 999 not found',
      );
    });

    it('throws when the row cannot be read back after the write', async () => {
      mockDb.executeSql
        .mockResolvedValueOnce([updateResult])
        .mockResolvedValueOnce([
          {
            insertId: undefined,
            rowsAffected: 0,
            rows: { length: 0, raw: () => [], item: () => null },
          } as ResultSet,
        ]);

      await expect(setTransactionConfirmed(mockDb, 42, true)).rejects.toThrow(
        'Failed to load updated transaction',
      );
    });
  });

  describe('deleteTransaction', () => {
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

      await deleteTransaction(mockDb, 42);

      expect(mockDb.executeSql).toHaveBeenCalledWith(
        'DELETE FROM transactions WHERE id = ?',
        [42],
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

      await expect(deleteTransaction(mockDb, 999)).rejects.toThrow(
        'Transaction 999 not found',
      );
    });
  });

  describe('getTransactionById', () => {
    it('should return an expense by id', async () => {
      const mockExpense = {
        id: 42,
        description: 'Test expense',
        payee: 'Acme Store',
        amount_native: 100.5,
        currency_code: 'USD',
        fx_rate_to_base: 1.0,
        base_amount: 100.5,
        base_currency_code: 'USD',
        date: '2025-01-15',
        category_id: 1,
        fund_id: 1,
        counterpart_fund_id: null,
        counterpart_amount: null,
        counterpart_currency_code: null,
        notes: 'Test notes',
        is_confirmed: 1,
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

      const result = await getTransactionById(mockDb, 42);

      expect(mockDb.executeSql).toHaveBeenCalledWith(
        expect.stringContaining('SELECT'),
        [42],
      );

      expect(result).toEqual({
        id: 42,
        description: 'Test expense',
        payee: 'Acme Store',
        amountNative: 100.5,
        currencyCode: 'USD',
        fxRateToBase: 1.0,
        baseAmount: 100.5,
        baseCurrencyCode: 'USD',
        date: '2025-01-15',
        time: null,
        categoryId: 1,
        fundId: 1,
        counterpartFundId: null,
        counterpartAmount: null,
        counterpartCurrencyCode: null,
        notes: 'Test notes',
        isConfirmed: true,
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

      const result = await getTransactionById(mockDb, 999);

      expect(result).toBeNull();
    });
  });

  describe('listTransactions', () => {
    it('should return all expenses with no filters', async () => {
      const mockTransactions = [
        {
          id: 1,
          description: 'Expense 1',
          amount_native: 100.0,
          currency_code: 'USD',
          fx_rate_to_base: 1.0,
          base_amount: 100.0,
          date: '2025-01-15',
          category_id: 1,
          fund_id: 1,
          counterpart_fund_id: null,
          counterpart_amount: null,
          counterpart_currency_code: null,
          notes: null,
          is_confirmed: 1,
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
          fund_id: 1,
          counterpart_fund_id: null,
          counterpart_amount: null,
          counterpart_currency_code: null,
          notes: 'Test',
          is_confirmed: 1,
          created_at: '2025-01-14T10:00:00.000Z',
          updated_at: '2025-01-14T10:00:00.000Z',
        },
      ];

      const mockSelectResult: ResultSet = {
        insertId: undefined,
        rowsAffected: 0,
        rows: {
          length: 2,
          raw: () => mockTransactions,
          item: (index: number) => mockTransactions[index] ?? null,
        },
      };

      mockDb.executeSql.mockResolvedValueOnce([mockSelectResult]);

      const result = await listTransactions(mockDb);

      expect(mockDb.executeSql).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY date DESC, time DESC, id DESC'),
        [],
      );

      expect(result).toHaveLength(2);
      expect(result[0].id).toBe(1);
      expect(result[1].id).toBe(2);
    });

    it('orders by time between date and id, without a NULLS clause', async () => {
      const mockSelectResult: ResultSet = {
        insertId: undefined,
        rowsAffected: 0,
        rows: { length: 0, raw: () => [], item: () => null },
      };
      mockDb.executeSql.mockResolvedValueOnce([mockSelectResult]);

      await listTransactions(mockDb);

      const sql = mockDb.executeSql.mock.calls[0][0] as string;
      expect(sql).toContain('ORDER BY date DESC, time DESC, id DESC');
      expect(sql).not.toContain('NULLS');
    });

    it('reads a stored time back onto the record, and null when absent', async () => {
      const row = {
        type: 'expense',
        description: 'Lunch',
        payee: 'Cafe',
        amount_native: 10,
        currency_code: 'USD',
        fx_rate_to_base: 1,
        base_amount: 10,
        base_currency_code: 'USD',
        date: '2025-01-15',
        category_id: null,
        fund_id: 1,
        counterpart_fund_id: null,
        counterpart_amount: null,
        counterpart_currency_code: null,
        notes: null,
        is_confirmed: 1,
        created_at: '',
        updated_at: '',
      };
      const rows = [
        { ...row, id: 1, time: '14:30' },
        { ...row, id: 2, time: null },
      ];
      const mockSelectResult: ResultSet = {
        insertId: undefined,
        rowsAffected: 0,
        rows: {
          length: 2,
          raw: () => rows,
          item: (index: number) => rows[index] ?? null,
        },
      };
      mockDb.executeSql.mockResolvedValueOnce([mockSelectResult]);

      const result = await listTransactions(mockDb);

      expect(result[0].time).toBe('14:30');
      expect(result[1].time).toBeNull();
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
        fund_id: 1,
        counterpart_fund_id: null,
        counterpart_amount: null,
        counterpart_currency_code: null,
        notes: null,
        is_confirmed: 1,
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

      const result = await listTransactions(mockDb, { categoryId: 1 });

      expect(mockDb.executeSql).toHaveBeenCalledWith(
        expect.stringContaining('WHERE category_id = ?'),
        [1],
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
        fund_id: 1,
        counterpart_fund_id: null,
        counterpart_amount: null,
        counterpart_currency_code: null,
        notes: null,
        is_confirmed: 1,
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

      const result = await listTransactions(mockDb, {
        startDate: '2025-01-10',
        endDate: '2025-01-20',
      });

      expect(mockDb.executeSql).toHaveBeenCalledWith(
        expect.stringContaining('WHERE date >= ? AND date <= ?'),
        ['2025-01-10', '2025-01-20'],
      );

      expect(result).toHaveLength(1);
    });

    it('should apply limit and offset', async () => {
      const mockTransactions = [
        {
          id: 2,
          description: 'Expense 2',
          amount_native: 200.0,
          currency_code: 'EUR',
          fx_rate_to_base: 1.1,
          base_amount: 220.0,
          date: '2025-01-14',
          category_id: 2,
          fund_id: 1,
          counterpart_fund_id: null,
          counterpart_amount: null,
          counterpart_currency_code: null,
          notes: 'Test',
          is_confirmed: 1,
          created_at: '2025-01-14T10:00:00.000Z',
          updated_at: '2025-01-14T10:00:00.000Z',
        },
      ];

      const mockSelectResult: ResultSet = {
        insertId: undefined,
        rowsAffected: 0,
        rows: {
          length: 1,
          raw: () => mockTransactions,
          item: (index: number) => mockTransactions[index] ?? null,
        },
      };

      mockDb.executeSql.mockResolvedValueOnce([mockSelectResult]);

      const result = await listTransactions(mockDb, { limit: 10, offset: 5 });

      expect(mockDb.executeSql).toHaveBeenCalledWith(
        expect.stringContaining('LIMIT ? OFFSET ?'),
        [10, 5],
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
        fund_id: 1,
        counterpart_fund_id: null,
        counterpart_amount: null,
        counterpart_currency_code: null,
        notes: null,
        is_confirmed: 1,
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

      const result = await listTransactions(mockDb, {
        categoryId: 1,
        startDate: '2025-01-10',
        endDate: '2025-01-20',
        limit: 10,
      });

      expect(mockDb.executeSql).toHaveBeenCalledWith(
        expect.stringContaining(
          'WHERE category_id = ? AND date >= ? AND date <= ?',
        ),
        [1, '2025-01-10', '2025-01-20', 10],
      );

      expect(result).toHaveLength(1);
    });

    describe('free-text query', () => {
      const emptyResult: ResultSet = {
        insertId: undefined,
        rowsAffected: 0,
        rows: { length: 0, raw: () => [], item: () => null },
      };

      const sqlFor = async (
        filters: Parameters<typeof listTransactions>[1],
      ): Promise<{ sql: string; params: unknown[] }> => {
        mockDb.executeSql.mockResolvedValueOnce([emptyResult]);
        await listTransactions(mockDb, filters);
        const [sql, params] = mockDb.executeSql.mock.calls[0] as [
          string,
          unknown[],
        ];
        return { sql, params };
      };

      it('matches the three text columns, guarding the nullable one', async () => {
        const { sql } = await sqlFor({ query: 'costa' });

        expect(sql).toContain(
          "WHERE (description LIKE ? ESCAPE '\\' OR payee LIKE ? ESCAPE '\\'" +
            " OR IFNULL(notes, '') LIKE ? ESCAPE '\\')",
        );
      });

      it('binds the term instead of putting it in the statement', async () => {
        const { sql, params } = await sqlFor({ query: 'costa' });

        expect(sql).not.toContain('costa');
        expect(params).toEqual(['%costa%', '%costa%', '%costa%']);
      });

      it('escapes wildcards so they are matched literally', async () => {
        const { sql, params } = await sqlFor({ query: '50%_off' });

        expect(sql).not.toContain('50%');
        expect(params).toEqual([
          '%50\\%\\_off%',
          '%50\\%\\_off%',
          '%50\\%\\_off%',
        ]);
      });

      it('composes with every other filter rather than replacing them', async () => {
        const { sql } = await sqlFor({
          type: 'expense',
          categoryId: 1,
          fundId: 2,
          startDate: '2025-01-10',
          endDate: '2025-01-20',
          query: 'costa',
        });

        expect(sql).toContain(
          'WHERE type = ? AND category_id = ? AND (fund_id = ? OR counterpart_fund_id = ?)' +
            ' AND date >= ? AND date <= ? AND (description LIKE ?',
        );
      });

      it('keeps the query bindings ahead of limit and offset', async () => {
        const { params } = await sqlFor({
          type: 'expense',
          query: 'costa',
          limit: 10,
          offset: 5,
        });

        expect(params).toEqual([
          'expense',
          '%costa%',
          '%costa%',
          '%costa%',
          10,
          5,
        ]);
      });

      it('emits no query condition when none is given', async () => {
        const { sql, params } = await sqlFor({ type: 'expense' });

        expect(sql).not.toContain('LIKE');
        expect(params).toEqual(['expense']);
      });
    });

    describe('confirmed filter', () => {
      const noRows: ResultSet = {
        insertId: undefined,
        rowsAffected: 0,
        rows: { length: 0, raw: () => [], item: () => null },
      };

      const sqlFor = async (
        filters: Parameters<typeof listTransactions>[1],
      ): Promise<{ sql: string; params: unknown[] }> => {
        mockDb.executeSql.mockResolvedValueOnce([noRows]);
        await listTransactions(mockDb, filters);
        return mockDb.executeSql.mock.calls[0] as unknown as {
          sql: string;
          params: unknown[];
        };
      };

      it('narrows to unconfirmed rows when asked for false', async () => {
        const [sql, params] = (await sqlFor({
          isConfirmed: false,
        })) as unknown as [string, unknown[]];

        expect(sql).toContain('is_confirmed = ?');
        expect(params).toEqual([0]);
      });

      it('narrows to confirmed rows when asked for true', async () => {
        const [, params] = (await sqlFor({
          isConfirmed: true,
        })) as unknown as [string, unknown[]];

        expect(params).toEqual([1]);
      });

      it('emits no condition when the filter is absent', async () => {
        const [sql] = (await sqlFor({ type: 'expense' })) as unknown as [
          string,
          unknown[],
        ];

        expect(sql).not.toContain('is_confirmed = ?');
      });
    });
  });

  describe('createTransactionsBulk', () => {
    const okResult = {
      insertId: undefined,
      rowsAffected: 1,
      rows: { length: 0, raw: () => [], item: () => null },
    };

    it('returns 0 and issues no SQL for an empty batch', async () => {
      const count = await createTransactionsBulk(mockDb, []);

      expect(count).toBe(0);
      expect(mockDb.executeSql).not.toHaveBeenCalled();
    });

    it('inserts a single multi-row statement with all values parameterized', async () => {
      mockDb.executeSql.mockResolvedValue([okResult]);

      const payloads = [
        makeNewExpense({ description: 'A', categoryId: 5 }),
        makeNewExpense({ description: 'B', amountNative: 20, baseAmount: 20 }),
      ];

      const count = await createTransactionsBulk(mockDb, payloads);

      expect(count).toBe(2);
      expect(mockDb.executeSql).toHaveBeenCalledTimes(1);
      const call = mockDb.executeSql.mock.calls[0];
      const sql = call[0] as string;
      const params = (call[1] ?? []) as Array<string | number | null>;
      expect(sql).toContain('INSERT INTO transactions');
      expect(
        sql.match(
          /\(\?, \?, \?, \?, \?, \?, \?, \?, \?, \?, \?, \?, \?, \?, \?, \?, \?\)/g,
        ),
      ).toHaveLength(2);
      expect(params).toHaveLength(34);
      expect(params[0]).toBe('expense');
      expect(params[1]).toBe('A');
      expect(params[9]).toBeNull();
      expect(params[10]).toBe(5);
    });

    it('never exceeds the host-parameter cap, whatever the column count', async () => {
      const SQLITE_HOST_PARAM_CAP = 999;
      mockDb.executeSql.mockResolvedValue([okResult]);

      const payloads = Array.from({ length: 200 }, (_, index) =>
        makeNewExpense({ description: `E${index}` }),
      );

      const count = await createTransactionsBulk(mockDb, payloads);

      expect(count).toBe(200);

      const statements = mockDb.executeSql.mock.calls.map(call => {
        const sql = call[0] as string;
        const params = (call[1] ?? []) as unknown[];
        return {
          rows: (sql.match(/\(\?(?:,\s\?)*\)/g) ?? []).length,
          params: params.length,
        };
      });

      const columnsPerRow = statements[0].params / statements[0].rows;
      const maxRowsPerStatement = Math.floor(
        SQLITE_HOST_PARAM_CAP / columnsPerRow,
      );

      statements.forEach(statement => {
        expect(statement.params).toBe(statement.rows * columnsPerRow);
        expect(statement.params).toBeLessThanOrEqual(SQLITE_HOST_PARAM_CAP);
      });

      statements.slice(0, -1).forEach(statement => {
        expect(statement.rows).toBe(maxRowsPerStatement);
      });

      expect(statements.reduce((total, s) => total + s.rows, 0)).toBe(200);
    });
  });
});
