import { normalizeAmount, previewImport, commitImport } from '../importManager';
import type {
  FieldMapping,
  ImportContext,
  ImportPreview,
  PreparedTransaction,
} from '../types';
import * as database from '../../database';
import type { CategoryRecord } from '../../database';
import { makeImportPreview } from '../../__tests__/test-utils/importFixtures';

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
  existingFunds: [],
  defaultFundId: 1,
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
        suggestedRateUpdatedAt: '2024-01-01T00:00:00Z',
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
        suggestedRateUpdatedAt: null,
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
          time: null,
          categoryId: null,
          fundId: 1,
          counterpartFundId: null,
          counterpartAmount: null,
          counterpartCurrencyCode: null,
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
        `${TYPE_HEADER}A,-5,USD,1,2024-01-01,Food,Cafe,USD,Wibble\r\n` +
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
            time: null,
            categoryId: null,
            fundId: 1,
            counterpartFundId: null,
            counterpartAmount: null,
            counterpartCurrencyCode: null,
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

describe('previewImport base amount derivation', () => {
  const MAPPING: FieldMapping = {
    description: 0,
    amountNative: 1,
    currencyCode: 2,
    baseAmount: 3,
    date: 4,
  };
  const HEAD = 'description,amount,currency,converted,date\r\n';
  const ctx: ImportContext = { ...baseCtx, baseCurrency: 'INR' };

  it('derives the rate from a converted amount the file supplied', () => {
    const text = `${HEAD}Dinner,15,USD,1120.72,2021-12-08\r\n`;
    const result = previewImport(text, MAPPING, 'iso', ctx);

    expect(result.needsFxRate).toHaveLength(0);
    expect(result.valid).toHaveLength(1);
    expect(result.valid[0].fxRateSource).toBe('derived');
    expect(result.valid[0].record.fxRateToBase).toBeCloseTo(74.7147, 4);
  });

  it('stores the supplied base amount rather than recomputing it', () => {
    const text = `${HEAD}Dinner,15,USD,1120.72,2021-12-08\r\n`;
    const result = previewImport(text, MAPPING, 'iso', ctx);

    expect(result.valid[0].record.baseAmount).toBe(1120.72);
  });

  it('keeps a derived pair out of the rate review', () => {
    const text = `${HEAD}Dinner,15,USD,1120.72,2021-12-08\r\n`;
    const result = previewImport(text, MAPPING, 'iso', ctx);

    expect(result.fxReview).toHaveLength(0);
  });

  it('counts only the rows still waiting when a pair partly derives', () => {
    const text =
      `${HEAD}Dinner,15,USD,1120.72,2021-12-08\r\n` +
      `Coffee,4,USD,,2021-12-09\r\n` +
      `Taxi,9,USD,,2021-12-10\r\n`;
    const result = previewImport(text, MAPPING, 'iso', ctx);

    expect(result.fxReview).toHaveLength(1);
    expect(result.fxReview[0].rowCount).toBe(2);
    expect(result.needsFxRate).toHaveLength(2);
  });

  it('falls through to the rate ladder when the cell is blank or unreadable', () => {
    const text =
      `${HEAD}Coffee,4,USD,,2021-12-09\r\n` + `Taxi,9,USD,n/a,2021-12-10\r\n`;
    const result = previewImport(text, MAPPING, 'iso', ctx);

    expect(result.valid).toHaveLength(0);
    expect(result.needsFxRate).toHaveLength(2);
    expect(result.invalid).toHaveLength(0);
  });

  it('reads a signed converted amount by magnitude', () => {
    const text = `${HEAD}Dinner,15,USD,-1120.72,2021-12-08\r\n`;
    const result = previewImport(text, MAPPING, 'iso', ctx);

    expect(result.valid[0].record.baseAmount).toBe(1120.72);
    expect(result.valid[0].record.fxRateToBase).toBeCloseTo(74.7147, 4);
  });

  it('does not derive for a row already at parity', () => {
    const text = `${HEAD}Chai,50,INR,999,2021-12-08\r\n`;
    const result = previewImport(text, MAPPING, 'iso', ctx);

    expect(result.valid[0].fxRateSource).toBe('parity');
    expect(result.valid[0].record.baseAmount).toBe(50);
  });

  it('lets a mapped rate column win over a supplied base amount', () => {
    const withRate: FieldMapping = { ...MAPPING, fxRateToBase: 5 };
    const text = `${HEAD.trim()},rate\r\nDinner,15,USD,1120.72,2021-12-08,80\r\n`;
    const result = previewImport(text, withRate, 'iso', ctx);

    expect(result.valid[0].fxRateSource).toBe('column');
    expect(result.valid[0].record.fxRateToBase).toBe(80);
    expect(result.valid[0].record.baseAmount).toBe(1200);
  });
});

