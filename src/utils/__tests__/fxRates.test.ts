import {
  IMPLAUSIBLE_RATE_FACTOR,
  convertToCurrency,
  deriveCounterpartRate,
  impliedTransferRate,
  isImplausibleRate,
  isSuspectTransferRate,
  ratesForTransaction,
} from '../fxRates';
import type { CounterpartRateInput, TransactionRatesInput } from '../fxRates';
import type { CurrencyFxRateRecord } from '../../database';

const rate = (
  overrides: Partial<CurrencyFxRateRecord> = {},
): CurrencyFxRateRecord => ({
  baseCurrencyCode: 'MYR',
  currencyCode: 'EUR',
  fxRateToBase: 5,
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

describe('isImplausibleRate', () => {
  it('treats parity between two currencies as suspect when nothing is known', () => {
    expect(isImplausibleRate(1, null)).toBe(true);
  });

  it('accepts an ordinary rate when nothing is known', () => {
    expect(isImplausibleRate(4.9, null)).toBe(false);
  });

  it('flags a rate an order of magnitude from the known one', () => {
    expect(isImplausibleRate(50, 5)).toBe(true);
    expect(isImplausibleRate(0.5, 5)).toBe(true);
  });

  it('passes ordinary drift against a stale rate', () => {
    expect(isImplausibleRate(5.4, 5)).toBe(false);
  });

  it('exposes the factor it judges by', () => {
    expect(IMPLAUSIBLE_RATE_FACTOR).toBe(10);
  });
});

describe('impliedTransferRate', () => {
  it('reports what one unit of the source bought', () => {
    expect(impliedTransferRate(1000, 195)).toBeCloseTo(0.195, 10);
  });

  it('has no rate for a zero or negative source amount', () => {
    expect(impliedTransferRate(0, 195)).toBeNull();
    expect(impliedTransferRate(-10, 195)).toBeNull();
  });

  it('has no rate for a non-finite amount', () => {
    expect(impliedTransferRate(Number.NaN, 195)).toBeNull();
    expect(impliedTransferRate(1000, Number.NaN)).toBeNull();
  });
});

describe('isSuspectTransferRate', () => {
  it('flags the same magnitude arriving in a different currency', () => {
    expect(
      isSuspectTransferRate({
        amountNative: 1000,
        counterpartAmount: 1000,
        currencyCode: 'MYR',
        counterpartCurrencyCode: 'EUR',
      }),
    ).toBe(true);
  });

  it('accepts the same magnitude arriving in the same currency', () => {
    expect(
      isSuspectTransferRate({
        amountNative: 1000,
        counterpartAmount: 1000,
        currencyCode: 'MYR',
        counterpartCurrencyCode: 'MYR',
      }),
    ).toBe(false);
  });

  it('compares currencies without regard to case or padding', () => {
    expect(
      isSuspectTransferRate({
        amountNative: 1000,
        counterpartAmount: 1000,
        currencyCode: ' myr ',
        counterpartCurrencyCode: 'MYR',
      }),
    ).toBe(false);
  });

  it('accepts a converted amount', () => {
    expect(
      isSuspectTransferRate({
        amountNative: 1000,
        counterpartAmount: 195,
        currencyCode: 'MYR',
        counterpartCurrencyCode: 'EUR',
      }),
    ).toBe(false);
  });

  it('does not judge a transfer whose currency is unknown on either side', () => {
    expect(
      isSuspectTransferRate({
        amountNative: 1000,
        counterpartAmount: 1000,
        currencyCode: null,
        counterpartCurrencyCode: 'EUR',
      }),
    ).toBe(false);
    expect(
      isSuspectTransferRate({
        amountNative: 1000,
        counterpartAmount: 1000,
        currencyCode: 'MYR',
        counterpartCurrencyCode: null,
      }),
    ).toBe(false);
  });

  it('does not judge a transfer with no counterpart amount', () => {
    expect(
      isSuspectTransferRate({
        amountNative: 1000,
        counterpartAmount: null,
        currencyCode: 'MYR',
        counterpartCurrencyCode: 'EUR',
      }),
    ).toBe(false);
  });
});

describe('convertToCurrency', () => {
  it('leaves an amount already in the base currency alone', () => {
    expect(convertToCurrency(1000, 'MYR', 'MYR', [])).toBe(1000);
  });

  it('divides by the cached rate for the pair', () => {
    expect(convertToCurrency(1000, 'EUR', 'MYR', [rate()])).toBe(200);
  });

  it('rounds to two decimal places', () => {
    expect(
      convertToCurrency(1000, 'EUR', 'MYR', [rate({ fxRateToBase: 3 })]),
    ).toBe(333.33);
  });

  it('matches a cached pair regardless of case', () => {
    expect(convertToCurrency(1000, 'eur', 'myr', [rate()])).toBe(200);
  });

  it('has no answer when the pair is not cached', () => {
    expect(convertToCurrency(1000, 'GBP', 'MYR', [rate()])).toBeNull();
  });

  it('has no answer when the cached rate is not positive', () => {
    expect(
      convertToCurrency(1000, 'EUR', 'MYR', [rate({ fxRateToBase: 0 })]),
    ).toBeNull();
  });

  it('has no answer without a base currency to resolve through', () => {
    expect(convertToCurrency(1000, 'EUR', null, [rate()])).toBeNull();
  });

  it('has no answer without a target currency', () => {
    expect(convertToCurrency(1000, null, 'MYR', [rate()])).toBeNull();
  });

  it('has no answer for a non-finite amount', () => {
    expect(convertToCurrency(Number.NaN, 'EUR', 'MYR', [rate()])).toBeNull();
  });
});

const transfer = (
  overrides: Partial<CounterpartRateInput> = {},
): CounterpartRateInput => ({
  baseAmount: 100,
  counterpartAmount: 3400,
  baseCurrencyCode: 'MYR',
  currencyCode: 'MYR',
  counterpartCurrencyCode: 'JPY',
  ...overrides,
});

describe('deriveCounterpartRate', () => {
  it('returns a rate convertToCurrency reverses to the amount received', () => {
    const derived = deriveCounterpartRate(transfer()) as number;
    const cached = [
      rate({
        baseCurrencyCode: 'MYR',
        currencyCode: 'JPY',
        fxRateToBase: derived,
      }),
    ];
    expect(convertToCurrency(100, 'JPY', 'MYR', cached)).toBe(3400);
  });

  it('holds to the cent for a currency worth a fraction of the base', () => {
    const derived = deriveCounterpartRate(
      transfer({ baseAmount: 250, counterpartAmount: 1450000 }),
    ) as number;
    const cached = [
      rate({
        baseCurrencyCode: 'MYR',
        currencyCode: 'VND',
        fxRateToBase: derived,
      }),
    ];
    expect(convertToCurrency(250, 'VND', 'MYR', cached)).toBe(1450000);
  });

  it('refuses a rate that would overwrite the source leg', () => {
    expect(
      deriveCounterpartRate(
        transfer({ counterpartCurrencyCode: 'MYR', counterpartAmount: 98 }),
      ),
    ).toBeNull();
  });

  it('compares the source currency without regard to case or padding', () => {
    expect(
      deriveCounterpartRate(
        transfer({
          currencyCode: ' myr ',
          counterpartCurrencyCode: 'MYR',
          counterpartAmount: 98,
        }),
      ),
    ).toBeNull();
  });

  it('has no rate to save when the destination holds the base currency', () => {
    expect(
      deriveCounterpartRate(
        transfer({
          currencyCode: 'EUR',
          counterpartCurrencyCode: 'myr',
          counterpartAmount: 98,
        }),
      ),
    ).toBeNull();
  });

  it('has no rate without a base currency to hold it against', () => {
    expect(
      deriveCounterpartRate(transfer({ baseCurrencyCode: null })),
    ).toBeNull();
  });

  it('has no rate for a row that is not a transfer', () => {
    expect(
      deriveCounterpartRate(
        transfer({ counterpartCurrencyCode: null, counterpartAmount: null }),
      ),
    ).toBeNull();
  });

  it('has no rate when nothing is recorded as having arrived', () => {
    expect(
      deriveCounterpartRate(transfer({ counterpartAmount: null })),
    ).toBeNull();
    expect(
      deriveCounterpartRate(transfer({ counterpartAmount: 0 })),
    ).toBeNull();
    expect(
      deriveCounterpartRate(transfer({ counterpartAmount: -5 })),
    ).toBeNull();
    expect(
      deriveCounterpartRate(transfer({ counterpartAmount: Number.NaN })),
    ).toBeNull();
  });

  it('has no rate when the two amounts divide past what a number holds', () => {
    expect(
      deriveCounterpartRate(
        transfer({
          baseAmount: Number.MAX_VALUE,
          counterpartAmount: Number.MIN_VALUE,
        }),
      ),
    ).toBeNull();
  });

  it('has no rate when the two amounts divide past what a number resolves', () => {
    expect(
      deriveCounterpartRate(
        transfer({
          baseAmount: Number.MIN_VALUE,
          counterpartAmount: Number.MAX_VALUE,
        }),
      ),
    ).toBeNull();
  });

  it('has no rate when the amount that left carries none', () => {
    expect(deriveCounterpartRate(transfer({ baseAmount: 0 }))).toBeNull();
    expect(
      deriveCounterpartRate(transfer({ baseAmount: Number.POSITIVE_INFINITY })),
    ).toBeNull();
  });
});

const saved = (
  overrides: Partial<TransactionRatesInput> = {},
): TransactionRatesInput => ({
  amountNative: 100,
  baseAmount: 500,
  fxRateToBase: 5,
  counterpartAmount: 17000,
  baseCurrencyCode: 'MYR',
  currencyCode: 'EUR',
  counterpartCurrencyCode: 'JPY',
  ...overrides,
});

describe('ratesForTransaction', () => {
  it('carries the source leg before the destination', () => {
    expect(ratesForTransaction(saved())).toEqual([
      { baseCurrencyCode: 'MYR', currencyCode: 'EUR', fxRateToBase: 5 },
      {
        baseCurrencyCode: 'MYR',
        currencyCode: 'JPY',
        fxRateToBase: 500 / 17000,
      },
    ]);
  });

  it('saves nothing for a transaction in the base currency', () => {
    expect(
      ratesForTransaction(
        saved({
          currencyCode: 'myr',
          fxRateToBase: 1,
          counterpartCurrencyCode: null,
          counterpartAmount: null,
        }),
      ),
    ).toEqual([]);
  });

  it('saves the source leg alone for a transaction that is not a transfer', () => {
    expect(
      ratesForTransaction(
        saved({ counterpartCurrencyCode: null, counterpartAmount: null }),
      ),
    ).toEqual([
      { baseCurrencyCode: 'MYR', currencyCode: 'EUR', fxRateToBase: 5 },
    ]);
  });

  it('keeps the source leg of a transfer whose two amounts imply parity', () => {
    expect(ratesForTransaction(saved({ counterpartAmount: 100 }))).toEqual([
      { baseCurrencyCode: 'MYR', currencyCode: 'EUR', fxRateToBase: 5 },
    ]);
  });

  it('keeps the source leg of a same-currency transfer that lost a fee', () => {
    expect(
      ratesForTransaction(
        saved({ counterpartCurrencyCode: 'EUR', counterpartAmount: 98 }),
      ),
    ).toEqual([
      { baseCurrencyCode: 'MYR', currencyCode: 'EUR', fxRateToBase: 5 },
    ]);
  });

  it('saves nothing while no base currency is configured', () => {
    expect(ratesForTransaction(saved({ baseCurrencyCode: null }))).toEqual([]);
  });
});
