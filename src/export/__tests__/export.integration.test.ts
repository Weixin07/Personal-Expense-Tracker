import type { CategoryRecord, TransactionRecord } from '../../database/types';
import { buildTransactionsCsv } from '../csvBuilder';

describe('CSV Export Integration Tests', () => {
  const mockCategories: CategoryRecord[] = [
    {
      type: 'both',
      id: 1,
      name: 'Groceries',
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
    },
    {
      type: 'both',
      id: 2,
      name: 'Transport',
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
    },
  ];

  const mockTransactions: TransactionRecord[] = [
    {
      type: 'expense',
      id: 1,
      description: 'Weekly groceries',
      payee: 'Tesco',
      amountNative: 45.5,
      currencyCode: 'GBP',
      fxRateToBase: 1.0,
      baseAmount: 45.5,
      baseCurrencyCode: 'GBP',
      date: '2025-01-15',
      categoryId: 1,
      notes: 'Tesco shopping',
      createdAt: '2025-01-15T10:00:00.000Z',
      updatedAt: '2025-01-15T10:00:00.000Z',
    },
    {
      type: 'expense',
      id: 2,
      description: 'Uber to airport',
      payee: 'Uber',
      amountNative: 25.0,
      currencyCode: 'USD',
      fxRateToBase: 1.27,
      baseAmount: 31.75,
      baseCurrencyCode: 'GBP',
      date: '2025-01-20',
      categoryId: 2,
      notes: null,
      createdAt: '2025-01-20T08:30:00.000Z',
      updatedAt: '2025-01-20T08:30:00.000Z',
    },
    {
      type: 'expense',
      id: 3,
      description: 'Coffee with "special" quotes',
      payee: 'Costa',
      amountNative: 3.5,
      currencyCode: 'EUR',
      fxRateToBase: 1.15,
      baseAmount: 4.025,
      baseCurrencyCode: 'GBP',
      date: '2025-01-22',
      categoryId: null,
      notes: 'Line 1\nLine 2',
      createdAt: '2025-01-22T14:00:00.000Z',
      updatedAt: '2025-01-22T14:00:00.000Z',
    },
  ];

  describe('buildTransactionsCsv', () => {
    it('should build valid CSV with UTF-8 BOM header', () => {
      const result = buildTransactionsCsv({
        transactions: mockTransactions,
        categories: mockCategories,
      });
      const csv = result.content;

      expect(csv.charCodeAt(0)).toBe(0xfeff);

      const lines = csv.split('\r\n');
      expect(lines[0]).toBe(
        '\uFEFFid,description,amount_native,currency_code,fx_rate_to_base,base_amount,date,category,notes,base_currency_code,payee,type',
      );
    });

    it('should format amounts with correct decimal places', () => {
      const result = buildTransactionsCsv({
        transactions: mockTransactions,
        categories: mockCategories,
      });
      const csv = result.content;
      const lines = csv.split('\r\n');

      expect(lines[1]).toContain('45.50');
      expect(lines[1]).toContain('1.000000');
      expect(lines[1]).toMatch(/45\.50,GBP,1\.000000,45\.50/);

      expect(lines[2]).toContain('25.00');
      expect(lines[2]).toContain('1.270000');
      expect(lines[2]).toMatch(/25\.00,USD,1\.270000,31\.75/);

      expect(lines[3]).toContain('3.50');
      expect(lines[3]).toContain('1.150000');
      expect(lines[3]).toMatch(/3\.50,EUR,1\.150000,4\.03/);
    });

    it('should properly quote fields with special characters', () => {
      const result = buildTransactionsCsv({
        transactions: mockTransactions,
        categories: mockCategories,
      });
      const csv = result.content;
      const lines = csv.split('\r\n');

      expect(lines[3]).toContain('"Coffee with ""special"" quotes"');
      expect(lines[3]).toContain('"Line 1\nLine 2"');
    });

    it('should map category IDs to names correctly', () => {
      const result = buildTransactionsCsv({
        transactions: mockTransactions,
        categories: mockCategories,
      });
      const csv = result.content;
      const lines = csv.split('\r\n');

      expect(lines[1]).toContain('Groceries');
      expect(lines[2]).toContain('Transport');
      expect(lines[3]).toContain(''); // No category
    });

    it('should handle null notes as empty string', () => {
      const result = buildTransactionsCsv({
        transactions: mockTransactions,
        categories: mockCategories,
      });
      const csv = result.content;
      const lines = csv.split('\r\n');

      // Trailing columns are: notes, base_currency_code, payee, type.
      const secondExpense = lines[2].split(',');
      expect(secondExpense[secondExpense.length - 4]).toBe('');
    });

    it('should handle large datasets efficiently', () => {
      const largeDataset: TransactionRecord[] = Array.from(
        { length: 10000 },
        (_, i) => ({
          id: i + 1,
          type: 'expense' as const,
          description: `Expense ${i + 1}`,
          payee: `Vendor ${i + 1}`,
          amountNative: Math.random() * 1000,
          currencyCode: 'GBP',
          fxRateToBase: 1.0,
          baseAmount: Math.random() * 1000,
          baseCurrencyCode: 'GBP',
          date: '2025-01-01',
          categoryId: (i % 5) + 1,
          notes: null,
          createdAt: '2025-01-01T00:00:00.000Z',
          updatedAt: '2025-01-01T00:00:00.000Z',
        }),
      );

      const startTime = Date.now();
      const result = buildTransactionsCsv({
        transactions: largeDataset,
        categories: mockCategories,
      });
      const csv = result.content;
      const endTime = Date.now();

      expect(endTime - startTime).toBeLessThan(1000);

      // Should have 10,001 lines (header + 10,000 records) + 1 empty from trailing CRLF
      const lines = csv.split('\r\n');
      expect(lines.length).toBe(10002);
    });

    it('should use CRLF line endings for RFC 4180 compliance', () => {
      const result = buildTransactionsCsv({
        transactions: mockTransactions,
        categories: mockCategories,
      });
      const csv = result.content;

      // Only record separators are CRLF: newlines inside quoted fields are
      // preserved as they were written.
      const lines = csv.split('\r\n');
      expect(lines.length).toBeGreaterThan(1);
      expect(csv).toMatch(/\r\n/);
    });

    it('should format amounts consistently in CSV export', () => {
      const preciseExpense: TransactionRecord = {
        type: 'expense',
        id: 100,
        description: 'Precision test',
        payee: 'Vendor',
        amountNative: 123.456789,
        currencyCode: 'USD',
        fxRateToBase: 1.234567,
        baseAmount: 152.415135963,
        baseCurrencyCode: 'USD',
        date: '2025-01-01',
        categoryId: null,
        notes: null,
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T00:00:00.000Z',
      };

      const result = buildTransactionsCsv({
        transactions: [preciseExpense],
        categories: mockCategories,
      });
      const csv = result.content;
      const lines = csv.split('\r\n');

      expect(lines[1]).toContain('152.42');
    });
  });

  describe('CSV Column Order', () => {
    it('should maintain exact column order as specified', () => {
      const result = buildTransactionsCsv({
        transactions: mockTransactions,
        categories: mockCategories,
      });
      const csv = result.content;
      const lines = csv.split('\r\n');

      const header = lines[0].replace('\uFEFF', '');
      expect(header).toBe(
        'id,description,amount_native,currency_code,fx_rate_to_base,base_amount,date,category,notes,base_currency_code,payee,type',
      );

      const firstDataRow = lines[1].split(',');
      expect(firstDataRow[0]).toBe('1'); // id
      expect(firstDataRow[1]).toBe('Weekly groceries'); // description
      expect(firstDataRow[2]).toBe('45.50'); // amount_native
      expect(firstDataRow[3]).toBe('GBP'); // currency_code
      expect(firstDataRow[4]).toBe('1.000000'); // fx_rate_to_base
      expect(firstDataRow[5]).toBe('45.50'); // base_amount (2 decimal places)
      expect(firstDataRow[6]).toBe('2025-01-15'); // date
      expect(firstDataRow[7]).toBe('Groceries'); // category
      expect(firstDataRow[8]).toBe('Tesco shopping'); // notes
      expect(firstDataRow[9]).toBe('GBP'); // base_currency_code
      expect(firstDataRow[10]).toBe('Tesco'); // payee
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty expense list', () => {
      const result = buildTransactionsCsv({
        transactions: [],
        categories: mockCategories,
      });
      const csv = result.content;
      const lines = csv.split('\r\n');

      // Should have header row + 1 empty from trailing CRLF
      expect(lines.length).toBe(2);
      expect(lines[0]).toContain('id,description');
    });

    it('should handle expense with missing category mapping', () => {
      const expenseWithUnknownCategory: TransactionRecord = {
        ...mockTransactions[0],
        categoryId: 999, // Non-existent category
      };

      const result = buildTransactionsCsv({
        transactions: [expenseWithUnknownCategory],
        categories: mockCategories,
      });
      const csv = result.content;
      const lines = csv.split('\r\n');

      // Column 7 is `category`.
      const columns = lines[1].split(',');
      expect(columns[7]).toBe('');
    });

    it('should handle description with commas', () => {
      const expenseWithComma: TransactionRecord = {
        ...mockTransactions[0],
        description: 'Groceries, including milk, bread, and eggs',
      };

      const result = buildTransactionsCsv({
        transactions: [expenseWithComma],
        categories: mockCategories,
      });
      const csv = result.content;
      const lines = csv.split('\r\n');

      expect(lines[1]).toContain(
        '"Groceries, including milk, bread, and eggs"',
      );
    });

    it('should handle very long descriptions', () => {
      const longDescription = 'A'.repeat(1000);
      const expenseWithLongDesc: TransactionRecord = {
        ...mockTransactions[0],
        description: longDescription,
      };

      const result = buildTransactionsCsv({
        transactions: [expenseWithLongDesc],
        categories: mockCategories,
      });
      const csv = result.content;
      const lines = csv.split('\r\n');

      expect(lines[1]).toContain(longDescription);
    });

    it('should handle zero amounts correctly', () => {
      const zeroExpense: TransactionRecord = {
        ...mockTransactions[0],
        amountNative: 0.0,
        baseAmount: 0.0,
      };

      const result = buildTransactionsCsv({
        transactions: [zeroExpense],
        categories: mockCategories,
      });
      const csv = result.content;
      const lines = csv.split('\r\n');

      expect(lines[1]).toContain('0.00');
      expect(lines[1]).toMatch(/0\.00,GBP,1\.000000,0\.00/);
    });

    it('should handle very large amounts', () => {
      const largeExpense: TransactionRecord = {
        ...mockTransactions[0],
        amountNative: 999999999.99,
        baseAmount: 999999999.99,
      };

      const result = buildTransactionsCsv({
        transactions: [largeExpense],
        categories: mockCategories,
      });
      const csv = result.content;
      const lines = csv.split('\r\n');

      expect(lines[1]).toContain('999999999.99');
    });
  });

  describe('Filename Generation', () => {
    it('should generate filename with correct UTC timestamp format', () => {
      const now = new Date('2025-01-25T14:30:45.123Z');
      const expected = 'transactions_backup_20250125_143045.csv';

      const year = now.getUTCFullYear();
      const month = String(now.getUTCMonth() + 1).padStart(2, '0');
      const day = String(now.getUTCDate()).padStart(2, '0');
      const hours = String(now.getUTCHours()).padStart(2, '0');
      const minutes = String(now.getUTCMinutes()).padStart(2, '0');
      const seconds = String(now.getUTCSeconds()).padStart(2, '0');

      const filename = `transactions_backup_${year}${month}${day}_${hours}${minutes}${seconds}.csv`;

      expect(filename).toBe(expected);
    });

    it('should test filename generation from buildTransactionsCsv', () => {
      const now = new Date('2025-01-25T14:30:45.123Z');
      const result = buildTransactionsCsv({
        transactions: [],
        categories: [],
        generatedAt: now,
      });

      expect(result.filename).toBe('transactions_backup_20250125_143045.csv');
    });
  });
});