describe('previewImport suspect derived rates', () => {
  const MAPPING: FieldMapping = {
    description: 0,
    amountNative: 1,
    currencyCode: 2,
    baseAmount: 3,
    date: 4,
  };
  const HEAD = 'description,amount,currency,converted,date\r\n';
  const ctx: ImportContext = { ...baseCtx, baseCurrency: 'MYR' };

  it('reports a base-amount column holding the file own currency', () => {
    const text =
      `${HEAD}Brownie,50,INR,50,2022-03-02\r\n` +
      `Dinner,78,INR,78,2022-03-01\r\n`;
    const result = previewImport(text, MAPPING, 'iso', ctx);

    expect(result.suspectDerivedRates).toEqual([
      {
        baseCurrencyCode: 'MYR',
        currencyCode: 'INR',
        rate: 1,
        rowCount: 2,
      },
    ]);
  });

  it('imports the rows it reports rather than withholding them', () => {
    const text = `${HEAD}Brownie,50,INR,50,2022-03-02\r\n`;
    const result = previewImport(text, MAPPING, 'iso', ctx);

    expect(result.valid).toHaveLength(1);
    expect(result.valid[0].fxRateSource).toBe('derived');
    expect(result.needsFxRate).toHaveLength(0);
  });

  it('leaves a genuine conversion unreported', () => {
    const text = `${HEAD}Dinner,15,USD,1120.72,2021-12-08\r\n`;
    const result = previewImport(text, { ...MAPPING }, 'iso', {
      ...baseCtx,
      baseCurrency: 'INR',
    });

    expect(result.suspectDerivedRates).toEqual([]);
    expect(result.valid[0].fxRateSource).toBe('derived');
  });

  it('reports a rate the saved one contradicts by orders of magnitude', () => {
    const text = `${HEAD}Dinner,15,USD,1120.72,2021-12-08\r\n`;
    const result = previewImport(text, MAPPING, 'iso', {
      ...ctx,
      fxRateCache: [
        {
          baseCurrencyCode: 'MYR',
          currencyCode: 'USD',
          fxRateToBase: 4.2,
          updatedAt: '2024-01-01T00:00:00Z',
        },
      ],
    });

    expect(result.suspectDerivedRates).toHaveLength(1);
    expect(result.suspectDerivedRates[0].rowCount).toBe(1);
  });

  it('keeps reporting the pair when a rate was typed for it', () => {
    const text = `${HEAD}Brownie,50,INR,50,2022-03-02\r\n`;
    const result = previewImport(text, MAPPING, 'iso', {
      ...ctx,
      manualFxRates: { 'MYR|INR': 0.0562 },
    });

    expect(result.suspectDerivedRates).toEqual([
      { baseCurrencyCode: 'MYR', currencyCode: 'INR', rate: 1, rowCount: 1 },
    ]);
    expect(result.valid[0].fxRateSource).toBe('derived');
    expect(result.valid[0].record.fxRateToBase).toBe(1);
    expect(result.fxReview).toEqual([]);
  });

  it('cannot report a row that never derives a rate', () => {
    const text = `${HEAD}Chai,50,MYR,999,2021-12-08\r\n`;
    const result = previewImport(text, MAPPING, 'iso', ctx);

    expect(result.valid[0].fxRateSource).toBe('parity');
    expect(result.suspectDerivedRates).toEqual([]);
  });
});

