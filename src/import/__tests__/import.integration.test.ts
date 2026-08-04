import { buildTransactionsCsv } from '../../export/csvBuilder';
import { parseCsv } from '../csvParser';
import { autoDetectMapping } from '../mapping';
import { previewImport, commitImport } from '../importManager';
import type { ImportContext } from '../importManager';
import type { CategoryRecord, TransactionRecord } from '../../database';
import * as database from '../../database';

jest.mock('../../database');

const categories: CategoryRecord[] = [
  { id: 1, name: 'Food', createdAt: '', updatedAt: '', type: 'both' },
];

const transactions: TransactionRecord[] = [
  {
    type: 'expense',
    id: 1,
    description: 'Lunch, with "notes"',
    payee: 'Cafe',
    amountNative: 100,
    currencyCode: 'USD',
    fxRateToBase: 1,
    baseAmount: 100,
    baseCurrencyCode: 'USD',
    date: '2024-01-01',
    categoryId: 1,
    notes: 'line1\nline2',
    createdAt: '',
    updatedAt: '',
  },
  {
    type: 'expense',
    id: 2,
    description: 'Hotel',
    payee: 'Ibis',
    amountNative: 50.5,
    currencyCode: 'EUR',
    fxRateToBase: 1.1,
    baseAmount: 55.55,
    baseCurrencyCode: 'USD',
    date: '2024-02-15',
    categoryId: 1,
    notes: null,
    createdAt: '',
    updatedAt: '',
  },
  {
    type: 'expense',
    id: 3,
    description: 'Deposit',
    payee: 'Agent',
    amountNative: 1234.5,
    currencyCode: 'USD',
    fxRateToBase: 1,
    baseAmount: 1234.5,
    baseCurrencyCode: 'USD',
    date: '2024-03-20',
    categoryId: 1,
    notes: null,
    createdAt: '',
    updatedAt: '',
  },
];

describe('export -> import round trip', () => {
  it('reconstructs the same expenses from the app CSV', () => {
    const { content } = buildTransactionsCsv({ transactions, categories });
    const parsed = parseCsv(content);
    const mapping = autoDetectMapping(parsed.header);

    const ctx: ImportContext = {
      baseCurrency: 'USD',
      defaultCurrency: null,
      currencyChoices: {},
      negativeMeans: 'income',
      numberFormat: 'auto',
      fxRateCache: [],
      existingTransactions: [],
      existingCategories: categories,
    };
    const preview = previewImport(content, mapping, 'iso', ctx);

    expect(preview.invalid).toEqual([]);
    expect(preview.currencyReview).toEqual([]);
    expect(parsed.delimiter).toBe(',');
    expect(preview.valid).toHaveLength(3);

    expect(preview.valid[0].record).toMatchObject({
      description: 'Lunch, with "notes"',
      payee: 'Cafe',
      amountNative: 100,
      currencyCode: 'USD',
      fxRateToBase: 1,
      baseAmount: 100,
      baseCurrencyCode: 'USD',
      date: '2024-01-01',
      notes: 'line1\nline2',
    });
    expect(preview.valid[0].categoryName).toBe('Food');

    expect(preview.valid[1].record).toMatchObject({
      amountNative: 50.5,
      currencyCode: 'EUR',
      fxRateToBase: 1.1,
      baseAmount: 55.55,
      date: '2024-02-15',
    });

    // A four-figure amount is the case the grouping heuristic could misread:
    // buildTransactionsCsv writes two decimals, never the three that would mark a
    // separator as a thousands group.
    expect(preview.valid[2].record).toMatchObject({
      amountNative: 1234.5,
      baseAmount: 1234.5,
      date: '2024-03-20',
    });
  });

  it('commits the reconstructed rows through the bulk insert', async () => {
    const mockDb = {};
    (database.withDatabase as jest.Mock).mockImplementation(cb => cb(mockDb));
    (database.withTransaction as jest.Mock).mockImplementation((_db, work) =>
      work(mockDb),
    );
    (database.getCategoryByName as jest.Mock).mockResolvedValue(categories[0]);
    (database.createTransactionsBulk as jest.Mock).mockResolvedValue(3);
    (database.upsertCurrencyFxRate as jest.Mock).mockResolvedValue(undefined);

    const { content } = buildTransactionsCsv({ transactions, categories });
    const mapping = autoDetectMapping(parseCsv(content).header);
    const preview = previewImport(content, mapping, 'iso', {
      baseCurrency: 'USD',
      defaultCurrency: null,
      currencyChoices: {},
      negativeMeans: 'income',
      numberFormat: 'auto',
      fxRateCache: [],
      existingTransactions: [],
      existingCategories: categories,
    });

    const summary = await commitImport(preview);
    expect(summary.insertedExpenses + summary.insertedIncome).toBe(3);

    const inserted = (database.createTransactionsBulk as jest.Mock).mock
      .calls[0][1];
    expect(inserted).toHaveLength(3);
    expect(inserted[0].categoryId).toBe(1);
  });
});

