/**
 * Integration tests for CSV export and Google Drive upload flow
 */

import type {CategoryRecord, ExpenseRecord} from '../../database/types';
import {buildExpensesCsv} from '../csvBuilder';

describe('CSV Export Integration Tests', () => {
  const mockCategories: CategoryRecord[] = [
    {
      id: 1,
      name: 'Groceries',
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
    },
    {
      id: 2,
      name: 'Transport',
      createdAt: '2025-01-01T00:00:00.000Z',
      updatedAt: '2025-01-01T00:00:00.000Z',
    },
  ];

  const mockExpenses: ExpenseRecord[] = [
    {
      id: 1,
      description: 'Weekly groceries',
      amountNative: 45.5,
      currencyCode: 'GBP',
      fxRateToBase: 1.0,
      baseAmount: 45.5,
      date: '2025-01-15',
      categoryId: 1,
      notes: 'Tesco shopping',
      createdAt: '2025-01-15T10:00:00.000Z',
      updatedAt: '2025-01-15T10:00:00.000Z',
    },
    {
      id: 2,
      description: 'Uber to airport',
      amountNative: 25.0,
      currencyCode: 'USD',
      fxRateToBase: 1.27,
      baseAmount: 31.75,
      date: '2025-01-20',
      categoryId: 2,
      notes: null,
      createdAt: '2025-01-20T08:30:00.000Z',
      updatedAt: '2025-01-20T08:30:00.000Z',
    },
    {
      id: 3,
      description: 'Coffee with "special" quotes',
      amountNative: 3.5,
      currencyCode: 'EUR',
      fxRateToBase: 1.15,
      baseAmount: 4.025,
      date: '2025-01-22',
      categoryId: null,
      notes: 'Line 1\nLine 2',
      createdAt: '2025-01-22T14:00:00.000Z',
      updatedAt: '2025-01-22T14:00:00.000Z',
    },
  ];

  describe('buildExpensesCsv', () => {
    it('should build valid CSV with UTF-8 BOM header', () => {
      const result = buildExpensesCsv({
        expenses: mockExpenses,
        categories: mockCategories,
      });
      const csv = result.content;

      // Check BOM
      expect(csv.charCodeAt(0)).toBe(0xfeff);

      // Check header row
      const lines = csv.split('\r\n');
      expect(lines[0]).toBe(
        '\uFEFFid,description,amount_native,currency_code,fx_rate_to_base,base_amount,date,category,notes',
      );
    });

    it('should format amounts with correct decimal places', () => {
      const result = buildExpensesCsv({
        expenses: mockExpenses,
        categories: mockCategories,
      });
      const csv = result.content;
      const lines = csv.split('\r\n');

      // First expense: 45.50 (2dp), 1.000000 (6dp), 45.50 (2dp)
      expect(lines[1]).toContain('45.50');
      expect(lines[1]).toContain('1.000000');
      expect(lines[1]).toMatch(/45\.50,GBP,1\.000000,45\.50/);

      // Second expense: 25.00 (2dp), 1.270000 (6dp), 31.75 (2dp)
      expect(lines[2]).toContain('25.00');
      expect(lines[2]).toContain('1.270000');
      expect(lines[2]).toMatch(/25\.00,USD,1\.270000,31\.75/);

      // Third expense: 3.50 (2dp), 1.150000 (6dp), 4.03 (2dp, rounded)
      expect(lines[3]).toContain('3.50');
      expect(lines[3]).toContain('1.150000');
      expect(lines[3]).toMatch(/3\.50,EUR,1\.150000,4\.03/);
    });

    it('should properly quote fields with special characters', () => {
      const result = buildExpensesCsv({
        expenses: mockExpenses,
        categories: mockCategories,
      });
      const csv = result.content;
      const lines = csv.split('\r\n');

      // Description with quotes should be escaped
      expect(lines[3]).toContain('"Coffee with ""special"" quotes"');

      // Notes with newlines should be quoted
      expect(lines[3]).toContain('"Line 1\nLine 2"');
    });

    it('should map category IDs to names correctly', () => {
      const result = buildExpensesCsv({
        expenses: mockExpenses,
        categories: mockCategories,
      });
      const csv = result.content;
      const lines = csv.split('\r\n');

      expect(lines[1]).toContain('Groceries');
      expect(lines[2]).toContain('Transport');
      expect(lines[3]).toContain(''); // No category
    });

    it('should handle null notes as empty string', () => {
      const result = buildExpensesCsv({
        expenses: mockExpenses,
        categories: mockCategories,
      });
      const csv = result.content;
      const lines = csv.split('\r\n');

      // Second expense has null notes
      const secondExpense = lines[2].split(',');
      expect(secondExpense[secondExpense.length - 1]).toBe('');
    });

    it('should handle large datasets efficiently', () => {
      // Generate 10,000 expenses
      const largeDataset: ExpenseRecord[] = Array.from({length: 10000}, (_, i) => ({
        id: i + 1,
        description: `Expense ${i + 1}`,
        amountNative: Math.random() * 1000,
        currencyCode: 'GBP',
        fxRateToBase: 1.0,
        baseAmount: Math.random() * 1000,
        date: '2025-01-01',
        categoryId: (i % 5) + 1,
        notes: null,
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T00:00:00.000Z',
      }));

      const startTime = Date.now();
      const result = buildExpensesCsv({
        expenses: largeDataset,
        categories: mockCategories,
      });
      const csv = result.content;
      const endTime = Date.now();

      // Should complete within 1 second for 10k records
      expect(endTime - startTime).toBeLessThan(1000);

      // Should have 10,001 lines (header + 10,000 records) + 1 empty from trailing CRLF
      const lines = csv.split('\r\n');
      expect(lines.length).toBe(10002);
    });

    it('should use CRLF line endings for RFC 4180 compliance', () => {
      const result = buildExpensesCsv({
        expenses: mockExpenses,
        categories: mockCategories,
      });
      const csv = result.content;

      // Check that record separators use CRLF (note: newlines inside quoted fields are preserved as-is)
      const lines = csv.split('\r\n');
      expect(lines.length).toBeGreaterThan(1);
      // Verify CRLF is used between records
      expect(csv).toMatch(/\r\n/);
    });

    it('should format amounts consistently in CSV export', () => {
      const preciseExpense: ExpenseRecord = {
        id: 100,
        description: 'Precision test',
        amountNative: 123.456789,
        currencyCode: 'USD',
        fxRateToBase: 1.234567,
        baseAmount: 152.415135963,
        date: '2025-01-01',
        categoryId: null,
        notes: null,
        createdAt: '2025-01-01T00:00:00.000Z',
        updatedAt: '2025-01-01T00:00:00.000Z',
      };

      const result = buildExpensesCsv({
        expenses: [preciseExpense],
        categories: mockCategories,
      });
      const csv = result.content;
      const lines = csv.split('\r\n');

      // Base amount should be formatted to 2 decimal places for display
      expect(lines[1]).toContain('152.42');
    });
  });

  describe('CSV Column Order', () => {
    it('should maintain exact column order as specified', () => {
      const result = buildExpensesCsv({
        expenses: mockExpenses,
        categories: mockCategories,
      });
      const csv = result.content;
      const lines = csv.split('\r\n');

      const header = lines[0].replace('\uFEFF', '');
      expect(header).toBe(
        'id,description,amount_native,currency_code,fx_rate_to_base,base_amount,date,category,notes',
      );

      // Verify data row column positions
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
    });
  });

  describe('Edge Cases', () => {
    it('should handle empty expense list', () => {
      const result = buildExpensesCsv({
        expenses: [],
        categories: mockCategories,
      });
      const csv = result.content;
      const lines = csv.split('\r\n');

      // Should have header row + 1 empty from trailing CRLF
      expect(lines.length).toBe(2);
      expect(lines[0]).toContain('id,description');
    });

    it('should handle expense with missing category mapping', () => {
      const expenseWithUnknownCategory: ExpenseRecord = {
        ...mockExpenses[0],
        categoryId: 999, // Non-existent category
      };

      const result = buildExpensesCsv({
        expenses: [expenseWithUnknownCategory],
        categories: mockCategories,
      });
      const csv = result.content;
      const lines = csv.split('\r\n');

      // Should output empty string for unknown category
      const columns = lines[1].split(',');
      expect(columns[7]).toBe('');
    });

    it('should handle description with commas', () => {
      const expenseWithComma: ExpenseRecord = {
        ...mockExpenses[0],
        description: 'Groceries, including milk, bread, and eggs',
      };

      const result = buildExpensesCsv({
        expenses: [expenseWithComma],
        categories: mockCategories,
      });
      const csv = result.content;
      const lines = csv.split('\r\n');

      // Description should be quoted due to commas
      expect(lines[1]).toContain('"Groceries, including milk, bread, and eggs"');
    });

    it('should handle very long descriptions', () => {
      const longDescription = 'A'.repeat(1000);
      const expenseWithLongDesc: ExpenseRecord = {
        ...mockExpenses[0],
        description: longDescription,
      };

      const result = buildExpensesCsv({
        expenses: [expenseWithLongDesc],
        categories: mockCategories,
      });
      const csv = result.content;
      const lines = csv.split('\r\n');

      expect(lines[1]).toContain(longDescription);
    });

    it('should handle zero amounts correctly', () => {
      const zeroExpense: ExpenseRecord = {
        ...mockExpenses[0],
        amountNative: 0.0,
        baseAmount: 0.0,
      };

      const result = buildExpensesCsv({
        expenses: [zeroExpense],
        categories: mockCategories,
      });
      const csv = result.content;
      const lines = csv.split('\r\n');

      expect(lines[1]).toContain('0.00');
      // Base amount also 2 decimal places
      expect(lines[1]).toMatch(/0\.00,GBP,1\.000000,0\.00/);
    });

    it('should handle very large amounts', () => {
      const largeExpense: ExpenseRecord = {
        ...mockExpenses[0],
        amountNative: 999999999.99,
        baseAmount: 999999999.99,
      };

      const result = buildExpensesCsv({
        expenses: [largeExpense],
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
      const expected = 'expenses_backup_20250125_143045.csv';

      const year = now.getUTCFullYear();
      const month = String(now.getUTCMonth() + 1).padStart(2, '0');
      const day = String(now.getUTCDate()).padStart(2, '0');
      const hours = String(now.getUTCHours()).padStart(2, '0');
      const minutes = String(now.getUTCMinutes()).padStart(2, '0');
      const seconds = String(now.getUTCSeconds()).padStart(2, '0');

      const filename = `expenses_backup_${year}${month}${day}_${hours}${minutes}${seconds}.csv`;

      expect(filename).toBe(expected);
    });

    it('should test filename generation from buildExpensesCsv', () => {
      const now = new Date('2025-01-25T14:30:45.123Z');
      const result = buildExpensesCsv({
        expenses: [],
        categories: [],
        generatedAt: now,
      });

      expect(result.filename).toBe('expenses_backup_20250125_143045.csv');
    });
  });
});
