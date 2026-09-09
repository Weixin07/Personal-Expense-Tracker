import { buildTransactionsCsv } from '../csvBuilder';
import { TRANSACTION_CSV_COLUMNS } from '../csvColumns';
import type { CategoryRecord, TransactionRecord } from '../../database';

describe('buildTransactionsCsv', () => {
  const baseTransaction: TransactionRecord = {
    type: 'expense',
    id: 1,
    description: 'Coffee',
    payee: 'Corner Cafe',
    amountNative: 3.5,
    currencyCode: 'USD',
    fxRateToBase: 1,
    baseAmount: 3.5,
    baseCurrencyCode: 'USD',
    date: '2025-01-10',
    time: null,
    categoryId: 2,
    fundId: 1,
    counterpartFundId: null,
    counterpartAmount: null,
    counterpartCurrencyCode: null,
    notes: 'Morning brew',
    isConfirmed: true,
    createdAt: '',
    updatedAt: '',
  };

  const categories: CategoryRecord[] = [
    { id: 2, name: 'Essentials', createdAt: '', updatedAt: '', type: 'both' },
  ];

  it('builds CSV with BOM, header, and quoted fields', () => {
    const transaction: TransactionRecord = {
      ...baseTransaction,
      description: 'Breakfast, "delicious"\nandalusian',
      notes: 'Line1\r\nLine2',
    };

    const { filename, content } = buildTransactionsCsv({
      transactions: [transaction],
      categories,
      generatedAt: new Date(Date.UTC(2025, 1, 3, 4, 5, 6)),
    });

    expect(filename).toBe('transactions_backup_20250203_040506.csv');
    expect(content.startsWith('\uFEFF')).toBe(true);

    // Quoted fields carry embedded CRLF, so a line split cannot separate records here.
    expect(content).toContain(
      'id,description,amount_native,currency_code,fx_rate_to_base,base_amount,date,category,notes,base_currency_code,payee,type,time,fund,counterpart_fund,counterpart_amount,counterpart_currency',
    );
    expect(content).toContain('"Breakfast, ""delicious""\nandalusian"');
    expect(content).toContain('3.50,USD,1.000000,3.50,2025-01-10,Essentials');
    expect(content).toContain('"Line1\r\nLine2"');
  });

  it('handles missing category names gracefully', () => {
    const expenseWithoutCategory: TransactionRecord = {
      ...baseTransaction,
      id: 5,
      categoryId: null,
    };

    const { content } = buildTransactionsCsv({
      transactions: [expenseWithoutCategory],
      categories: [],
    });

    const rows = content.slice(1).split('\r\n');
    expect(rows[1]).toBe(
      '5,Coffee,3.50,USD,1.000000,3.50,2025-01-10,,Morning brew,USD,Corner Cafe,expense,,,,,',
    );
  });

  describe('serialisation contract', () => {
    it('writes amounts without grouping separators', () => {
      const largeAmount: TransactionRecord = {
        ...baseTransaction,
        id: 7,
        amountNative: 1234.56,
        baseAmount: 1234567.89,
      };

      const { content } = buildTransactionsCsv({
        transactions: [largeAmount],
        categories,
      });

      expect(content).toContain('1234.56');
      expect(content).toContain('1234567.89');
      expect(content).not.toContain('1,234.56');
      expect(content).not.toContain('1,234,567.89');
    });

    it('writes both directions unsigned, carrying direction in the type column', () => {
      const expense: TransactionRecord = { ...baseTransaction, id: 8 };
      const income: TransactionRecord = {
        ...baseTransaction,
        id: 9,
        type: 'income',
        payee: 'Employer',
      };

      const { content } = buildTransactionsCsv({
        transactions: [expense, income],
        categories,
      });

      const rows = content.slice(1).split('\r\n');
      const typeColumn = TRANSACTION_CSV_COLUMNS.indexOf('type');
      expect(rows[1]).toContain('3.50,USD,1.000000,3.50');
      expect(rows[1].split(',')[typeColumn]).toBe('expense');
      expect(rows[2]).toContain('3.50,USD,1.000000,3.50');
      expect(rows[2].split(',')[typeColumn]).toBe('income');
      expect(content).not.toContain('-3.50');
      expect(content).not.toContain('+3.50');
    });
  });

  it('supports generating large datasets efficiently', () => {
    const largeSet = Array.from({ length: 10_000 }, (_, index) => ({
      ...baseTransaction,
      id: index + 1,
      amountNative: 1.23 + index,
      baseAmount: 1.23 + index,
      date: `2025-01-${String((index % 28) + 1).padStart(2, '0')}`,
      time: null,
      categoryId: index % 2 === 0 ? 2 : null,
      fundId: 1,
      counterpartFundId: null,
      counterpartAmount: null,
      counterpartCurrencyCode: null,
      notes: index % 3 === 0 ? `Note ${index}` : null,
    }));

    const { content } = buildTransactionsCsv({
      transactions: largeSet,
      categories,
    });

    expect(content.startsWith('\uFEFFid')).toBe(true);

    const lines = content.split('\r\n');
    expect(lines.length).toBe(largeSet.length + 2); // header + rows + trailing blank
    expect(lines[largeSet.length + 1]).toBe('');
  });
});

describe('fund and transfer columns', () => {
  const funds = [
    {
      id: 1,
      name: 'General',
      currencyCode: null,
      openingBalance: 0,
      notes: null,
      createdAt: '',
      updatedAt: '',
    },
    {
      id: 2,
      name: 'Travel',
      currencyCode: 'EUR',
      openingBalance: 0,
      notes: null,
      createdAt: '',
      updatedAt: '',
    },
  ];

  const base: TransactionRecord = {
    type: 'expense',
    id: 1,
    description: 'Coffee',
    payee: 'Cafe',
    amountNative: 3.5,
    currencyCode: 'USD',
    fxRateToBase: 1,
    baseAmount: 3.5,
    baseCurrencyCode: 'USD',
    date: '2025-01-10',
    time: null,
    categoryId: null,
    fundId: 1,
    counterpartFundId: null,
    counterpartAmount: null,
    counterpartCurrencyCode: null,
    notes: null,
    isConfirmed: true,
    createdAt: '',
    updatedAt: '',
  };

  const cellsOf = (transaction: TransactionRecord): string[] => {
    const { content } = buildTransactionsCsv({
      transactions: [transaction],
      categories: [],
      funds,
    });
    return content.split('\r\n')[1].split(',');
  };

  it('names the fund a plain transaction belongs to', () => {
    const cells = cellsOf(base);

    expect(cells[13]).toBe('General');
  });

  it('leaves the three counterpart cells empty on a non-transfer', () => {
    const cells = cellsOf(base);

    expect(cells.slice(14, 17)).toEqual(['', '', '']);
  });

  it('writes both funds, the received amount and its currency for a transfer', () => {
    const cells = cellsOf({
      ...base,
      type: 'transfer',
      description: '',
      payee: '',
      amountNative: 100,
      currencyCode: 'GBP',
      baseCurrencyCode: 'GBP',
      baseAmount: 100,
      counterpartFundId: 2,
      counterpartAmount: 117,
      counterpartCurrencyCode: 'EUR',
    });

    expect(cells.slice(13, 17)).toEqual(['General', 'Travel', '117.00', 'EUR']);
  });

  it('leaves the fund cell empty when no fund list was supplied', () => {
    const { content } = buildTransactionsCsv({
      transactions: [base],
      categories: [],
    });

    expect(content.split('\r\n')[1].split(',')[13]).toBe('');
  });
});
