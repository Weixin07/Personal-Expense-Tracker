import type { FundRecord } from '../database';

/**
 * The fund a transaction falls back to when none is chosen, and the one whose
 * deletion is refused so that fallback always resolves.
 *
 * Identified by lowest id rather than by name: the seeded fund can be renamed,
 * and a fallback keyed to a name would be stranded the moment it was.
 *
 * Returns null only for an empty list, which the schema and seeding together
 * make unreachable outside tests.
 */
export const findDefaultFund = (
  funds: readonly FundRecord[],
): FundRecord | null =>
  funds.reduce<FundRecord | null>(
    (earliest, fund) =>
      earliest === null || fund.id < earliest.id ? fund : earliest,
    null,
  );

export const isDefaultFund = (
  funds: readonly FundRecord[],
  fundId: number,
): boolean => findDefaultFund(funds)?.id === fundId;

/**
 * Currency a fund's opening balance is denominated in. A fund with no currency
 * of its own follows the configured base currency, so its opening balance joins
 * the same group its transactions do.
 */
export const fundCurrency = (
  fund: FundRecord,
  baseCurrency: string | null,
): string | null => fund.currencyCode ?? baseCurrency;
