import {
  describeSuspectDerivedRate,
  describeSuspectRate,
  implausibleRates,
  isImplausibleRate,
  isSuspectDerivedRate,
} from '../fxGuards';
import type { FxSuggestion } from '../types';

const suggestion = (overrides: Partial<FxSuggestion> = {}): FxSuggestion => ({
  baseCurrencyCode: 'MYR',
  currencyCode: 'INR',
  suggestedRate: null,
  suggestedRateUpdatedAt: null,
  rowCount: 1,
  ...overrides,
});

const derived = (rate: number, cachedRate: number | null = null) => ({
  rate,
  currencyCode: 'INR',
  baseCurrencyCode: 'MYR',
  cachedRate,
});

describe('isImplausibleRate', () => {
  it('queries parity when nothing is known about the pair', () => {
    expect(isImplausibleRate(1, null)).toBe(true);
    expect(isImplausibleRate(0.0562, null)).toBe(false);
  });

  it('queries a rate an order of magnitude off a known one', () => {
    expect(isImplausibleRate(0.562, 0.0562)).toBe(true);
    expect(isImplausibleRate(0.00562, 0.0562)).toBe(true);
  });

  it('accepts ordinary drift against a known rate', () => {
    expect(isImplausibleRate(0.05, 0.0562)).toBe(false);
    expect(isImplausibleRate(0.06, 0.0562)).toBe(false);
  });

  it('treats exactly an order of magnitude as far enough to query', () => {
    expect(isImplausibleRate(1, 0.1)).toBe(true);
    expect(isImplausibleRate(0.1, 1)).toBe(true);
  });

  it('falls back to parity when the known rate is unusable', () => {
    expect(isImplausibleRate(1, 0)).toBe(true);
    expect(isImplausibleRate(4.2, 0)).toBe(false);
  });
});

describe('implausibleRates', () => {
  it('reports only the pairs a rate was entered for', () => {
    const review = [
      suggestion(),
      suggestion({ currencyCode: 'USD', suggestedRate: 4.2 }),
    ];

    expect(implausibleRates(review, { 'MYR|INR': 1 })).toEqual([review[0]]);
  });

  it('passes an entered rate close to the saved one', () => {
    const review = [suggestion({ suggestedRate: 0.0562 })];

    expect(implausibleRates(review, { 'MYR|INR': 0.05 })).toEqual([]);
  });
});

describe('isSuspectDerivedRate', () => {
  it('flags parity between two different currencies', () => {
    expect(isSuspectDerivedRate(derived(1))).toBe(true);
  });

  it('flags parity even when a saved rate would tolerate it', () => {
    expect(isSuspectDerivedRate(derived(1, 4.2))).toBe(true);
  });

  it('accepts a rate the file genuinely implies', () => {
    expect(isSuspectDerivedRate(derived(74.7147))).toBe(false);
  });

  it('flags a rate a saved one contradicts by orders of magnitude', () => {
    expect(isSuspectDerivedRate(derived(0.0134, 0.0562))).toBe(false);
    expect(isSuspectDerivedRate(derived(0.0134, 4.2))).toBe(true);
  });

  it('never flags a row whose currency matches its base', () => {
    expect(
      isSuspectDerivedRate({
        rate: 1,
        currencyCode: 'MYR',
        baseCurrencyCode: 'MYR',
        cachedRate: null,
      }),
    ).toBe(false);
  });
});

describe('rate descriptions', () => {
  it('states the entered rate, its weight and the rate it replaces', () => {
    expect(
      describeSuspectRate(suggestion({ suggestedRate: 0.05, rowCount: 276 }), {
        'MYR|INR': 1,
      }),
    ).toBe('1 INR = 1 MYR affects 276 rows. The rate you last used was 0.05.');
  });

  it('states a derived rate at display precision', () => {
    expect(
      describeSuspectDerivedRate({
        baseCurrencyCode: 'MYR',
        currencyCode: 'INR',
        rate: 1,
        rowCount: 1,
      }),
    ).toBe('1 INR = 1.000000 MYR affects 1 row.');
  });
});
