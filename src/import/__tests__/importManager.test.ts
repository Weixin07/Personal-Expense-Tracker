import { normalizeAmount, previewImport, commitImport } from '../importManager';
import type { ImportContext } from '../importManager';
import type { FieldMapping, ImportPreview } from '../types';
import * as database from '../../database';
import type { CategoryRecord } from '../../database';

jest.mock('../../database');

const APP_MAPPING: FieldMapping = {
  description: 0,
  amountNative: 1,
  currencyCode: 2,
  fxRateToBase: 3,
  date: 4,
  categoryName: 5,
  payee: 6,
  baseCurrencyCode: 7,
};

const HEADER = 'description,amount,currency,fx,date,category,payee,base\r\n';

const baseCtx: ImportContext = {
  baseCurrency: 'USD',
  defaultCurrency: null,
  currencyChoices: {},
  negativeMeans: 'income',
  numberFormat: 'auto',
  fxRateCache: [],
  existingTransactions: [],
  existingCategories: [],
};

describe('normalizeAmount', () => {
  it('leaves a plain app-export amount untouched', () => {
    expect(normalizeAmount('10.00', 'auto')).toBe(10);
    expect(normalizeAmount('1.000000', 'auto')).toBe(1);
  });

  it('strips currency symbols and grouping', () => {
    expect(normalizeAmount('$1,234.56', 'auto')).toBe(1234.56);
    expect(normalizeAmount('1 234,56', 'auto')).toBe(1234.56);
  });

  it('resolves both separators by position', () => {
    expect(normalizeAmount('1,234.56', 'auto')).toBe(1234.56);
    expect(normalizeAmount('1.234,56', 'auto')).toBe(1234.56);
  });

  it('handles repeated grouping separators', () => {
    expect(normalizeAmount('1,234,567.89', 'auto')).toBe(1234567.89);
    expect(normalizeAmount('1.234.567,89', 'auto')).toBe(1234567.89);
    expect(normalizeAmount('1,234,567', 'auto')).toBe(1234567);
  });

  it('reads a lone separator with three trailing digits as grouping', () => {
    expect(normalizeAmount('1.234', 'auto')).toBe(1234);
    expect(normalizeAmount('1,234', 'auto')).toBe(1234);
  });

  it('reads a lone separator with other trailing digits as a decimal', () => {
    expect(normalizeAmount('1,23', 'auto')).toBe(1.23);
  });

  it('honors a US override for an otherwise ambiguous value', () => {
    expect(normalizeAmount('1.234', 'us')).toBe(1.234);
    expect(normalizeAmount('1,234', 'us')).toBe(1234);
  });

  it('honors an EU override for an otherwise ambiguous value', () => {
    expect(normalizeAmount('1,234', 'eu')).toBe(1.234);
    expect(normalizeAmount('1.234', 'eu')).toBe(1234);
  });

  it('treats parentheses and a leading minus as negative', () => {
    expect(normalizeAmount('(50.00)', 'auto')).toBe(-50);
    expect(normalizeAmount('-50.00', 'auto')).toBe(-50);
  });

  it('returns null when no number is present', () => {
    expect(normalizeAmount('', 'auto')).toBeNull();
    expect(normalizeAmount('n/a', 'auto')).toBeNull();
  });
});

