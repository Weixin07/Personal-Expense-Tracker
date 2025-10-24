import { buildExpensesCsv } from '../csvBuilder';
import type { CategoryRecord, ExpenseRecord } from '../../database';

describe('buildExpensesCsv', () => {
  const baseExpense: ExpenseRecord = {
    id: 1,
    description: 'Coffee',
    amountNative: 3.5,
    currencyCode: 'USD',
    fxRateToBase: 1,
    baseAmount: 3.5,
    date: '2025-01-10',
    categoryId: 2,
    notes: 'Morning brew',
    createdAt: '',
    updatedAt: '',
  };

  const categories: CategoryRecord[] = [
    { id: 2, name: 'Essentials', createdAt: '', updatedAt: '' },
  ];

  it('builds CSV with BOM, header, and quoted fields', () => {
    const expense: ExpenseRecord = {
      ...baseExpense,
      description: 'Breakfast, "delicious"\nandalusian',
      notes: 'Line1\r\nLine2',
    };

    const { filename, content } = buildExpensesCsv({
      expenses: [expense],
      categories,
      generatedAt: new Date(Date.UTC(2025, 1, 3, 4, 5, 6)),
    });

    expect(filename).toBe('expenses_backup_20250203_040506.csv');
    expect(content.startsWith('\uFEFF')).toBe(true);

    const rows = content.slice(1).trim().split('\r\n');
    expect(rows[0]).toBe('id,description,amount_native,currency_code,fx_rate_to_base,base_amount,date,category,notes');
    expect(rows[1]).toBe(
      '1,"Breakfast, ""delicious""\nandalusian",3.50,USD,1.000000,3.50000000,2025-01-10,Essentials,"Line1\r\nLine2"',
    );
  });

  it('handles missing category names gracefully', () => {
    const expenseWithoutCategory: ExpenseRecord = {
      ...baseExpense,
      id: 5,
      categoryId: null,
    };

    const { content } = buildExpensesCsv({
      expenses: [expenseWithoutCategory],
      categories: [],
    });

    const rows = content.slice(1).trim().split('\r\n');
    expect(rows[1]).toBe('5,Coffee,3.50,USD,1.000000,3.50000000,2025-01-10,,Morning brew');
  });

  it('supports generating large datasets efficiently', () => {
    const largeSet = Array.from({ length: 10_000 }, (_, index) => ({
      ...baseExpense,
      id: index + 1,
      amountNative: 1.23 + index,
      baseAmount: 1.23 + index,
      date: `2025-01-${String((index % 28) + 1).padStart(2, '0')}`,
      categoryId: index % 2 === 0 ? 2 : null,
      notes: index % 3 === 0 ? `Note ${index}` : null,
    }));

    const { content } = buildExpensesCsv({ expenses: largeSet, categories });

    expect(content.startsWith('\uFEFFid')).toBe(true);

    const lines = content.split('\r\n');
    expect(lines.length).toBe(largeSet.length + 2); // header + rows + trailing blank
    expect(lines[largeSet.length]).toBe('');
  });
});