/**
 * Structural replica of a third-party transaction export: unpadded M/D/YYYY dates
 * with a clock time, an explicit Income/Expense column, unsigned amounts, note
 * text in a column the header does not call a description, repeated header
 * names where the second copy is empty, and a single foreign-currency row.
 * Inline rather than read from disk so the test stays hermetic and carries no
 * real financial data.
 */
const THIRD_PARTY_HEADER =
  'Date,Account,Category,Subcategory,Note,INR,Income/Expense,Note,Amount,Currency,Account';

const THIRD_PARTY_ROWS = [
  '3/2/2022 10:11,CUB,Food,,Brownie,50,Expense,,50,INR,50',
  '3/2/2022 10:11,CUB,Other,,To lended people,300,Expense,,300,INR,300',
  '3/1/2022 19:50,CUB,Food,,Dinner,78,Expense,,78,INR,78',
  '2/28/2022 11:56,CUB,Food,,Pizza,339.15,Expense,,339.15,INR,339.15',
  '12/8/2021 14:15,Cash,Food,,5 star,1120.72,Expense,,15,USD,15',
  '3/1/2022 18:22,CUB,Other,,From vicky,100,Income,,100,INR,100',
  '3/1/2022 18:21,CUB,Other,,From dad,500,Income,,500,INR,500',
];

const buildThirdPartyCsv = (): string =>
  `${THIRD_PARTY_HEADER}\r\n${THIRD_PARTY_ROWS.join('\r\n')}\r\n`;

const thirdPartyMapping = () => {
  const parsed = parseCsv(buildThirdPartyCsv());
  return autoDetectMapping(parsed.header, parsed.rows);
};

describe('third-party CSV with timed M/D dates and a type column', () => {
  const previewThirdParty = (base: string | null = 'INR') => {
    const content = buildThirdPartyCsv();
    const mapping = thirdPartyMapping();
    const ctx: ImportContext = {
      baseCurrency: base,
      defaultCurrency: null,
      currencyChoices: {},
      negativeMeans: 'income',
      numberFormat: 'auto',
      fxRateCache: [],
      existingTransactions: [],
      existingCategories: [],
    };
    return { mapping, preview: previewImport(content, mapping, 'auto', ctx) };
  };

  it('auto-maps the type, description, amount and currency columns', () => {
    const { mapping } = previewThirdParty();
    expect(mapping.date).toBe(0);
    expect(mapping.categoryName).toBe(2);
    expect(mapping.description).toBe(4);
    expect(mapping.notes).toBe(7);
    expect(mapping.transactionType).toBe(6);
    expect(mapping.amountNative).toBe(8);
    expect(mapping.currencyCode).toBe(9);
  });

  it('imports expenses and income with no date failures on auto', () => {
    const { preview } = previewThirdParty();
    expect(preview.inferredDateOrder).toBe('mdy');
    expect(preview.invalid).toEqual([]);
    expect(preview.valid).toHaveLength(6);
    expect(preview.needsFxRate).toHaveLength(1);
    expect(
      preview.valid.filter(row => row.record.type === 'income'),
    ).toHaveLength(2);
  });

  it('resolves the timed M/D dates and titles the row from the note text', () => {
    const { preview } = previewThirdParty();
    expect(preview.valid[0].record).toMatchObject({
      date: '2022-03-02',
      amountNative: 50,
      currencyCode: 'INR',
      description: 'Brownie',
      notes: null,
    });
    expect(preview.valid[0].categoryName).toBe('Food');
  });
});

/**
 * The file's currencies are foreign to the app's base and it carries no rate
 * column, so every transaction row depends on a rate the user has to supply. Covers
 * the whole route from that state to committed rows.
 */