describe('previewImport', () => {
  it('throws when required columns are unmapped', () => {
    expect(() =>
      previewImport('a\r\n1\r\n', { amountNative: 0 }, 'iso', baseCtx),
    ).toThrow(/required columns/i);
  });

  it('produces valid records and recomputes base amount from amount x rate', () => {
    const text = `${HEADER}Lunch,100,USD,1.500000,2024-01-01,Food,Cafe,USD\r\n`;
    const result = previewImport(text, APP_MAPPING, 'iso', baseCtx);
    expect(result.valid).toHaveLength(1);
    expect(result.invalid).toEqual([]);
    expect(result.valid[0].record.amountNative).toBe(100);
    expect(result.valid[0].record.fxRateToBase).toBe(1.5);
    expect(result.valid[0].record.baseAmount).toBe(150);
    expect(result.valid[0].categoryName).toBe('Food');
  });

  it('rejects zero amounts', () => {
    const text = `${HEADER}Nothing,0,USD,1,2024-01-01,Food,Cafe,USD\r\n`;
    const result = previewImport(text, APP_MAPPING, 'iso', baseCtx);
    expect(result.valid).toHaveLength(0);
    expect(result.invalid[0]).toMatchObject({ line: 2 });
  });

  it('reads negative rows as income under the default sign convention', () => {
    const text = `${HEADER}Salary,-5,USD,1,2024-01-01,Food,Cafe,USD\r\n`;
    const result = previewImport(text, APP_MAPPING, 'iso', baseCtx);
    expect(result.invalid).toEqual([]);
    expect(result.valid).toHaveLength(1);
    expect(result.valid[0].record.type).toBe('income');
    expect(result.valid[0].record.amountNative).toBe(5);
  });

  it('imports negative rows as expenses when negative means expense', () => {
    const text = `${HEADER}Groceries,-5,USD,1,2024-01-01,Food,Cafe,USD\r\n`;
    const result = previewImport(text, APP_MAPPING, 'iso', {
      ...baseCtx,
      negativeMeans: 'expense',
    });
    expect(result.valid).toHaveLength(1);
    expect(result.valid[0].record.type).toBe('expense');
    expect(result.valid[0].record.amountNative).toBe(5);
  });

  it('reads every row as an expense when the file carries no negatives', () => {
    const text = `${HEADER}Deposit,5,USD,1,2024-01-01,Food,Cafe,USD\r\n`;
    const result = previewImport(text, APP_MAPPING, 'iso', {
      ...baseCtx,
      negativeMeans: 'expense',
    });
    expect(result.signConventionBypassed).toBe(true);
    expect(result.valid).toHaveLength(1);
    expect(result.valid[0].record.type).toBe('expense');
  });

  it('normalizes decorated amounts', () => {
    const text = `${HEADER}Big,"$1,234.56",USD,1,2024-01-01,Food,Cafe,USD\r\n`;
    const result = previewImport(text, APP_MAPPING, 'iso', baseCtx);
    expect(result.valid[0].record.amountNative).toBe(1234.56);
  });

  it('reads european grouping and decimal marks', () => {
    const text = `${HEADER}Big,"1.234,56",USD,1,2024-01-01,Food,Cafe,USD\r\n`;
    const result = previewImport(text, APP_MAPPING, 'iso', baseCtx);
    expect(result.valid[0].record.amountNative).toBe(1234.56);
  });

  it('treats a parenthesised amount as negative', () => {
    const text = `${HEADER}Refund,(50.00),USD,1,2024-01-01,Food,Cafe,USD\r\n`;
    const result = previewImport(text, APP_MAPPING, 'iso', baseCtx);
    expect(result.valid).toHaveLength(1);
    expect(result.valid[0].record.type).toBe('income');
  });

  it('falls back to the default currency when the column is blank', () => {
    const text = `${HEADER}X,10,,1,2024-01-01,Food,Cafe,USD\r\n`;
    const result = previewImport(text, APP_MAPPING, 'iso', {
      ...baseCtx,
      defaultCurrency: 'SGD',
    });
    expect(result.valid[0].record.currencyCode).toBe('SGD');
  });

  it('resolves a currency name to its ISO code', () => {
    const text = `${HEADER}X,10,US Dollar,1,2024-01-01,Food,Cafe,USD\r\n`;
    const result = previewImport(text, APP_MAPPING, 'iso', baseCtx);
    expect(result.valid[0].record.currencyCode).toBe('USD');
  });

  it('reports an ambiguous currency symbol instead of guessing', () => {
    const text = `${HEADER}X,10,$,1,2024-01-01,Food,Cafe,USD\r\n`;
    const result = previewImport(text, APP_MAPPING, 'iso', baseCtx);
    expect(result.valid).toHaveLength(0);
    expect(result.currencyReview).toHaveLength(1);
    expect(result.currencyReview[0].raw).toBe('$');
    expect(result.currencyReview[0].candidates).toContain('USD');
    expect(result.currencyReview[0].candidates).toContain('AUD');
  });

  it('applies a chosen code for an ambiguous symbol', () => {
    const text = `${HEADER}X,10,$,1,2024-01-01,Food,Cafe,USD\r\n`;
    const result = previewImport(text, APP_MAPPING, 'iso', {
      ...baseCtx,
      currencyChoices: { $: 'AUD' },
      baseCurrency: 'AUD',
    });
    expect(result.currencyReview).toEqual([]);
    expect(result.valid[0].record.currencyCode).toBe('AUD');
  });

  it('rejects invalid currency codes', () => {
    const text = `${HEADER}X,10,ZZZ,1,2024-01-01,Food,Cafe,USD\r\n`;
    const result = previewImport(text, APP_MAPPING, 'iso', baseCtx);
    expect(result.invalid[0].reason).toMatch(/ISO-4217/);
  });

  it('rejects dates that do not match the selected format', () => {
    const text = `${HEADER}X,10,USD,1,01/02/2024,Food,Cafe,USD\r\n`;
    const result = previewImport(text, APP_MAPPING, 'iso', baseCtx);
    expect(result.invalid[0].reason).toMatch(/date/i);
  });

  it('auto-fills payee Unknown when identity fields are all blank', () => {
    const text = `${HEADER},10,USD,1,2024-01-01,,,USD\r\n`;
    const result = previewImport(text, APP_MAPPING, 'iso', baseCtx);
    expect(result.valid[0].record.payee).toBe('Unknown');
  });

  it('uses a cached rate as an FX suggestion for foreign currencies', () => {
    const text = `${HEADER}Paris,10,EUR,,2024-01-01,Food,Cafe,USD\r\n`;
    const ctx: ImportContext = {
      ...baseCtx,
      fxRateCache: [
        {
          baseCurrencyCode: 'USD',
          currencyCode: 'EUR',
          fxRateToBase: 1.1,
          updatedAt: '2024-01-01T00:00:00Z',
        },
      ],
    };
    const result = previewImport(text, APP_MAPPING, 'iso', ctx);
    expect(result.valid[0].record.fxRateToBase).toBe(1.1);
    expect(result.valid[0].fxRateSource).toBe('cached');
    expect(result.fxReview).toEqual([
      {
        baseCurrencyCode: 'USD',
        currencyCode: 'EUR',
        suggestedRate: 1.1,
        rowCount: 1,
      },
    ]);
  });

  it('holds foreign rows for review when no rate is known', () => {
    const text = `${HEADER}Paris,10,EUR,,2024-01-01,Food,Cafe,USD\r\n`;
    const result = previewImport(text, APP_MAPPING, 'iso', baseCtx);
    expect(result.valid).toHaveLength(0);
    expect(result.invalid).toHaveLength(0);
    expect(result.needsFxRate[0].reason).toMatch(/FX rate required/);
    expect(result.fxReview).toEqual([
      {
        baseCurrencyCode: 'USD',
        currencyCode: 'EUR',
        suggestedRate: null,
        rowCount: 1,
      },
    ]);
  });

  it('imports a held row once a manual rate is supplied', () => {
    const text = `${HEADER}Paris,10,EUR,,2024-01-01,Food,Cafe,USD\r\n`;
    const result = previewImport(text, APP_MAPPING, 'iso', {
      ...baseCtx,
      manualFxRates: { 'USD|EUR': 1.2 },
    });
    expect(result.needsFxRate).toHaveLength(0);
    expect(result.valid[0].record.fxRateToBase).toBe(1.2);
    expect(result.valid[0].record.baseAmount).toBe(12);
    expect(result.valid[0].fxRateSource).toBe('manual');
  });

  it('prefers a manual rate over a cached one', () => {
    const text = `${HEADER}Paris,10,EUR,,2024-01-01,Food,Cafe,USD\r\n`;
    const result = previewImport(text, APP_MAPPING, 'iso', {
      ...baseCtx,
      fxRateCache: [
        {
          baseCurrencyCode: 'USD',
          currencyCode: 'EUR',
          fxRateToBase: 1.1,
          updatedAt: '2024-01-01T00:00:00Z',
        },
      ],
      manualFxRates: { 'USD|EUR': 1.2 },
    });
    expect(result.valid[0].record.fxRateToBase).toBe(1.2);
    expect(result.valid[0].fxRateSource).toBe('manual');
  });

  it('prefers a rate the file supplied over a manual one', () => {
    const text = `${HEADER}Paris,10,EUR,1.05,2024-01-01,Food,Cafe,USD\r\n`;
    const result = previewImport(text, APP_MAPPING, 'iso', {
      ...baseCtx,
      manualFxRates: { 'USD|EUR': 1.2 },
    });
    expect(result.valid[0].record.fxRateToBase).toBe(1.05);
    expect(result.valid[0].fxRateSource).toBe('column');
  });

  it('ignores a non-positive manual rate', () => {
    const text = `${HEADER}Paris,10,EUR,,2024-01-01,Food,Cafe,USD\r\n`;
    const result = previewImport(text, APP_MAPPING, 'iso', {
      ...baseCtx,
      manualFxRates: { 'USD|EUR': 0 },
    });
    expect(result.valid).toHaveLength(0);
    expect(result.needsFxRate).toHaveLength(1);
  });

  it('ignores an unparseable manual rate', () => {
    const text = `${HEADER}Paris,10,EUR,,2024-01-01,Food,Cafe,USD\r\n`;
    const result = previewImport(text, APP_MAPPING, 'iso', {
      ...baseCtx,
      manualFxRates: { 'USD|EUR': Number.NaN },
    });
    expect(result.valid).toHaveLength(0);
    expect(result.needsFxRate).toHaveLength(1);
  });

  it('resolves the same currency independently under different bases', () => {
    const text =
      `${HEADER}Paris,10,EUR,,2024-01-01,Food,Cafe,USD\r\n` +
      `${'Berlin,10,EUR,,2024-01-02,Food,Cafe,GBP\r\n'}`;
    const result = previewImport(text, APP_MAPPING, 'iso', {
      ...baseCtx,
      manualFxRates: { 'USD|EUR': 1.2 },
    });
    expect(result.valid).toHaveLength(1);
    expect(result.valid[0].record.baseCurrencyCode).toBe('USD');
    expect(result.needsFxRate).toHaveLength(1);
    expect(result.fxReview).toHaveLength(2);
  });

  it('counts every row depending on a pair', () => {
    const text =
      `${HEADER}Paris,10,EUR,,2024-01-01,Food,Cafe,USD\r\n` +
      `${'Lyon,20,EUR,,2024-01-02,Food,Bar,USD\r\n'}`;
    const result = previewImport(text, APP_MAPPING, 'iso', baseCtx);
    expect(result.fxReview[0].rowCount).toBe(2);
  });

  it('defaults same-currency rows to a rate of 1', () => {
    const text = `${HEADER}X,10,USD,,2024-01-01,,Cafe,USD\r\n`;
    const result = previewImport(text, APP_MAPPING, 'iso', baseCtx);
    expect(result.valid[0].record.fxRateToBase).toBe(1);
    expect(result.valid[0].record.baseAmount).toBe(10);
    expect(result.valid[0].fxRateSource).toBe('parity');
  });

  it('flags duplicates against existing expenses', () => {
    const text = `${HEADER}Lunch,10,USD,1,2024-01-01,Food,Cafe,USD\r\n`;
    const ctx: ImportContext = {
      ...baseCtx,
      existingTransactions: [
        {
          type: 'expense',
          id: 42,
          description: 'Lunch',
          payee: 'Cafe',
          amountNative: 10,
          currencyCode: 'USD',
          fxRateToBase: 1,
          baseAmount: 10,
          baseCurrencyCode: 'USD',
          date: '2024-01-01',
          categoryId: null,
          notes: null,
          createdAt: '',
          updatedAt: '',
        },
      ],
    };
    const result = previewImport(text, APP_MAPPING, 'iso', ctx);
    expect(result.duplicates).toEqual([{ line: 2, matchesTransactionId: 42 }]);
  });

  it('lists only categories that do not already exist', () => {
    const text =
      `${HEADER}A,10,USD,1,2024-01-01,Food,Cafe,USD\r\n` +
      `B,20,USD,1,2024-01-02,Travel,Cafe,USD\r\n`;
    const ctx: ImportContext = {
      ...baseCtx,
      existingCategories: [
        { id: 1, name: 'food', createdAt: '', updatedAt: '', type: 'both' },
      ],
    };
    const result = previewImport(text, APP_MAPPING, 'iso', ctx);
    expect(result.newCategoryNames).toEqual(['Travel']);
  });

  describe('date order inference', () => {
    it('applies an order proved by one row to the ambiguous rows', () => {
      const text =
        `${HEADER}A,10,USD,1,3/2/2022 10:11,Food,Cafe,USD\r\n` +
        `B,20,USD,1,3/25/2022 9:00,Food,Cafe,USD\r\n`;
      const result = previewImport(text, APP_MAPPING, 'auto', baseCtx);
      expect(result.invalid).toEqual([]);
      expect(result.inferredDateOrder).toBe('mdy');
      expect(result.valid.map(item => item.record.date)).toEqual([
        '2022-03-02',
        '2022-03-25',
      ]);
    });

    it('leaves ambiguous rows unresolved when the column proves nothing', () => {
      const text = `${HEADER}A,10,USD,1,3/2/2022 10:11,Food,Cafe,USD\r\n`;
      const result = previewImport(text, APP_MAPPING, 'auto', baseCtx);
      expect(result.inferredDateOrder).toBeNull();
      expect(result.valid).toHaveLength(0);
      expect(result.invalid[0]).toMatchObject({ line: 2 });
    });

    it('does not infer when the caller chose an explicit format', () => {
      const text =
        `${HEADER}A,10,USD,1,3/2/2022 10:11,Food,Cafe,USD\r\n` +
        `B,20,USD,1,3/25/2022 9:00,Food,Cafe,USD\r\n`;
      const result = previewImport(text, APP_MAPPING, 'dmy', baseCtx);
      expect(result.inferredDateOrder).toBeNull();
      expect(result.valid[0].record.date).toBe('2022-02-03');
      expect(result.invalid[0]).toMatchObject({ line: 3 });
    });
  });

  describe('transaction type column', () => {
    const TYPE_MAPPING: FieldMapping = { ...APP_MAPPING, transactionType: 8 };
    const TYPE_HEADER = `${HEADER.trimEnd()},type\r\n`;

    it('classifies unsigned rows by the type column', () => {
      const text =
        `${TYPE_HEADER}Brownie,50,USD,1,2024-01-01,Food,Cafe,USD,Expense\r\n` +
        `Salary,300,USD,1,2024-01-02,Food,Cafe,USD,Income\r\n`;
      const result = previewImport(text, TYPE_MAPPING, 'iso', baseCtx);
      expect(result.valid).toHaveLength(2);
      expect(result.valid[0].record.type).toBe('expense');
      expect(result.valid[1].record.type).toBe('income');
      expect(result.valid[1].record.description).toBe('Salary');
    });

    it('overrides the sign convention when the two disagree', () => {
      const text = `${TYPE_HEADER}Refund,-5,USD,1,2024-01-01,Food,Cafe,USD,Expense\r\n`;
      const result = previewImport(text, TYPE_MAPPING, 'iso', baseCtx);
      expect(result.valid).toHaveLength(1);
      expect(result.valid[0].record.type).toBe('expense');
      expect(result.valid[0].record.amountNative).toBe(5);
    });

    it('falls back to the sign for values outside the vocabulary', () => {
      const text =
        `${TYPE_HEADER}A,-5,USD,1,2024-01-01,Food,Cafe,USD,Transfer\r\n` +
        `B,10,USD,1,2024-01-02,Food,Cafe,USD,\r\n`;
      const result = previewImport(text, TYPE_MAPPING, 'iso', baseCtx);
      expect(result.valid).toHaveLength(2);
      expect(result.valid[0].record.type).toBe('income');
      expect(result.valid[1].record.type).toBe('expense');
      expect(result.valid[1].record.description).toBe('B');
    });

    it('leaves files without a type column on the sign convention', () => {
      const text = `${HEADER}Salary,-5,USD,1,2024-01-01,Food,Cafe,USD\r\n`;
      const result = previewImport(text, APP_MAPPING, 'iso', baseCtx);
      expect(result.signConventionBypassed).toBe(false);
      expect(result.valid).toHaveLength(1);
      expect(result.valid[0].record.type).toBe('income');
    });

    it('reads a blank type cell as an expense when the file has no negatives', () => {
      const text =
        `${TYPE_HEADER}A,10,USD,1,2024-01-01,Food,Cafe,USD,\r\n` +
        `B,20,USD,1,2024-01-02,Food,Cafe,USD,Income\r\n`;
      const result = previewImport(text, TYPE_MAPPING, 'iso', {
        ...baseCtx,
        negativeMeans: 'expense',
      });
      expect(result.signConventionBypassed).toBe(true);
      expect(result.valid).toHaveLength(2);
      expect(result.valid[0].record.type).toBe('expense');
      expect(result.valid[1].record.type).toBe('income');
    });
  });

  describe('duplicate flagging', () => {
    it('flags a repeated row against its first occurrence in the file', () => {
      const text =
        `${HEADER}Coffee,4,USD,1,2024-01-01,Food,Cafe,USD\r\n` +
        `Coffee,4,USD,1,2024-01-01,Food,Cafe,USD\r\n` +
        `Coffee,4,USD,1,2024-01-01,Food,Cafe,USD\r\n`;
      const result = previewImport(text, APP_MAPPING, 'iso', baseCtx);
      expect(result.valid).toHaveLength(3);
      expect(result.duplicates).toEqual([
        { line: 3, matchesTransactionId: null, matchesLine: 2 },
        { line: 4, matchesTransactionId: null, matchesLine: 2 },
      ]);
    });

    it('prefers a stored match over an in-file one', () => {
      const text =
        `${HEADER}Coffee,4,USD,1,2024-01-01,Food,Cafe,USD\r\n` +
        `Coffee,4,USD,1,2024-01-01,Food,Cafe,USD\r\n`;
      const ctx: ImportContext = {
        ...baseCtx,
        existingTransactions: [
          {
            type: 'expense',
            id: 42,
            description: 'Coffee',
            payee: 'Cafe',
            amountNative: 4,
            currencyCode: 'USD',
            fxRateToBase: 1,
            baseAmount: 4,
            baseCurrencyCode: 'USD',
            date: '2024-01-01',
            categoryId: null,
            notes: null,
            createdAt: '',
            updatedAt: '',
          },
        ],
      };
      const result = previewImport(text, APP_MAPPING, 'iso', ctx);
      expect(result.duplicates).toEqual([
        { line: 2, matchesTransactionId: 42 },
        { line: 3, matchesTransactionId: 42 },
      ]);
    });

    it('separates same-day same-amount rows by their description', () => {
      const text =
        `${HEADER}Snacks,40,USD,1,2024-01-01,Food,,USD\r\n` +
        `Tea,40,USD,1,2024-01-01,Food,,USD\r\n`;
      const result = previewImport(text, APP_MAPPING, 'iso', baseCtx);
      expect(result.valid).toHaveLength(2);
      expect(result.duplicates).toEqual([]);
    });

    it('still matches when description differs only in case or spacing', () => {
      const text =
        `${HEADER}Snacks,40,USD,1,2024-01-01,Food,,USD\r\n` +
        `${'  snacks  ,40,USD,1,2024-01-01,Food,,USD\r\n'}`;
      const result = previewImport(text, APP_MAPPING, 'iso', baseCtx);
      expect(result.duplicates).toEqual([
        { line: 3, matchesTransactionId: null, matchesLine: 2 },
      ]);
    });
  });

  describe('payee fallback', () => {
    it('names a blank payee even when the row carries a category', () => {
      const text = `${HEADER},50,USD,1,2024-01-01,Food,,USD\r\n`;
      const result = previewImport(text, APP_MAPPING, 'iso', baseCtx);
      expect(result.valid[0].record.payee).toBe('Unknown');
      expect(result.valid[0].categoryName).toBe('Food');
    });

    it('leaves a supplied payee untouched', () => {
      const text = `${HEADER},50,USD,1,2024-01-01,Food,Cafe,USD\r\n`;
      const result = previewImport(text, APP_MAPPING, 'iso', baseCtx);
      expect(result.valid[0].record.payee).toBe('Cafe');
    });
  });
});

