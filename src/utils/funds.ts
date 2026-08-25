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
 * Currency a fund is denominated in: its own, else the configured base
 * currency, else nothing while no base currency has been chosen.
 */
export const fundCurrency = (
  fund: FundRecord,
  baseCurrency: string | null,
): string | null => fund.currencyCode ?? baseCurrency;

/**
 * Currency a transfer's received amount is denominated in: what the row already
 * recorded, else the destination fund's own, else the base currency that fund
 * follows, else the currency the transfer left in.
 *
 * Total by construction. The last fallback is what makes it so — a fund holding
 * no currency and a base currency never chosen would otherwise resolve to
 * nothing, and the schema refuses a transfer that names no received currency.
 * Falling back to the source asserts a same-currency transfer, which is what an
 * unlabelled row already meant.
 */
export const resolveTransferCurrency = (
  recordedCurrencyCode: string | null,
  destinationFund: FundRecord | null,
  baseCurrency: string | null,
  sourceCurrencyCode: string,
): string =>
  recordedCurrencyCode ??
  (destinationFund ? fundCurrency(destinationFund, baseCurrency) : null) ??
  baseCurrency ??
  sourceCurrencyCode;
