import {
  MAX_SUGGESTIONS,
  buildCategoryUsageCounts,
  buildSuggestionIndex,
  filterSuggestions,
  rankCategoryIdsByFrequency,
} from '../suggestions';
import type { TransactionRecord } from '../../database';

const NOW = new Date(2026, 7, 14, 12, 0, 0);
const IN_WINDOW = '2026-06-01';
const WINDOW_START = '2025-08-14';
const JUST_OUTSIDE = '2025-08-13';
const LONG_AGO = '2021-03-02';

let nextId = 1;

const makeTransaction = (
  overrides: Partial<TransactionRecord> = {},
): TransactionRecord => ({
  id: nextId++,
  type: 'expense',
  description: 'Coffee',
  payee: 'Corner Cafe',
  amountNative: 3.5,
  currencyCode: 'USD',
  fxRateToBase: 1,
  baseAmount: 3.5,
  baseCurrencyCode: 'USD',
  date: IN_WINDOW,
  time: null,
  categoryId: null,
  notes: null,
  createdAt: '2026-06-01T00:00:00.000Z',
  updatedAt: '2026-06-01T00:00:00.000Z',
  ...overrides,
});

const payeeIndex = (
  transactions: readonly TransactionRecord[],
  options: Parameters<typeof buildSuggestionIndex>[2] = {},
) => buildSuggestionIndex(transactions, 'payee', { now: NOW, ...options });

const rankedPayees = (
  transactions: readonly TransactionRecord[],
  query: string,
  options: Parameters<typeof buildSuggestionIndex>[2] = {},
) => filterSuggestions(payeeIndex(transactions, options), query);

const repeat = (count: number, overrides: Partial<TransactionRecord>) =>
  Array.from({ length: count }, () => makeTransaction(overrides));

beforeEach(() => {
  nextId = 1;
});