describe('previewImport saved-rate consent', () => {
  const cached: ImportContext = {
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
  const text = `${HEADER}Paris,10,EUR,,2024-01-01,Food,Cafe,USD\r\n`;

  it('resolves from the cache when nothing says otherwise', () => {
    const result = previewImport(text, APP_MAPPING, 'iso', cached);

    expect(result.valid[0].fxRateSource).toBe('cached');
    expect(result.needsFxRate).toHaveLength(0);
  });

  it('holds the rows once the saved rate is rejected', () => {
    const result = previewImport(text, APP_MAPPING, 'iso', {
      ...cached,
      useCachedRates: false,
    });

    expect(result.valid).toHaveLength(0);
    expect(result.needsFxRate).toHaveLength(1);
  });

  it('keeps offering the rejected rate as a suggestion', () => {
    const result = previewImport(text, APP_MAPPING, 'iso', {
      ...cached,
      useCachedRates: false,
    });

    expect(result.fxReview[0].suggestedRate).toBe(1.1);
    expect(result.fxReview[0].suggestedRateUpdatedAt).toBe(
      '2024-01-01T00:00:00Z',
    );
  });

  it('lets a confirmed rate through with the cache rejected', () => {
    const result = previewImport(text, APP_MAPPING, 'iso', {
      ...cached,
      useCachedRates: false,
      manualFxRates: { 'USD|EUR': 1.2 },
    });

    expect(result.valid[0].fxRateSource).toBe('manual');
    expect(result.valid[0].record.fxRateToBase).toBe(1.2);
  });
});

describe('previewImport base currency guard', () => {
  const MAPPING: FieldMapping = {
    description: 0,
    amountNative: 1,
    currencyCode: 2,
    date: 3,
  };
  const HEAD = 'description,amount,currency,date\r\n';
  const noBase: ImportContext = { ...baseCtx, baseCurrency: null };

  it('blocks a multi-currency file when no base currency is set', () => {
    const text =
      `${HEAD}Chai,50,INR,2021-12-08\r\n` + `Dinner,15,USD,2021-12-09\r\n`;
    const result = previewImport(text, MAPPING, 'iso', noBase);

    expect(result.mixedCurrencyWithoutBase).toBe(true);
  });

  it('still imports a single-currency file with no base currency', () => {
    const text =
      `${HEAD}Chai,50,INR,2021-12-08\r\n` + `Samosa,20,INR,2021-12-09\r\n`;
    const result = previewImport(text, MAPPING, 'iso', noBase);

    expect(result.mixedCurrencyWithoutBase).toBe(false);
    expect(result.valid).toHaveLength(2);
  });

  it('does not block once a base currency is set', () => {
    const text =
      `${HEAD}Chai,50,INR,2021-12-08\r\n` + `Dinner,15,USD,2021-12-09\r\n`;
    const result = previewImport(text, MAPPING, 'iso', {
      ...baseCtx,
      baseCurrency: 'INR',
      fxRateCache: [
        {
          baseCurrencyCode: 'INR',
          currencyCode: 'USD',
          fxRateToBase: 74.7,
          updatedAt: '',
        },
      ],
    });

    expect(result.mixedCurrencyWithoutBase).toBe(false);
  });
});

describe('previewImport unmapped columns', () => {
  const MAPPING: FieldMapping = {
    date: 0,
    categoryName: 2,
    amountNative: 4,
    currencyCode: 5,
  };
  const HEAD = 'Date,Account,Category,Subcategory,Amount,Currency\r\n';

  it('reports a populated column no field claims, with a sample value', () => {
    const text =
      `${HEAD}2024-01-01,CUB - online payment,Food,,50,USD\r\n` +
      `2024-01-02,Cash,Food,,20,USD\r\n`;
    const result = previewImport(text, MAPPING, 'iso', baseCtx);

    expect(result.unmappedColumns).toEqual([
      { index: 1, header: 'Account', sampleValue: 'CUB - online payment' },
    ]);
  });

  it('stays silent about an unmapped column that is empty throughout', () => {
    const text = `${HEAD}2024-01-01,,Food,,50,USD\r\n`;
    const result = previewImport(text, MAPPING, 'iso', baseCtx);

    expect(result.unmappedColumns).toHaveLength(0);
  });

  it('reports nothing when every column is mapped', () => {
    const text = `${HEADER},50,USD,1,2024-01-01,Food,Cafe,USD\r\n`;
    const result = previewImport(text, APP_MAPPING, 'iso', baseCtx);

    expect(result.unmappedColumns).toHaveLength(0);
  });
});

describe('previewImport category review', () => {
  const MAPPING: FieldMapping = {
    description: 0,
    amountNative: 1,
    currencyCode: 2,
    date: 3,
    categoryName: 4,
    transactionType: 5,
  };
  const HEAD = 'description,amount,currency,date,category,type\r\n';
  const category = (
    id: number,
    name: string,
    type: CategoryRecord['type'],
  ): CategoryRecord => ({ id, name, type, createdAt: '', updatedAt: '' });

  it('suggests an existing category a new name may be a respelling of', () => {
    const text =
      `${HEAD}Bus,5,USD,2024-01-01,Transportation,Expense\r\n` +
      `Taxi,9,USD,2024-01-02,Transportation,Expense\r\n`;
    const result = previewImport(text, MAPPING, 'iso', {
      ...baseCtx,
      existingCategories: [category(1, 'Transport', 'both')],
      existingFunds: [],
      defaultFundId: 1,
    });

    expect(result.categorySuggestions).toEqual([
      {
        sourceName: 'Transportation',
        existingName: 'Transport',
        existingId: 1,
        rowCount: 2,
      },
    ]);
  });

  it('makes no suggestion for a name that matches an existing one exactly', () => {
    const text = `${HEAD}Bus,5,USD,2024-01-01,Transport,Expense\r\n`;
    const result = previewImport(text, MAPPING, 'iso', {
      ...baseCtx,
      existingCategories: [category(1, 'Transport', 'both')],
      existingFunds: [],
      defaultFundId: 1,
    });

    expect(result.categorySuggestions).toHaveLength(0);
    expect(result.newCategoryNames).toHaveLength(0);
  });

  it('flags a category whose type excludes the direction being filed', () => {
    const text = `${HEAD}Returned item,20,USD,2024-01-01,Refund,Expense\r\n`;
    const result = previewImport(text, MAPPING, 'iso', {
      ...baseCtx,
      existingCategories: [category(1, 'Refund', 'income')],
      existingFunds: [],
      defaultFundId: 1,
    });

    expect(result.categoryTypeWidenings).toEqual([
      { name: 'Refund', from: 'income' },
    ]);
  });

  it('leaves a category alone when the direction already fits', () => {
    const text = `${HEAD}Pay,2000,USD,2024-01-01,Salary,Income\r\n`;
    const result = previewImport(text, MAPPING, 'iso', {
      ...baseCtx,
      existingCategories: [category(1, 'Salary', 'income')],
      existingFunds: [],
      defaultFundId: 1,
    });

    expect(result.categoryTypeWidenings).toHaveLength(0);
  });

  it('leaves a both-typed category alone whichever direction is filed', () => {
    const text =
      `${HEAD}Gift out,20,USD,2024-01-01,Gifts,Expense\r\n` +
      `Gift in,30,USD,2024-01-02,Gifts,Income\r\n`;
    const result = previewImport(text, MAPPING, 'iso', {
      ...baseCtx,
      existingCategories: [category(1, 'Gifts', 'both')],
      existingFunds: [],
      defaultFundId: 1,
    });

    expect(result.categoryTypeWidenings).toHaveLength(0);
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

  const previewWith = (): ImportPreview =>
    makeImportPreview({
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
            time: null,
            counterpartAmount: null,
            counterpartCurrencyCode: null,
            notes: null,
          },
          categoryName: 'Food',
          fundName: null,
          counterpartFundName: null,
          fxRateSource: 'cached',
        },
      ],
      invalid: [{ line: 3, reason: 'bad' }],
      newCategoryNames: ['Food'],
      totalRows: 2,
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
      skippedDuplicates: 0,
      createdCategories: 1,
      createdFunds: 0,
      insertedTransfers: 0,
      seededRates: [
        { baseCurrencyCode: 'USD', currencyCode: 'EUR', fxRateToBase: 1.1 },
      ],
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

  describe('step order', () => {
    const prepared = (
      line: number,
      overrides: Partial<PreparedTransaction['record']> = {},
      categoryName: string | null = 'Food',
      fxRateSource: PreparedTransaction['fxRateSource'] = 'cached',
    ): PreparedTransaction => ({
      line,
      record: {
        type: 'expense',
        description: `Row ${line}`,
        payee: 'Cafe',
        amountNative: 100,
        currencyCode: 'EUR',
        fxRateToBase: 1.1,
        baseAmount: 110,
        baseCurrencyCode: 'USD',
        date: '2024-01-01',
        time: null,
        counterpartAmount: null,
        counterpartCurrencyCode: null,
        notes: null,
        ...overrides,
      },
      categoryName,
      fundName: null,
      counterpartFundName: null,
      fxRateSource,
    });

    const insertedRecords = () =>
      (database.createTransactionsBulk as jest.Mock).mock.calls[0][1];

    it('drops duplicate rows before anything else reads them', async () => {
      (database.getCategoryByName as jest.Mock).mockResolvedValue({
        id: 3,
        name: 'Food',
        type: 'both',
        createdAt: '',
        updatedAt: '',
      });
      const preview = makeImportPreview({
        valid: [prepared(2), prepared(3)],
        duplicates: [{ line: 3, matchesTransactionId: 9 }],
        totalRows: 2,
      });

      const summary = await commitImport(preview, {}, { skipDuplicates: true });

      expect(insertedRecords()).toHaveLength(1);
      expect(insertedRecords()[0].description).toBe('Row 2');
      expect(summary.skippedDuplicates).toBe(1);
    });

    it('imports duplicates when skipping is off', async () => {
      (database.getCategoryByName as jest.Mock).mockResolvedValue({
        id: 3,
        name: 'Food',
        type: 'both',
        createdAt: '',
        updatedAt: '',
      });
      const preview = makeImportPreview({
        valid: [prepared(2), prepared(3)],
        duplicates: [{ line: 3, matchesTransactionId: 9 }],
        totalRows: 2,
      });

      const summary = await commitImport(preview);

      expect(insertedRecords()).toHaveLength(2);
      expect(summary.skippedDuplicates).toBe(0);
    });

    it('skips a row duplicating an earlier line of the same file', async () => {
      (database.getCategoryByName as jest.Mock).mockResolvedValue({
        id: 3,
        name: 'Food',
        type: 'both',
        createdAt: '',
        updatedAt: '',
      });
      const preview = makeImportPreview({
        valid: [prepared(2), prepared(3)],
        duplicates: [{ line: 3, matchesTransactionId: null, matchesLine: 2 }],
        totalRows: 2,
      });

      await commitImport(preview, {}, { skipDuplicates: true });

      expect(insertedRecords()).toHaveLength(1);
    });

    it('does not create a category carried only by a skipped row', async () => {
      (database.getCategoryByName as jest.Mock).mockResolvedValue(null);
      (database.createCategory as jest.Mock).mockResolvedValue({
        id: 7,
        name: 'Food',
        type: 'both',
        createdAt: '',
        updatedAt: '',
      });
      const preview = makeImportPreview({
        valid: [prepared(2), prepared(3, {}, 'Petty cash')],
        duplicates: [{ line: 3, matchesTransactionId: 9 }],
        totalRows: 2,
      });

      const summary = await commitImport(preview, {}, { skipDuplicates: true });

      expect(database.createCategory).toHaveBeenCalledTimes(1);
      expect(database.createCategory).toHaveBeenCalledWith(mockDb, {
        name: 'Food',
        type: 'both',
      });
      expect(summary.createdCategories).toBe(1);
    });

    it('files an aliased name under the existing category without creating it', async () => {
      (database.getCategoryByName as jest.Mock).mockResolvedValue({
        id: 4,
        name: 'Transport',
        type: 'both',
        createdAt: '',
        updatedAt: '',
      });
      const preview = makeImportPreview({
        valid: [prepared(2, {}, 'Transportation')],
        totalRows: 1,
      });

      const summary = await commitImport(
        preview,
        {},
        { categoryAliases: { transportation: 'Transport' } },
      );

      expect(database.getCategoryByName).toHaveBeenCalledWith(
        mockDb,
        'Transport',
      );
      expect(database.createCategory).not.toHaveBeenCalled();
      expect(insertedRecords()[0].categoryId).toBe(4);
      expect(summary.createdCategories).toBe(0);
    });

    it('widens an existing category that excludes the direction being filed', async () => {
      (database.getCategoryByName as jest.Mock).mockResolvedValue({
        id: 5,
        name: 'Refund',
        type: 'income',
        createdAt: '',
        updatedAt: '',
      });
      (database.updateCategory as jest.Mock).mockResolvedValue(undefined);
      const preview = makeImportPreview({
        valid: [prepared(2, { type: 'expense' }, 'Refund')],
        totalRows: 1,
      });

      await commitImport(preview);

      expect(database.updateCategory).toHaveBeenCalledWith(mockDb, {
        id: 5,
        name: 'Refund',
        type: 'both',
      });
    });

    it('leaves a category alone when the direction already fits', async () => {
      (database.getCategoryByName as jest.Mock).mockResolvedValue({
        id: 5,
        name: 'Salary',
        type: 'income',
        createdAt: '',
        updatedAt: '',
      });
      const preview = makeImportPreview({
        valid: [prepared(2, { type: 'income' }, 'Salary')],
        totalRows: 1,
      });

      await commitImport(preview);

      expect(database.updateCategory).not.toHaveBeenCalled();
    });

    it('seeds the rate cache only from rows that were written', async () => {
      (database.getCategoryByName as jest.Mock).mockResolvedValue({
        id: 3,
        name: 'Food',
        type: 'both',
        createdAt: '',
        updatedAt: '',
      });
      const preview = makeImportPreview({
        valid: [
          prepared(2, { currencyCode: 'EUR' }),
          prepared(3, { currencyCode: 'GBP' }),
        ],
        duplicates: [{ line: 3, matchesTransactionId: 9 }],
        totalRows: 2,
      });

      await commitImport(preview, {}, { skipDuplicates: true });

      expect(database.upsertCurrencyFxRate).toHaveBeenCalledTimes(1);
      expect(database.upsertCurrencyFxRate).toHaveBeenCalledWith(
        mockDb,
        'USD',
        'EUR',
        1.1,
      );
    });

    it('keeps a derived rate out of the cache', async () => {
      (database.getCategoryByName as jest.Mock).mockResolvedValue({
        id: 3,
        name: 'Food',
        type: 'both',
        createdAt: '',
        updatedAt: '',
      });
      const preview = makeImportPreview({
        valid: [prepared(2, {}, 'Food', 'derived')],
        totalRows: 1,
      });

      await commitImport(preview);

      expect(database.upsertCurrencyFxRate).not.toHaveBeenCalled();
      expect(insertedRecords()).toHaveLength(1);
    });

    it('never overrides a derived rate with a confirmed one', async () => {
      (database.getCategoryByName as jest.Mock).mockResolvedValue({
        id: 3,
        name: 'Food',
        type: 'both',
        createdAt: '',
        updatedAt: '',
      });
      const preview = makeImportPreview({
        valid: [prepared(2, {}, 'Food', 'derived')],
        totalRows: 1,
      });

      await commitImport(preview, { 'USD|EUR': 9 });

      expect(insertedRecords()[0].fxRateToBase).toBe(1.1);
      expect(insertedRecords()[0].baseAmount).toBe(110);
    });

    it('reports the rates it saved as current', async () => {
      (database.getCategoryByName as jest.Mock).mockResolvedValue({
        id: 3,
        name: 'Food',
        type: 'both',
        createdAt: '',
        updatedAt: '',
      });
      const preview = makeImportPreview({
        valid: [
          prepared(2, { currencyCode: 'EUR' }),
          prepared(3, { currencyCode: 'EUR' }),
          prepared(4, { currencyCode: 'GBP' }),
        ],
        totalRows: 3,
      });

      const summary = await commitImport(preview);

      expect(summary.seededRates).toEqual([
        { baseCurrencyCode: 'USD', currencyCode: 'EUR', fxRateToBase: 1.1 },
        { baseCurrencyCode: 'USD', currencyCode: 'GBP', fxRateToBase: 1.1 },
      ]);
    });

    it('saves nothing for a row already in its base currency', async () => {
      (database.getCategoryByName as jest.Mock).mockResolvedValue({
        id: 3,
        name: 'Food',
        type: 'both',
        createdAt: '',
        updatedAt: '',
      });
      const preview = makeImportPreview({
        valid: [prepared(2, { currencyCode: 'USD' }, 'Food', 'parity')],
        totalRows: 1,
      });

      const summary = await commitImport(preview);

      expect(summary.seededRates).toEqual([]);
      expect(database.upsertCurrencyFxRate).not.toHaveBeenCalled();
    });
  });
});

const TIME_MAPPING: FieldMapping = { ...APP_MAPPING, time: 8 };
const TIME_HEADER =
  'description,amount,currency,fx,date,category,payee,base,time\r\n';
const timedRow = (time: string, date = '2025-01-10') =>
  `Lunch,10.00,USD,1.000000,${date},Food,Cafe,USD,${time}\r\n`;
const untimedRow = (date = '2025-01-10') =>
  `Lunch,10.00,USD,1.000000,${date},Food,Cafe,USD\r\n`;

describe('previewImport time handling', () => {
  it('reads a dedicated time column', () => {
    const preview = previewImport(
      TIME_HEADER + timedRow('14:30'),
      TIME_MAPPING,
      'iso',
      baseCtx,
    );

    expect(preview.valid).toHaveLength(1);
    expect(preview.valid[0].record.time).toBe('14:30');
    expect(preview.unreadableTimes).toHaveLength(0);
  });

  it('falls back to a time carried in the date cell', () => {
    const text =
      HEADER + `Lunch,10.00,USD,1.000000,2025-01-10 08:45,Food,Cafe,USD\r\n`;
    const preview = previewImport(text, APP_MAPPING, 'iso', baseCtx);

    expect(preview.valid[0].record.time).toBe('08:45');
  });

  it('records no time when the source carries none', () => {
    const preview = previewImport(
      HEADER + untimedRow(),
      APP_MAPPING,
      'iso',
      baseCtx,
    );

    expect(preview.valid[0].record.time).toBeNull();
    expect(preview.unreadableTimes).toHaveLength(0);
  });

  it('imports a row whose time cannot be read, reporting it as advisory', () => {
    const preview = previewImport(
      TIME_HEADER + timedRow('25:99'),
      TIME_MAPPING,
      'iso',
      baseCtx,
    );

    expect(preview.valid).toHaveLength(1);
    expect(preview.valid[0].record.time).toBeNull();
    expect(preview.invalid).toHaveLength(0);
    expect(preview.unreadableTimes).toHaveLength(1);
    expect(preview.unreadableTimes[0].line).toBe(2);
  });

  it('does not let an unreadable time reject an otherwise valid row', () => {
    const preview = previewImport(
      TIME_HEADER + timedRow('lunch') + timedRow('14:30', '2025-01-11'),
      TIME_MAPPING,
      'iso',
      baseCtx,
    );

    expect(preview.valid).toHaveLength(2);
    expect(preview.invalid).toHaveLength(0);
    expect(preview.unreadableTimes).toHaveLength(1);
  });
});

describe('previewImport duplicate detection with times', () => {
  const storedAt = (time: string | null, id = 1) => ({
    id,
    type: 'expense' as const,
    description: 'Lunch',
    payee: 'Cafe',
    amountNative: 10,
    currencyCode: 'USD',
    fxRateToBase: 1,
    baseAmount: 10,
    baseCurrencyCode: 'USD',
    date: '2025-01-10',
    time,
    categoryId: null,
    fundId: 1,
    counterpartFundId: null,
    counterpartAmount: null,
    counterpartCurrencyCode: null,
    notes: null,
    createdAt: '',
    updatedAt: '',
  });

  it('flags a match when both sides carry the same time', () => {
    const preview = previewImport(
      TIME_HEADER + timedRow('14:30'),
      TIME_MAPPING,
      'iso',
      { ...baseCtx, existingTransactions: [storedAt('14:30')] },
    );

    expect(preview.duplicates).toEqual([{ line: 2, matchesTransactionId: 1 }]);
  });

  it('does not flag a match when both times are present and differ', () => {
    const preview = previewImport(
      TIME_HEADER + timedRow('14:31'),
      TIME_MAPPING,
      'iso',
      { ...baseCtx, existingTransactions: [storedAt('14:30')] },
    );

    expect(preview.duplicates).toHaveLength(0);
  });

  it('still flags a match when the stored row has no time', () => {
    const preview = previewImport(
      TIME_HEADER + timedRow('14:30'),
      TIME_MAPPING,
      'iso',
      { ...baseCtx, existingTransactions: [storedAt(null)] },
    );

    expect(preview.duplicates).toEqual([{ line: 2, matchesTransactionId: 1 }]);
  });

  it('still flags a match when the imported row has no time', () => {
    const preview = previewImport(HEADER + untimedRow(), APP_MAPPING, 'iso', {
      ...baseCtx,
      existingTransactions: [storedAt('14:30')],
    });

    expect(preview.duplicates).toEqual([{ line: 2, matchesTransactionId: 1 }]);
  });

  it('matches against the stored row sharing its time', () => {
    const preview = previewImport(
      TIME_HEADER + timedRow('09:15'),
      TIME_MAPPING,
      'iso',
      {
        ...baseCtx,
        existingTransactions: [storedAt('14:30', 1), storedAt('09:15', 2)],
      },
    );

    expect(preview.duplicates).toEqual([{ line: 2, matchesTransactionId: 2 }]);
  });

  it('flags a within-file repeat and leaves a distinct time alone', () => {
    const preview = previewImport(
      TIME_HEADER + timedRow('14:30') + timedRow('14:30') + timedRow('09:15'),
      TIME_MAPPING,
      'iso',
      baseCtx,
    );

    expect(preview.duplicates).toEqual([
      { line: 3, matchesTransactionId: null, matchesLine: 2 },
    ]);
  });
});

describe('fund rules on import', () => {
  const FUND_MAPPING: FieldMapping = { ...APP_MAPPING, fundName: 8 };
  const FUND_HEADER = `${HEADER.trimEnd()},fund\r\n`;

  const withFunds = (
    overrides: Partial<ImportContext> = {},
  ): ImportContext => ({
    ...baseCtx,
    existingFunds: [
      {
        id: 1,
        name: 'General',
        currencyCode: null,
        openingBalance: 0,
        notes: null,
        createdAt: '',
        updatedAt: '',
      },
    ],
    defaultFundId: 1,
    ...overrides,
  });

  it('reports an unfamiliar fund name rather than creating one', () => {
    const text = `${FUND_HEADER}A,10,USD,1,2024-01-01,Food,Cafe,USD,Travel\r\n`;

    const result = previewImport(text, FUND_MAPPING, 'iso', withFunds());

    expect(result.newFundNames).toEqual([
      { sourceName: 'Travel', rowCount: 1 },
    ]);
    expect(result.valid[0].fundName).toBe('Travel');
  });

  it('files rows under the default fund when their name was not opted in', async () => {
    const text = `${FUND_HEADER}A,10,USD,1,2024-01-01,Food,Cafe,USD,Travel\r\n`;
    const preview = previewImport(text, FUND_MAPPING, 'iso', withFunds());
    (database.getFundByName as jest.Mock).mockResolvedValue(null);

    const summary = await commitImport(preview, {}, {});

    expect(database.createFund).not.toHaveBeenCalled();
    expect(summary.createdFunds).toBe(0);
    const [, records] = (database.createTransactionsBulk as jest.Mock).mock
      .calls[0];
    expect(records[0].fundId).toBe(1);
  });

  it('creates only the fund names the review step opted in', async () => {
    const text =
      `${FUND_HEADER}A,10,USD,1,2024-01-01,Food,Cafe,USD,Travel\r\n` +
      `B,20,USD,1,2024-01-02,Food,Cafe,USD,Rainy\r\n`;
    const preview = previewImport(text, FUND_MAPPING, 'iso', withFunds());
    (database.getFundByName as jest.Mock).mockResolvedValue(null);
    (database.createFund as jest.Mock).mockResolvedValue({
      id: 7,
      name: 'Travel',
    });

    const summary = await commitImport(
      preview,
      {},
      { createFunds: ['travel'] },
    );

    expect(database.createFund).toHaveBeenCalledTimes(1);
    expect(summary.createdFunds).toBe(1);
  });

  it('files a row under the existing fund its name is aliased to', async () => {
    const text = `${FUND_HEADER}A,10,USD,1,2024-01-01,Food,Cafe,USD,Travelling\r\n`;
    const preview = previewImport(text, FUND_MAPPING, 'iso', withFunds());
    jest.clearAllMocks();
    const db = {};
    (database.withDatabase as jest.Mock).mockImplementation(cb => cb(db));
    (database.withTransaction as jest.Mock).mockImplementation((_db, work) =>
      work(db),
    );
    (database.createTransactionsBulk as jest.Mock).mockResolvedValue(0);
    (database.createCategory as jest.Mock).mockResolvedValue({ id: 9 });
    (database.getFundByName as jest.Mock).mockImplementation(
      async (_db: unknown, name: string) =>
        name === 'Travel' ? { id: 5, name: 'Travel' } : null,
    );

    const summary = await commitImport(
      preview,
      {},
      { fundAliases: { travelling: 'Travel' } },
    );

    expect(database.createFund).not.toHaveBeenCalled();
    expect(summary.createdFunds).toBe(0);
    const [, records] = (database.createTransactionsBulk as jest.Mock).mock
      .calls[0];
    expect(records[0].fundId).toBe(5);
  });

  it('does not read a declared transfer through the sign convention', () => {
    const TYPE_AND_FUND: FieldMapping = {
      ...APP_MAPPING,
      transactionType: 8,
      counterpartFundName: 9,
    };
    const header = `${HEADER.trimEnd()},type,to_fund\r\n`;
    const text =
      `${header}A,-5,USD,1,2024-01-01,Food,Cafe,USD,Transfer,Travel\r\n` +
      `B,-9,USD,1,2024-01-02,Food,Cafe,USD,,\r\n`;

    const result = previewImport(text, TYPE_AND_FUND, 'iso', withFunds());

    // negativeMeans is 'income', so the unsigned ladder would have called the
    // first row income; the declared type must win instead.
    expect(result.valid[0].record.type).toBe('transfer');
    expect(result.valid[1].record.type).toBe('income');
  });

  it('still flags two ordinary rows that differ only by fund', () => {
    const text =
      `${FUND_HEADER}A,10,USD,1,2024-01-01,Food,Cafe,USD,General\r\n` +
      `A,10,USD,1,2024-01-01,Food,Cafe,USD,Travel\r\n`;

    const result = previewImport(text, FUND_MAPPING, 'iso', withFunds());

    // Re-filing a transaction between funds must not stop a re-imported backup
    // recognising it, so the fund is deliberately not part of the identity.
    expect(result.duplicates).toHaveLength(1);
    expect(result.duplicates[0].matchesLine).toBe(2);
  });

  const TRANSFER_SHAPE: FieldMapping = {
    ...APP_MAPPING,
    transactionType: 8,
    fundName: 9,
    counterpartFundName: 10,
    counterpartAmount: 11,
    counterpartCurrency: 12,
  };
  const SHAPE_HEADER = `${HEADER.trimEnd()},type,fund,to_fund,received,received_currency\r\n`;
  const wellFormedTransfer =
    ',50,USD,1,2024-01-02,,,USD,Transfer,General,Travel,60,EUR\r\n';

  it('rejects a transfer that names no destination fund', () => {
    const text =
      `${SHAPE_HEADER},50,USD,1,2024-01-01,,,USD,Transfer,General,,,\r\n` +
      wellFormedTransfer;

    const result = previewImport(text, TRANSFER_SHAPE, 'iso', withFunds());

    expect(result.invalid).toEqual([
      { line: 2, reason: 'A transfer needs a destination fund.' },
    ]);
    expect(result.valid).toHaveLength(1);
  });

  it('rejects a transfer naming the same fund on both sides', () => {
    const text =
      `${SHAPE_HEADER},50,USD,1,2024-01-01,,,USD,Transfer,General,general,,\r\n` +
      wellFormedTransfer;

    const result = previewImport(text, TRANSFER_SHAPE, 'iso', withFunds());

    expect(result.invalid).toEqual([
      {
        line: 2,
        reason: 'A transfer cannot have the same fund on both sides.',
      },
    ]);
    expect(result.valid).toHaveLength(1);
  });

  it('rejects a received amount that is not a positive number', () => {
    const text =
      `${SHAPE_HEADER},50,USD,1,2024-01-01,,,USD,Transfer,General,Travel,0,USD\r\n` +
      wellFormedTransfer;

    const result = previewImport(text, TRANSFER_SHAPE, 'iso', withFunds());

    expect(result.invalid).toEqual([
      { line: 2, reason: 'Amount received is not a positive number.' },
    ]);
    expect(result.valid).toHaveLength(1);
  });

  it('rejects a received currency that is not a valid code', () => {
    const text =
      `${SHAPE_HEADER},50,USD,1,2024-01-01,,,USD,Transfer,General,Travel,60,EU\r\n` +
      wellFormedTransfer;

    const result = previewImport(text, TRANSFER_SHAPE, 'iso', withFunds());

    expect(result.invalid).toHaveLength(1);
    expect(result.invalid[0].line).toBe(2);
    expect(result.invalid[0].reason).toMatch(/^Received currency: /);
    expect(result.valid).toHaveLength(1);
  });

  it('keeps two transfers between different fund pairs apart', () => {
    const TRANSFER_MAPPING: FieldMapping = {
      ...APP_MAPPING,
      transactionType: 8,
      fundName: 9,
      counterpartFundName: 10,
    };
    const header = `${HEADER.trimEnd()},type,fund,to_fund\r\n`;
    const text =
      `${header},50,USD,1,2024-01-01,,,USD,Transfer,General,Travel\r\n` +
      `,50,USD,1,2024-01-01,,,USD,Transfer,General,Rainy\r\n`;

    const result = previewImport(text, TRANSFER_MAPPING, 'iso', withFunds());

    expect(result.valid).toHaveLength(2);
    expect(result.duplicates).toEqual([]);
  });
});