describe('commitImport', () => {
  let mockDb: object;

  beforeEach(() => {
    jest.clearAllMocks();
    mockDb = {};
    (database.withDatabase as jest.Mock).mockImplementation(cb => cb(mockDb));
    (database.withTransaction as jest.Mock).mockImplementation((_db, work) =>
      work(mockDb),
    );
    (database.createTransactionsBulk as jest.Mock).mockResolvedValue(0);
    (database.upsertCurrencyFxRate as jest.Mock).mockResolvedValue(undefined);
  });

  const previewWith = (): ImportPreview => ({
    valid: [
      {
        line: 2,
        record: {
          type: 'expense',
          description: 'Lunch',
          payee: 'Cafe',
          amountNative: 100,
          currencyCode: 'EUR',
          fxRateToBase: 1.1,
          baseAmount: 110,
          baseCurrencyCode: 'USD',
          date: '2024-01-01',
          notes: null,
        },
        categoryName: 'Food',
        fxRateSource: 'cached',
      },
    ],
    invalid: [{ line: 3, reason: 'bad' }],
    needsFxRate: [],
    fxReview: [],
    currencyReview: [],
    duplicates: [],
    newCategoryNames: ['Food'],
    totalRows: 2,
    inferredDateOrder: null,
    signConventionBypassed: false,
  });

  it('creates missing categories and bulk-inserts with resolved ids', async () => {
    (database.getCategoryByName as jest.Mock).mockResolvedValue(null);
    (database.createCategory as jest.Mock).mockResolvedValue({
      id: 7,
      name: 'Food',
      createdAt: '',
      updatedAt: '',
    } as CategoryRecord);
    (database.createTransactionsBulk as jest.Mock).mockResolvedValue(1);

    const summary = await commitImport(previewWith());

    expect(database.createCategory).toHaveBeenCalledWith(mockDb, {
      name: 'Food',
      type: 'both',
    });
    const inserted = (database.createTransactionsBulk as jest.Mock).mock
      .calls[0][1];
    expect(inserted[0].categoryId).toBe(7);
    expect(database.upsertCurrencyFxRate).toHaveBeenCalledWith(
      mockDb,
      'USD',
      'EUR',
      1.1,
    );
    expect(summary).toEqual({
      insertedExpenses: 1,
      insertedIncome: 0,
      skippedInvalid: 1,
      skippedNeedsFxRate: 0,
      createdCategories: 1,
    });
  });

  it('reuses an existing category without creating it', async () => {
    (database.getCategoryByName as jest.Mock).mockResolvedValue({
      id: 3,
      name: 'Food',
      createdAt: '',
      updatedAt: '',
    } as CategoryRecord);

    const summary = await commitImport(previewWith());

    expect(database.createCategory).not.toHaveBeenCalled();
    expect(summary.createdCategories).toBe(0);
  });

  it('applies accepted FX overrides and recomputes base amount', async () => {
    (database.getCategoryByName as jest.Mock).mockResolvedValue({
      id: 3,
      name: 'Food',
      createdAt: '',
      updatedAt: '',
    });

    await commitImport(previewWith(), { 'USD|EUR': 1.25 });

    const inserted = (database.createTransactionsBulk as jest.Mock).mock
      .calls[0][1];
    expect(inserted[0].fxRateToBase).toBe(1.25);
    expect(inserted[0].baseAmount).toBe(125);
  });

  it('ignores an override keyed by the currency code alone', async () => {
    (database.getCategoryByName as jest.Mock).mockResolvedValue({
      id: 3,
      name: 'Food',
      createdAt: '',
      updatedAt: '',
    });

    await commitImport(previewWith(), { EUR: 1.25 });

    const inserted = (database.createTransactionsBulk as jest.Mock).mock
      .calls[0][1];
    expect(inserted[0].fxRateToBase).toBe(1.1);
  });

  it('leaves a rate the file supplied untouched by an override', async () => {
    (database.getCategoryByName as jest.Mock).mockResolvedValue({
      id: 3,
      name: 'Food',
      createdAt: '',
      updatedAt: '',
    });
    const preview = previewWith();
    preview.valid[0].fxRateSource = 'column';

    await commitImport(preview, { 'USD|EUR': 1.25 });

    const inserted = (database.createTransactionsBulk as jest.Mock).mock
      .calls[0][1];
    expect(inserted[0].fxRateToBase).toBe(1.1);
    expect(inserted[0].baseAmount).toBe(110);
  });

  it('never overrides a parity row', async () => {
    (database.getCategoryByName as jest.Mock).mockResolvedValue({
      id: 3,
      name: 'Food',
      createdAt: '',
      updatedAt: '',
    });
    const preview = previewWith();
    preview.valid[0].fxRateSource = 'parity';
    preview.valid[0].record.currencyCode = 'USD';
    preview.valid[0].record.fxRateToBase = 1;

    await commitImport(preview, { 'USD|USD': 4 });

    const inserted = (database.createTransactionsBulk as jest.Mock).mock
      .calls[0][1];
    expect(inserted[0].fxRateToBase).toBe(1);
  });

  it('reports rows still awaiting a rate apart from malformed ones', async () => {
    (database.getCategoryByName as jest.Mock).mockResolvedValue({
      id: 3,
      name: 'Food',
      createdAt: '',
      updatedAt: '',
    });
    (database.createTransactionsBulk as jest.Mock).mockResolvedValue(1);
    const preview = previewWith();
    preview.needsFxRate = [
      { line: 4, reason: 'FX rate required for INR to MYR.' },
    ];

    const summary = await commitImport(preview);

    expect(summary.skippedInvalid).toBe(1);
    expect(summary.skippedNeedsFxRate).toBe(1);
  });

  it('propagates errors so the transaction can roll back', async () => {
    (database.getCategoryByName as jest.Mock).mockResolvedValue({
      id: 3,
      name: 'Food',
      createdAt: '',
      updatedAt: '',
    });
    (database.createTransactionsBulk as jest.Mock).mockRejectedValue(
      new Error('insert failed'),
    );

    await expect(commitImport(previewWith())).rejects.toThrow('insert failed');
  });
});