describe('third-party CSV whose currencies are all foreign to the base', () => {
  const previewWithRates = (manualFxRates: Record<string, number> = {}) => {
    const content = buildThirdPartyCsv();
    const mapping = thirdPartyMapping();
    const ctx: ImportContext = {
      baseCurrency: 'MYR',
      defaultCurrency: null,
      currencyChoices: {},
      negativeMeans: 'income',
      numberFormat: 'auto',
      manualFxRates,
      fxRateCache: [],
      existingTransactions: [],
      existingCategories: [],
    };
    return previewImport(content, mapping, 'auto', ctx);
  };

  it('holds every row for review rather than rejecting it', () => {
    const preview = previewWithRates();
    expect(preview.valid).toHaveLength(0);
    expect(preview.invalid).toEqual([]);
    expect(preview.needsFxRate).toHaveLength(7);
    expect(preview.fxReview).toEqual([
      {
        baseCurrencyCode: 'MYR',
        currencyCode: 'INR',
        suggestedRate: null,
        rowCount: 6,
      },
      {
        baseCurrencyCode: 'MYR',
        currencyCode: 'USD',
        suggestedRate: null,
        rowCount: 1,
      },
    ]);
  });

  it('releases every row once both rates are supplied', () => {
    const preview = previewWithRates({ 'MYR|INR': 0.056, 'MYR|USD': 4.42 });
    expect(preview.needsFxRate).toHaveLength(0);
    expect(preview.valid).toHaveLength(7);
    expect(preview.valid[0].record.baseAmount).toBe(2.8);
    expect(preview.valid.every(row => row.fxRateSource === 'manual')).toBe(
      true,
    );
  });

  it('imports what is ready and reports the rest when one rate is missing', async () => {
    const mockDb = {};
    (database.withDatabase as jest.Mock).mockImplementation(cb => cb(mockDb));
    (database.withTransaction as jest.Mock).mockImplementation((_db, work) =>
      work(mockDb),
    );
    (database.getCategoryByName as jest.Mock).mockResolvedValue(null);
    (database.createCategory as jest.Mock).mockResolvedValue(categories[0]);
    (database.createTransactionsBulk as jest.Mock).mockResolvedValue(4);
    (database.upsertCurrencyFxRate as jest.Mock).mockResolvedValue(undefined);

    const preview = previewWithRates({ 'MYR|INR': 0.056 });
    expect(preview.valid).toHaveLength(6);
    expect(preview.needsFxRate).toHaveLength(1);

    const summary = await commitImport(preview);
    expect(summary.insertedExpenses).toBe(4);
    expect(summary.insertedIncome).toBe(2);
    expect(summary.skippedNeedsFxRate).toBe(1);
    expect(summary.skippedInvalid).toBe(0);
  });

  it('seeds the confirmed rate into the cache for later manual entry', async () => {
    const mockDb = {};
    (database.withDatabase as jest.Mock).mockImplementation(cb => cb(mockDb));
    (database.withTransaction as jest.Mock).mockImplementation((_db, work) =>
      work(mockDb),
    );
    (database.getCategoryByName as jest.Mock).mockResolvedValue(categories[0]);
    (database.createTransactionsBulk as jest.Mock).mockResolvedValue(5);
    (database.upsertCurrencyFxRate as jest.Mock).mockClear();
    (database.upsertCurrencyFxRate as jest.Mock).mockResolvedValue(undefined);

    await commitImport(previewWithRates({ 'MYR|INR': 0.056, 'MYR|USD': 4.42 }));

    expect(database.upsertCurrencyFxRate).toHaveBeenCalledWith(
      mockDb,
      'MYR',
      'INR',
      0.056,
    );
    expect(database.upsertCurrencyFxRate).toHaveBeenCalledWith(
      mockDb,
      'MYR',
      'USD',
      4.42,
    );
  });
});

describe('a backup exported before the type column existed', () => {
  // Byte-for-byte the header this app wrote up to schema v6: no type column,
  // and every amount a positive magnitude.
  const LEGACY_HEADER =
    'id,description,amount_native,currency_code,fx_rate_to_base,base_amount,' +
    'date,category,notes,base_currency_code,payee';

  const legacyCsv =
    `\uFEFF${LEGACY_HEADER}\r\n` +
    '1,Lunch,12.50,USD,1.000000,12.50,2024-01-05,Food,,USD,Cafe\r\n' +
    '2,Fuel,40.00,USD,1.000000,40.00,2024-01-06,Food,,USD,Shell\r\n';

  it('imports every row as an expense under the bank-statement default', () => {
    const parsed = parseCsv(legacyCsv);
    const mapping = autoDetectMapping(parsed.header, parsed.rows);

    const preview = previewImport(legacyCsv, mapping, 'iso', {
      baseCurrency: 'USD',
      defaultCurrency: null,
      currencyChoices: {},
      // The shipped default. Without the no-negatives rule this alone would
      // flip every row in the file to income.
      negativeMeans: 'expense',
      numberFormat: 'auto',
      fxRateCache: [],
      existingTransactions: [],
      existingCategories: categories,
    });

    expect(preview.invalid).toEqual([]);
    expect(preview.valid).toHaveLength(2);
    expect(preview.signConventionBypassed).toBe(true);
    expect(preview.valid.every(row => row.record.type === 'expense')).toBe(
      true,
    );
  });

  it('still honours the sign convention once the file carries a negative', () => {
    const withNegative =
      `\uFEFF${LEGACY_HEADER}\r\n` +
      '1,Lunch,-12.50,USD,1.000000,12.50,2024-01-05,Food,,USD,Cafe\r\n' +
      '2,Refund,40.00,USD,1.000000,40.00,2024-01-06,Food,,USD,Shell\r\n';
    const parsed = parseCsv(withNegative);
    const mapping = autoDetectMapping(parsed.header, parsed.rows);

    const preview = previewImport(withNegative, mapping, 'iso', {
      baseCurrency: 'USD',
      defaultCurrency: null,
      currencyChoices: {},
      negativeMeans: 'expense',
      numberFormat: 'auto',
      fxRateCache: [],
      existingTransactions: [],
      existingCategories: categories,
    });

    expect(preview.signConventionBypassed).toBe(false);
    expect(preview.valid[0].record.type).toBe('expense');
    expect(preview.valid[1].record.type).toBe('income');
  });
});
