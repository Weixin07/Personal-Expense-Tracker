import { calculateFundBalances, formatFundBalance } from '../fundBalances';
import type { FundBalance } from '../fundBalances';
import type {
  CurrencyFxRateRecord,
  FundRecord,
  TransactionRecord,
} from '../../database';

const fund = (overrides: Partial<FundRecord> = {}): FundRecord => ({
  id: 1,
  name: 'General',
  currencyCode: null,
  openingBalance: 0,
  notes: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

const expense = (
  overrides: Partial<TransactionRecord> = {},
): TransactionRecord => ({
  id: 1,
  type: 'expense',
  description: 'Coffee',
  payee: 'Corner Cafe',
  amountNative: 30,
  currencyCode: 'EUR',
  fxRateToBase: 1.08,
  baseAmount: 32.4,
  baseCurrencyCode: 'USD',
  date: '2026-02-01',
  time: null,
  categoryId: null,
  fundId: 1,
  counterpartFundId: null,
  counterpartAmount: null,
  counterpartCurrencyCode: null,
  notes: null,
  createdAt: '2026-02-01T00:00:00.000Z',
  updatedAt: '2026-02-01T00:00:00.000Z',
  ...overrides,
});

const transfer = (
  overrides: Partial<TransactionRecord> = {},
): TransactionRecord =>
  expense({
    id: 50,
    type: 'transfer',
    description: '',
    payee: '',
    amountNative: 500,
    currencyCode: 'USD',
    fxRateToBase: 1,
    baseAmount: 500,
    fundId: 1,
    counterpartFundId: 2,
    counterpartAmount: 460,
    counterpartCurrencyCode: 'EUR',
    ...overrides,
  });

const rate = (
  currencyCode: string,
  fxRateToBase: number,
  baseCurrencyCode = 'USD',
): CurrencyFxRateRecord => ({
  baseCurrencyCode,
  currencyCode,
  fxRateToBase,
  updatedAt: '2026-02-01T00:00:00.000Z',
});

const calculate = ({
  funds,
  transactions = [],
  baseCurrency = 'USD',
  cachedRates = [],
}: {
  funds: readonly FundRecord[];
  transactions?: readonly TransactionRecord[];
  baseCurrency?: string | null;
  cachedRates?: readonly CurrencyFxRateRecord[];
}): FundBalance[] =>
  calculateFundBalances({ funds, transactions, baseCurrency, cachedRates });

const balanceOf = (balances: FundBalance[], fundId: number) =>
  balances.find(item => item.fundId === fundId);

describe('calculateFundBalances', () => {
  it('reports a fund following the base currency as a single figure', () => {
    const balances = calculate({
      funds: [fund({ id: 1, openingBalance: 200 })],
      transactions: [expense({ baseAmount: 32.4 })],
    });

    expect(balanceOf(balances, 1)).toEqual({
      fundId: 1,
      basis: 'converted',
      byCurrency: [{ currencyCode: 'USD', balance: 167.6 }],
    });
  });

  it('adds income and subtracts spending, counting each by its base amount', () => {
    const balances = calculate({
      funds: [fund({ id: 1 })],
      transactions: [
        expense({ id: 1, baseAmount: 40 }),
        expense({ id: 2, type: 'income', baseAmount: 100 }),
      ],
    });

    expect(balanceOf(balances, 1)?.byCurrency).toEqual([
      { currencyCode: 'USD', balance: 60 },
    ]);
  });

  it('needs no rate when the fund already follows the base currency', () => {
    const balances = calculate({
      funds: [fund({ id: 1, currencyCode: 'USD' })],
      transactions: [expense({ baseAmount: 25 })],
      cachedRates: [],
    });

    expect(balanceOf(balances, 1)?.basis).toBe('converted');
    expect(balanceOf(balances, 1)?.byCurrency).toEqual([
      { currencyCode: 'USD', balance: -25 },
    ]);
  });

  it('converts into a fund’s own currency at the cached rate', () => {
    const balances = calculate({
      funds: [fund({ id: 1, currencyCode: 'EUR' })],
      transactions: [expense({ type: 'income', baseAmount: 108 })],
      cachedRates: [rate('EUR', 1.08)],
    });

    expect(balanceOf(balances, 1)?.byCurrency).toEqual([
      { currencyCode: 'EUR', balance: 100 },
    ]);
  });

  it('leaves the opening balance in the fund’s own currency, unconverted', () => {
    // The opening balance is already denominated in the fund's currency, so
    // converting it would restate a figure the user typed in that currency.
    const balances = calculate({
      funds: [fund({ id: 1, currencyCode: 'EUR', openingBalance: 100 })],
      transactions: [expense({ type: 'income', baseAmount: 108 })],
      cachedRates: [rate('EUR', 1.08)],
    });

    expect(balanceOf(balances, 1)?.byCurrency).toEqual([
      { currencyCode: 'EUR', balance: 200 },
    ]);
  });

  it('reports a fund with no transactions as its opening balance alone', () => {
    const balances = calculate({
      funds: [fund({ id: 1, currencyCode: 'EUR', openingBalance: 75 })],
    });

    expect(balanceOf(balances, 1)).toEqual({
      fundId: 1,
      basis: 'converted',
      byCurrency: [{ currencyCode: 'EUR', balance: 75 }],
    });
  });

  it('rounds once at the end rather than per base currency', () => {
    // Each amount rounds to zero on its own under ties-to-even, so rounding as
    // they land would report nothing where the fund holds 0.015.
    const balances = calculate({
      funds: [fund({ id: 1 })],
      transactions: [
        expense({ id: 1, type: 'income', baseAmount: 0.005 }),
        expense({ id: 2, type: 'income', baseAmount: 0.005 }),
        expense({ id: 3, type: 'income', baseAmount: 0.005 }),
      ],
    });

    expect(balanceOf(balances, 1)?.byCurrency).toEqual([
      { currencyCode: 'USD', balance: 0.02 },
    ]);
  });

  describe('transfers', () => {
    it('gives the destination the same base amount the source gives up', () => {
      const balances = calculate({
        funds: [fund({ id: 1 }), fund({ id: 2, name: 'Travel' })],
        transactions: [transfer({ baseAmount: 500 })],
      });

      expect(balanceOf(balances, 1)?.byCurrency).toEqual([
        { currencyCode: 'USD', balance: -500 },
      ]);
      expect(balanceOf(balances, 2)?.byCurrency).toEqual([
        { currencyCode: 'USD', balance: 500 },
      ]);
    });

    it('conserves value across a transfer that lost a fee on the way', () => {
      // The fee is not spending, not income, and not a balance difference: a
      // transfer moves exactly what it took.
      const balances = calculate({
        funds: [
          fund({ id: 1, currencyCode: 'USD' }),
          fund({ id: 2, name: 'Travel', currencyCode: 'USD' }),
        ],
        transactions: [
          transfer({
            baseAmount: 1000,
            counterpartAmount: 995,
            counterpartCurrencyCode: 'USD',
            currencyCode: 'USD',
          }),
        ],
      });

      const source = balanceOf(balances, 1)?.byCurrency[0]?.balance ?? 0;
      const destination = balanceOf(balances, 2)?.byCurrency[0]?.balance ?? 0;

      expect(source + destination).toBe(0);
      expect(destination).toBe(1000);
    });

    it('credits a destination named without a received amount', () => {
      const balances = calculate({
        funds: [fund({ id: 1 }), fund({ id: 2, name: 'Travel' })],
        transactions: [transfer({ baseAmount: 400, counterpartAmount: null })],
      });

      expect(balanceOf(balances, 2)?.byCurrency).toEqual([
        { currencyCode: 'USD', balance: 400 },
      ]);
    });

    it('leaves a transfer naming no destination out of every other fund', () => {
      const balances = calculate({
        funds: [fund({ id: 1 }), fund({ id: 2, name: 'Travel' })],
        transactions: [
          transfer({
            baseAmount: 400,
            counterpartFundId: null,
            counterpartAmount: null,
            counterpartCurrencyCode: null,
          }),
        ],
      });

      expect(balanceOf(balances, 2)?.byCurrency).toEqual([
        { currencyCode: 'USD', balance: 0 },
      ]);
    });
  });

  describe('when a subtotal cannot be converted', () => {
    it('collapses a fund whose several base currencies are all covered', () => {
      const balances = calculate({
        funds: [fund({ id: 1, currencyCode: 'EUR' })],
        transactions: [
          expense({ id: 1, type: 'income', baseAmount: 108 }),
          expense({
            id: 2,
            type: 'income',
            baseAmount: 200,
            baseCurrencyCode: 'MYR',
          }),
        ],
        cachedRates: [rate('EUR', 1.08), rate('EUR', 4, 'MYR')],
      });

      expect(balanceOf(balances, 1)).toEqual({
        fundId: 1,
        basis: 'converted',
        byCurrency: [{ currencyCode: 'EUR', balance: 150 }],
      });
    });

    it('reports every subtotal unconverted when one rate is missing', () => {
      const balances = calculate({
        funds: [fund({ id: 1, currencyCode: 'EUR' })],
        transactions: [
          expense({ id: 1, type: 'income', baseAmount: 108 }),
          expense({
            id: 2,
            type: 'income',
            baseAmount: 200,
            baseCurrencyCode: 'MYR',
          }),
        ],
        cachedRates: [rate('EUR', 1.08)],
      });

      expect(balanceOf(balances, 1)).toEqual({
        fundId: 1,
        basis: 'unconverted',
        byCurrency: [
          { currencyCode: 'EUR', balance: 0 },
          { currencyCode: 'MYR', balance: 200 },
          { currencyCode: 'USD', balance: 108 },
        ],
      });
    });

    it('cannot convert a subtotal recorded against no base currency', () => {
      const balances = calculate({
        funds: [fund({ id: 1, currencyCode: 'EUR' })],
        transactions: [
          expense({ type: 'income', baseAmount: 50, baseCurrencyCode: null }),
        ],
        cachedRates: [rate('EUR', 1.08)],
      });

      expect(balanceOf(balances, 1)?.basis).toBe('unconverted');
      expect(balanceOf(balances, 1)?.byCurrency).toEqual([
        { currencyCode: 'EUR', balance: 0 },
        { currencyCode: null, balance: 50 },
      ]);
    });

    it('cannot convert while no base currency has been chosen', () => {
      const balances = calculate({
        funds: [fund({ id: 1 })],
        transactions: [expense({ type: 'income', baseAmount: 50 })],
        baseCurrency: null,
      });

      expect(balanceOf(balances, 1)?.basis).toBe('unconverted');
      expect(balanceOf(balances, 1)?.byCurrency).toEqual([
        { currencyCode: null, balance: 0 },
        { currencyCode: 'USD', balance: 50 },
      ]);
    });

    it('rounds each unconverted subtotal to two places', () => {
      const balances = calculate({
        funds: [fund({ id: 1, currencyCode: 'EUR' })],
        transactions: [
          expense({
            id: 1,
            type: 'income',
            baseAmount: 0.1,
            baseCurrencyCode: 'MYR',
          }),
          expense({
            id: 2,
            type: 'income',
            baseAmount: 0.2,
            baseCurrencyCode: 'MYR',
          }),
        ],
      });

      expect(balanceOf(balances, 1)?.byCurrency).toEqual([
        { currencyCode: 'EUR', balance: 0 },
        { currencyCode: 'MYR', balance: 0.3 },
      ]);
    });

    it('orders an uncoded subtotal against the coded ones', () => {
      const balances = calculate({
        funds: [fund({ id: 1, currencyCode: 'EUR' })],
        transactions: [
          expense({
            id: 1,
            type: 'income',
            baseAmount: 50,
            baseCurrencyCode: null,
          }),
          expense({
            id: 2,
            type: 'income',
            baseAmount: 200,
            baseCurrencyCode: 'MYR',
          }),
        ],
      });

      expect(balanceOf(balances, 1)?.byCurrency).toEqual([
        { currencyCode: 'EUR', balance: 0 },
        { currencyCode: null, balance: 50 },
        { currencyCode: 'MYR', balance: 200 },
      ]);
    });

    it('orders an uncoded subtotal the same however it was recorded', () => {
      const balances = calculate({
        funds: [fund({ id: 1, currencyCode: 'EUR' })],
        transactions: [
          expense({
            id: 1,
            type: 'income',
            baseAmount: 200,
            baseCurrencyCode: 'MYR',
          }),
          expense({
            id: 2,
            type: 'income',
            baseAmount: 50,
            baseCurrencyCode: null,
          }),
        ],
      });

      expect(balanceOf(balances, 1)?.byCurrency).toEqual([
        { currencyCode: 'EUR', balance: 0 },
        { currencyCode: null, balance: 50 },
        { currencyCode: 'MYR', balance: 200 },
      ]);
    });

    it('stops at the first subtotal it cannot convert', () => {
      const balances = calculate({
        funds: [fund({ id: 1, currencyCode: 'EUR' })],
        transactions: [
          expense({
            id: 1,
            type: 'income',
            baseAmount: 200,
            baseCurrencyCode: 'MYR',
          }),
          expense({ id: 2, type: 'income', baseAmount: 108 }),
        ],
        cachedRates: [rate('EUR', 1.08)],
      });

      expect(balanceOf(balances, 1)?.basis).toBe('unconverted');
    });

    it('names the fund’s own currency even when nothing was recorded in it', () => {
      const balances = calculate({
        funds: [fund({ id: 1, currencyCode: 'EUR' })],
        transactions: [
          expense({ type: 'income', baseAmount: 200, baseCurrencyCode: 'MYR' }),
        ],
      });

      expect(balanceOf(balances, 1)?.byCurrency[0]).toEqual({
        currencyCode: 'EUR',
        balance: 0,
      });
    });
  });

  it('reports the same balance whatever order the transactions arrive in', () => {
    const funds = [fund({ id: 1 }), fund({ id: 2, name: 'Travel' })];
    const transactions = [
      expense({ id: 1, baseAmount: 40 }),
      transfer({ id: 2, baseAmount: 100 }),
      expense({ id: 3, type: 'income', baseAmount: 250 }),
    ];

    expect(calculate({ funds, transactions })).toEqual(
      calculate({ funds, transactions: [...transactions].reverse() }),
    );
  });
});

describe('formatFundBalance', () => {
  const converted: FundBalance = {
    fundId: 1,
    basis: 'converted',
    byCurrency: [{ currencyCode: 'USD', balance: 967.6 }],
  };

  const unconverted: FundBalance = {
    fundId: 2,
    basis: 'unconverted',
    byCurrency: [
      { currencyCode: 'USD', balance: 1000 },
      { currencyCode: 'MYR', balance: -450 },
    ],
  };

  it('writes a converted balance as one figure, unmarked', () => {
    expect(formatFundBalance(converted)).toBe('+967.60 USD');
  });

  it('marks an unconverted balance for a reader', () => {
    expect(formatFundBalance(unconverted)).toBe(
      '+1,000.00 USD · -450.00 MYR  ⚠ unconverted',
    );
  });

  it('spells the marker out for a screen reader', () => {
    // The glyph is announced inconsistently, so a spoken label carries the word.
    expect(formatFundBalance(unconverted, { marker: 'text' })).toBe(
      '+1,000.00 USD, -450.00 MYR, unconverted',
    );
  });

  it('leaves a converted balance identical whichever marker is asked for', () => {
    expect(formatFundBalance(converted, { marker: 'text' })).toBe(
      formatFundBalance(converted),
    );
  });
});
