import { formatFxRate } from '../utils/formatting';
import { isImplausibleRate } from '../utils/fxRates';
import { fxPairKey } from './types';
import type {
  FxSuggestion,
  SuspectDerivedRate,
  TransferConversion,
} from './types';

export { IMPLAUSIBLE_RATE_FACTOR, isImplausibleRate } from '../utils/fxRates';

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

export const describeTransferConversion = (item: TransferConversion): string =>
  `1 ${item.currencyCode} = ${formatFxRate(item.rate)} ${item.counterpartCurrencyCode}` +
  ` affects ${item.rowCount} row${item.rowCount === 1 ? '' : 's'}.`;
