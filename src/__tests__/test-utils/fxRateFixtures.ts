import type { CurrencyFxRateRecord } from '../../database';

/** A dated rate carrying every field, so a test states only what it is about. */
export const makeFxRate = (
  overrides: Partial<CurrencyFxRateRecord> = {},
): CurrencyFxRateRecord => ({
  baseCurrencyCode: 'USD',
  currencyCode: 'EUR',
  fxRateToBase: 1.1,
  effectiveDate: '2025-01-01',
  confirmedAt: '2025-01-01T00:00:00.000Z',
  ...overrides,
});

/**
 * One MYR/EUR history and the rate each point should resolve to. Run through
 * both `rateAsOf` and `getCurrencyFxRateAsOf`, so the in-memory rule and the
 * SQL one are held to the same answers.
 */
export const AS_OF_SERIES: readonly CurrencyFxRateRecord[] = [
  makeFxRate({
    baseCurrencyCode: 'MYR',
    currencyCode: 'EUR',
    fxRateToBase: 4.6,
    effectiveDate: '2026-01-15',
    confirmedAt: '2026-08-20T09:00:00.000Z',
  }),
  makeFxRate({
    baseCurrencyCode: 'MYR',
    currencyCode: 'EUR',
    fxRateToBase: 4.8,
    effectiveDate: '2026-03-01',
    confirmedAt: '2026-03-02T09:00:00.000Z',
  }),
  makeFxRate({
    baseCurrencyCode: 'MYR',
    currencyCode: 'EUR',
    fxRateToBase: 4.9,
    effectiveDate: '2026-08-10',
    confirmedAt: '2026-08-10T09:00:00.000Z',
  }),
  makeFxRate({
    baseCurrencyCode: 'MYR',
    currencyCode: 'JPY',
    fxRateToBase: 0.03,
    effectiveDate: '2026-02-01',
    confirmedAt: '2026-02-01T09:00:00.000Z',
  }),
];

export const AS_OF_EXPECTATIONS: ReadonlyArray<{
  point: string;
  expected: number | null;
}> = [
  { point: '2026-01-14', expected: null },
  { point: '2026-01-15', expected: 4.6 },
  { point: '2026-02-28', expected: 4.6 },
  { point: '2026-03-01', expected: 4.8 },
  { point: '2026-08-09', expected: 4.8 },
  { point: '2026-08-10', expected: 4.9 },
  { point: '2027-01-01', expected: 4.9 },
];