describe('buildSuggestionIndex', () => {
  it('returns nothing for an empty history', () => {
    expect(payeeIndex([])).toEqual([]);
  });

  it('ranks a more-used value above a less-used one', () => {
    const transactions = [
      ...repeat(3, { payee: 'Tesco' }),
      ...repeat(1, { payee: 'Shell' }),
    ];
    expect(rankedPayees(transactions, 'e')).toEqual(['Tesco', 'Shell']);
  });

  it('ranks any in-window use above a value used more often but only outside it', () => {
    const transactions = [
      ...repeat(1, { payee: 'Tesco', date: IN_WINDOW }),
      ...repeat(9, { payee: 'Shell', date: LONG_AGO }),
    ];
    expect(rankedPayees(transactions, 'e')).toEqual(['Tesco', 'Shell']);
  });

  it('still offers values used only outside the window', () => {
    const transactions = repeat(2, { payee: 'Shell', date: LONG_AGO });
    expect(rankedPayees(transactions, 'sh')).toEqual(['Shell']);
  });

  it('counts a transaction dated exactly on the window start as in-window', () => {
    const transactions = [
      makeTransaction({ payee: 'Boundary', date: WINDOW_START }),
      ...repeat(4, { payee: 'Outside', date: JUST_OUTSIDE }),
    ];
    expect(rankedPayees(transactions, 'o')).toEqual(['Boundary', 'Outside']);
  });

  it('measures the window against the transaction date, not when the row was written', () => {
    const transactions = [
      makeTransaction({
        payee: 'Restored',
        date: LONG_AGO,
        createdAt: '2026-08-14T00:00:00.000Z',
        updatedAt: '2026-08-14T00:00:00.000Z',
      }),
      makeTransaction({ payee: 'Recent', date: IN_WINDOW }),
    ];
    expect(rankedPayees(transactions, 'e')).toEqual(['Recent', 'Restored']);
  });

  it('breaks an equal count by the most recent use', () => {
    const transactions = [
      makeTransaction({ payee: 'Older', date: '2026-01-05' }),
      makeTransaction({ payee: 'Newer', date: '2026-07-20' }),
    ];
    expect(rankedPayees(transactions, 'er')).toEqual(['Newer', 'Older']);
  });

  it('breaks an equal count and an equal date by the time of day', () => {
    const transactions = [
      makeTransaction({ payee: 'Morning', date: IN_WINDOW, time: '08:15' }),
      makeTransaction({ payee: 'Evening', date: IN_WINDOW, time: '19:40' }),
    ];
    expect(rankedPayees(transactions, 'n')).toEqual(['Evening', 'Morning']);
  });

  it('treats a missing time as earlier than any recorded time on the same day', () => {
    const transactions = [
      makeTransaction({ payee: 'Untimed', date: IN_WINDOW, time: null }),
      makeTransaction({ payee: 'Timed', date: IN_WINDOW, time: '00:05' }),
    ];
    expect(rankedPayees(transactions, 'ed')).toEqual(['Timed', 'Untimed']);
  });

  it('breaks a fully equal ranking alphabetically', () => {
    const transactions = [
      makeTransaction({ payee: 'Zebra Ltd', date: IN_WINDOW, time: '09:00' }),
      makeTransaction({ payee: 'Acme Ltd', date: IN_WINDOW, time: '09:00' }),
    ];
    expect(rankedPayees(transactions, 'ltd')).toEqual([
      'Acme Ltd',
      'Zebra Ltd',
    ]);
  });

  describe('grouping', () => {
    it('groups spellings differing only by case or spacing', () => {
      const transactions = [
        makeTransaction({ payee: 'corner cafe', date: '2026-01-01' }),
        makeTransaction({ payee: 'Corner  Cafe', date: '2026-02-01' }),
        makeTransaction({ payee: 'CORNER CAFE', date: '2026-03-01' }),
        makeTransaction({ payee: 'Shell', date: '2026-04-01' }),
      ];
      expect(rankedPayees(transactions, 'c')).toEqual(['CORNER CAFE']);
    });

    it('displays the most recently used spelling of a group', () => {
      const transactions = [
        makeTransaction({ payee: 'TESCO', date: '2026-05-01' }),
        makeTransaction({ payee: 'Tesco', date: '2026-06-01' }),
      ];
      expect(rankedPayees(transactions, 'tes')).toEqual(['Tesco']);
    });

    it('collapses repeated whitespace in the displayed value', () => {
      const transactions = [makeTransaction({ payee: '  The   Bistro  ' })];
      expect(rankedPayees(transactions, 'bistro')).toEqual(['The Bistro']);
    });

    it('keeps values apart when only punctuation differs', () => {
      const transactions = [
        makeTransaction({ payee: "O'Brien's", date: '2026-05-01' }),
        makeTransaction({ payee: 'OBriens', date: '2026-04-01' }),
        makeTransaction({ payee: 'AT&T', date: '2026-03-01' }),
        makeTransaction({ payee: 'ATT', date: '2026-02-01' }),
      ];
      expect(rankedPayees(transactions, 'brien')).toEqual([
        "O'Brien's",
        'OBriens',
      ]);
      expect(rankedPayees(transactions, 'at')).toEqual(['AT&T', 'ATT']);
    });

    it('never offers a blank value', () => {
      const transactions = [
        ...repeat(5, { payee: '' }),
        ...repeat(2, { payee: '   ' }),
        makeTransaction({ payee: 'Shell' }),
      ];
      expect(payeeIndex(transactions)).toHaveLength(1);
      expect(rankedPayees(transactions, 's')).toEqual(['Shell']);
    });
  });

  describe('scoping', () => {
    it('counts only the given direction', () => {
      const transactions = [
        ...repeat(3, { payee: 'Salary Ltd', type: 'income' }),
        makeTransaction({ payee: 'Shell', type: 'expense' }),
      ];
      expect(rankedPayees(transactions, 's', { type: 'expense' })).toEqual([
        'Shell',
      ]);
      expect(rankedPayees(transactions, 's', { type: 'income' })).toEqual([
        'Salary Ltd',
      ]);
    });

    it('counts every direction when none is given', () => {
      const transactions = [
        makeTransaction({ payee: 'Salary Ltd', type: 'income' }),
        makeTransaction({ payee: 'Shell', type: 'expense' }),
      ];
      expect(rankedPayees(transactions, 's')).toHaveLength(2);
    });

    it('excludes the transaction being edited', () => {
      const edited = makeTransaction({ payee: 'Only Use' });
      expect(
        rankedPayees([edited], 'only', { excludeTransactionId: edited.id }),
      ).toEqual([]);
    });
  });

  it('indexes the description field independently of the payee', () => {
    const transactions = [
      makeTransaction({ description: 'Weekly shop', payee: 'Tesco' }),
    ];
    const index = buildSuggestionIndex(transactions, 'description', {
      now: NOW,
    });
    expect(filterSuggestions(index, 'week')).toEqual(['Weekly shop']);
    expect(filterSuggestions(index, 'tesco')).toEqual([]);
  });
});

