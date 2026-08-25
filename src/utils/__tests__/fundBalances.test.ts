import { calculateFundBalances } from '../fundBalances';
import type { FundRecord, TransactionRecord } from '../../database';

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

const balanceOf = (
  balances: ReturnType<typeof calculateFundBalances>,
  fundId: number,
) => balances.find(item => item.fundId === fundId)?.byCurrency;

describe('calculateFundBalances', () => {
  it('credits a transfer destination what arrived, in the currency it arrived in', () => {
    const balances = calculateFundBalances(
      [fund({ id: 1 }), fund({ id: 2, name: 'Travel', currencyCode: 'EUR' })],
      [transfer()],
      'USD',
    );

    expect(balanceOf(balances, 2)).toEqual([
      { currencyCode: 'EUR', balance: 460 },
    ]);
  });

  it('debits a transfer source what left, in the currency it left in', () => {
    const balances = calculateFundBalances(
      [fund({ id: 1 }), fund({ id: 2, name: 'Travel', currencyCode: 'EUR' })],
      [transfer()],
      'USD',
    );

    expect(balanceOf(balances, 1)).toEqual([
      { currencyCode: 'USD', balance: -500 },
    ]);
  });

  it('files spending under the currency it was recorded in, not the base', () => {
    const balances = calculateFundBalances(
      [fund({ id: 1, currencyCode: 'EUR' })],
      [expense()],
      'USD',
    );

    expect(balanceOf(balances, 1)).toEqual([
      { currencyCode: 'EUR', balance: -30 },
    ]);
  });

  it('adds income to the fund in the currency it was recorded in', () => {
    const balances = calculateFundBalances(
      [fund({ id: 1, currencyCode: 'EUR', openingBalance: 100 })],
      [expense({ type: 'income', amountNative: 25 })],
      'USD',
    );

    expect(balanceOf(balances, 1)).toEqual([
      { currencyCode: 'EUR', balance: 125 },
    ]);
  });

  it('reports a fund whose activity is in another currency as separate figures', () => {
    const balances = calculateFundBalances(
      [fund({ id: 1, currencyCode: 'EUR' })],
      [expense({ currencyCode: 'USD', amountNative: 32.4 })],
      'USD',
    );

    expect(balanceOf(balances, 1)).toEqual([
      { currencyCode: 'EUR', balance: 0 },
      { currencyCode: 'USD', balance: -32.4 },
    ]);
  });

  it('keeps a figure that nets to zero rather than dropping it', () => {
    const balances = calculateFundBalances(
      [fund({ id: 1, currencyCode: 'EUR' })],
      [
        expense({ id: 1, currencyCode: 'EUR', amountNative: 40 }),
        expense({
          id: 2,
          type: 'income',
          currencyCode: 'EUR',
          amountNative: 40,
        }),
      ],
      'USD',
    );

    expect(balanceOf(balances, 1)).toEqual([
      { currencyCode: 'EUR', balance: 0 },
    ]);
  });

  it('orders figures identically however the transactions are ordered', () => {
    const funds = [fund({ id: 1, currencyCode: 'EUR' })];
    const transactions = [
      expense({ id: 1, currencyCode: 'USD', amountNative: 10 }),
      expense({ id: 2, currencyCode: 'GBP', amountNative: 20 }),
      expense({ id: 3, currencyCode: 'EUR', amountNative: 30 }),
    ];

    const forwards = calculateFundBalances(funds, transactions, 'USD');
    const backwards = calculateFundBalances(
      funds,
      [...transactions].reverse(),
      'USD',
    );

    expect(balanceOf(forwards, 1)).toEqual(balanceOf(backwards, 1));
    expect(balanceOf(forwards, 1)?.map(figure => figure.currencyCode)).toEqual([
      'EUR',
      'GBP',
      'USD',
    ]);
  });

  it('gives a fund with no transactions its opening balance alone', () => {
    const balances = calculateFundBalances(
      [fund({ id: 1, currencyCode: 'EUR', openingBalance: 0 })],
      [],
      'USD',
    );

    expect(balanceOf(balances, 1)).toEqual([
      { currencyCode: 'EUR', balance: 0 },
    ]);
  });

  it('leaves a fund following the base currency reporting one figure', () => {
    // The seeded fund holds no currency of its own, which is what every install
    // starts from: its currency and the base currency are the same group.
    const balances = calculateFundBalances(
      [fund({ id: 1, openingBalance: 200 })],
      [expense({ currencyCode: 'USD', amountNative: 50, fxRateToBase: 1 })],
      'USD',
    );

    expect(balanceOf(balances, 1)).toEqual([
      { currencyCode: 'USD', balance: 150 },
    ]);
  });

  it('prefers the recorded received currency over what the fund holds now', () => {
    const balances = calculateFundBalances(
      [fund({ id: 1 }), fund({ id: 2, name: 'Travel', currencyCode: 'GBP' })],
      [transfer()],
      'USD',
    );

    expect(balanceOf(balances, 2)).toEqual([
      { currencyCode: 'GBP', balance: 0 },
      { currencyCode: 'EUR', balance: 460 },
    ]);
  });

  it('resolves a received currency the row never recorded', () => {
    const balances = calculateFundBalances(
      [fund({ id: 1 }), fund({ id: 2, name: 'Travel', currencyCode: 'EUR' })],
      [transfer({ counterpartCurrencyCode: null })],
      'USD',
    );

    expect(balanceOf(balances, 2)).toEqual([
      { currencyCode: 'EUR', balance: 460 },
    ]);
  });

  it('skips the receiving leg of a transfer that records no amount', () => {
    // The schema refuses such a row; the type still admits one, and inventing a
    // figure for it would assert a rate of 1 across the two currencies.
    const balances = calculateFundBalances(
      [fund({ id: 1 }), fund({ id: 2, name: 'Travel', currencyCode: 'EUR' })],
      [transfer({ counterpartAmount: null })],
      'USD',
    );

    expect(balanceOf(balances, 1)).toEqual([
      { currencyCode: 'USD', balance: -500 },
    ]);
    expect(balanceOf(balances, 2)).toEqual([
      { currencyCode: 'EUR', balance: 0 },
    ]);
  });

  it('falls back to the base currency when the destination fund is gone', () => {
    const balances = calculateFundBalances(
      [fund({ id: 1 })],
      [transfer({ counterpartFundId: 7, counterpartCurrencyCode: null })],
      'USD',
    );

    expect(balanceOf(balances, 1)).toEqual([
      { currencyCode: 'USD', balance: -500 },
    ]);
    expect(balanceOf(balances, 7)).toBeUndefined();
  });

  it('leads with the fund currency even when no currency is known at all', () => {
    const balances = calculateFundBalances(
      [fund({ id: 1 })],
      [expense({ currencyCode: 'USD', amountNative: 10 })],
      null,
    );

    expect(balanceOf(balances, 1)).toEqual([
      { currencyCode: null, balance: 0 },
      { currencyCode: 'USD', balance: -10 },
    ]);
  });

  it('rounds each figure to two places', () => {
    const balances = calculateFundBalances(
      [fund({ id: 1, currencyCode: 'EUR' })],
      [
        expense({ id: 1, currencyCode: 'EUR', amountNative: 0.125 }),
        expense({ id: 2, currencyCode: 'EUR', amountNative: 0.005 }),
      ],
      'USD',
    );

    expect(balanceOf(balances, 1)).toEqual([
      { currencyCode: 'EUR', balance: -0.13 },
    ]);
  });
});
