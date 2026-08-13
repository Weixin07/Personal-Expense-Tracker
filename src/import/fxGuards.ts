import { formatFxRate } from '../utils/formatting';
import { fxPairKey } from './types';
import type { FxSuggestion, SuspectDerivedRate } from './types';

/**
 * How far a rate may sit from the last known one before it is queried. An order
 * of magnitude rather than a percentage, so ordinary drift against a stale rate
 * passes quietly while a reciprocal — the usual way this value goes wrong —
 * never does.
 */
export const IMPLAUSIBLE_RATE_FACTOR = 10;

/**
 * Whether a rate is worth a second look before it is applied. A rate with a
 * known counterpart is judged against it; one with none is judged against
 * parity, since a rate of exactly 1 between two different currencies is nearly
 * always a misread of which way the conversion runs.
 */
export const isImplausibleRate = (
  rate: number,
  knownRate: number | null,
): boolean => {
  if (knownRate != null && knownRate > 0) {
    const ratio = rate / knownRate;
    return (
      ratio >= IMPLAUSIBLE_RATE_FACTOR || ratio <= 1 / IMPLAUSIBLE_RATE_FACTOR
    );
  }
  return rate === 1;
};

/** Entered rates worth querying before they are applied to the whole import. */
export const implausibleRates = (
  fxReview: readonly FxSuggestion[],
  rates: Record<string, number>,
): FxSuggestion[] =>
  fxReview.filter(item => {
    const rate = rates[fxPairKey(item.baseCurrencyCode, item.currencyCode)];
    return rate != null && isImplausibleRate(rate, item.suggestedRate);
  });

export const describeSuspectRate = (
  item: FxSuggestion,
  rates: Record<string, number>,
): string => {
  const rate = rates[fxPairKey(item.baseCurrencyCode, item.currencyCode)];
  const known =
    item.suggestedRate != null && item.suggestedRate > 0
      ? ` The rate you last used was ${item.suggestedRate}.`
      : '';
  return (
    `1 ${item.currencyCode} = ${rate} ${item.baseCurrencyCode}` +
    ` affects ${item.rowCount} row${item.rowCount === 1 ? '' : 's'}.${known}`
  );
};

/**
 * Whether a rate derived from a file-supplied base amount contradicts what the
 * pair is worth. Parity between two different currencies is the signature of a
 * base-amount column that holds the file's own currency; a column in some third
 * currency instead derives a rate a known one contradicts by orders of
 * magnitude. Same-currency rows are excluded: they never reach derivation.
 */
export const isSuspectDerivedRate = (candidate: {
  rate: number;
  currencyCode: string;
  baseCurrencyCode: string;
  cachedRate: number | null;
}): boolean =>
  candidate.currencyCode !== candidate.baseCurrencyCode &&
  (candidate.rate === 1 ||
    isImplausibleRate(candidate.rate, candidate.cachedRate));

export const describeSuspectDerivedRate = (item: SuspectDerivedRate): string =>
  `1 ${item.currencyCode} = ${formatFxRate(item.rate)} ${item.baseCurrencyCode}` +
  ` affects ${item.rowCount} row${item.rowCount === 1 ? '' : 's'}.`;