describe('filterSuggestions', () => {
  const transactions = [
    makeTransaction({ payee: 'Sainsbury — Tesco Metro' }),
    makeTransaction({ payee: 'Costa' }),
  ];

  it('returns the ranking itself for an empty query', () => {
    const byUsage = [
      makeTransaction({ payee: 'Costa' }),
      ...Array.from({ length: 3 }, () =>
        makeTransaction({ payee: 'Sainsbury — Tesco Metro' }),
      ),
    ];
    expect(rankedPayees(byUsage, '')).toEqual([
      'Sainsbury — Tesco Metro',
      'Costa',
    ]);
    expect(rankedPayees(byUsage, '   ')).toEqual([
      'Sainsbury — Tesco Metro',
      'Costa',
    ]);
  });

  it('caps an empty query at the limit like any other', () => {
    const many = Array.from({ length: MAX_SUGGESTIONS + 4 }, (_, index) =>
      makeTransaction({ payee: `Payee ${index}` }),
    );
    expect(rankedPayees(many, '')).toHaveLength(MAX_SUGGESTIONS);
  });

  it('returns nothing for an empty query when there is no history', () => {
    expect(rankedPayees([], '')).toEqual([]);
  });

  it('matches from a single character', () => {
    expect(rankedPayees(transactions, 'c')).toEqual([
      'Costa',
      'Sainsbury — Tesco Metro',
    ]);
  });

  it('matches anywhere in the value, not only at the start', () => {
    expect(rankedPayees(transactions, 'tesco')).toEqual([
      'Sainsbury — Tesco Metro',
    ]);
  });

  it('ignores case and surrounding whitespace in the query', () => {
    expect(rankedPayees(transactions, '  COSTA ')).toEqual(['Costa']);
  });

  it('caps the list at MAX_SUGGESTIONS', () => {
    const many = Array.from({ length: MAX_SUGGESTIONS + 4 }, (_, index) =>
      makeTransaction({ payee: `Payee ${index}` }),
    );
    expect(rankedPayees(many, 'payee')).toHaveLength(MAX_SUGGESTIONS);
  });

  it('honours a caller-supplied limit', () => {
    expect(filterSuggestions(payeeIndex(transactions), 'c', 1)).toEqual([
      'Costa',
    ]);
  });
});

describe('rankCategoryIdsByFrequency', () => {
  it('splits each category’s uses either side of the window', () => {
    const transactions = [
      ...repeat(2, { categoryId: 1, date: IN_WINDOW }),
      ...repeat(3, { categoryId: 1, date: LONG_AGO }),
      ...repeat(1, { categoryId: 2, date: IN_WINDOW }),
    ];
    const counts = rankCategoryIdsByFrequency(transactions, { now: NOW });
    expect(counts.get(1)).toEqual({ inWindow: 2, older: 3 });
    expect(counts.get(2)).toEqual({ inWindow: 1, older: 0 });
  });

  it('omits uncategorised transactions and unused categories', () => {
    const counts = rankCategoryIdsByFrequency(
      [makeTransaction({ categoryId: null })],
      { now: NOW },
    );
    expect(counts.size).toBe(0);
  });

  it('counts only the given direction', () => {
    const transactions = [
      makeTransaction({ categoryId: 1, type: 'income' }),
      ...repeat(2, { categoryId: 1, type: 'expense' }),
    ];
    expect(
      rankCategoryIdsByFrequency(transactions, {
        now: NOW,
        type: 'income',
      }).get(1),
    ).toEqual({ inWindow: 1, older: 0 });
  });
});

describe('buildCategoryUsageCounts', () => {
  it('reports each direction separately alongside the combined total', () => {
    const transactions = [
      makeTransaction({ categoryId: 1, type: 'income' }),
      ...repeat(2, { categoryId: 1, type: 'expense' }),
    ];
    const counts = buildCategoryUsageCounts(transactions, { now: NOW });
    expect(counts.all.get(1)).toEqual({ inWindow: 3, older: 0 });
    expect(counts.expense.get(1)).toEqual({ inWindow: 2, older: 0 });
    expect(counts.income.get(1)).toEqual({ inWindow: 1, older: 0 });
  });
});
