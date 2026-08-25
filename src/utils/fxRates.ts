import type { CurrencyFxRateRecord } from '../database';
import { bankersRound } from './math';
import { validatePositiveRate } from './validation';

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

/**
 * Rate a transfer implies: what one unit of the source currency bought in the
 * destination. Null when the amounts cannot carry a rate, which a caller must
 * treat as "unknown" rather than as evidence either way.
 */
export const impliedTransferRate = (
  amountNative: number,
  counterpartAmount: number,
): number | null => {
  if (!Number.isFinite(amountNative) || amountNative <= 0) {
    return null;
  }
  if (!Number.isFinite(counterpartAmount)) {
    return null;
  }
  return counterpartAmount / amountNative;
};

export type CounterpartRateInput = {
  baseAmount: number;
  counterpartAmount: number | null;
  baseCurrencyCode: string | null;
  currencyCode: string;
  counterpartCurrencyCode: string | null;
};

/**
 * The rate to cache for a transfer's destination currency against the base
 * currency, or null when there is nothing worth caching — which covers a
 * non-transfer, a destination denominated like the source or like the base, and
 * amounts that cannot carry a rate.
 *
 * The quotient is returned unrounded. `convertToCurrency` divides by it, so an
 * unrounded rate returns the received amount the transfer recorded rather than
 * an approximation of it, which matters most for the currencies whose rates sit
 * far below 1.
 */
export const deriveCounterpartRate = ({
  baseAmount,
  counterpartAmount,
  baseCurrencyCode,
  currencyCode,
  counterpartCurrencyCode,
}: CounterpartRateInput): number | null => {
  if (!baseCurrencyCode || !counterpartCurrencyCode) {
    return null;
  }

  const base = baseCurrencyCode.trim().toUpperCase();
  const source = currencyCode.trim().toUpperCase();
  const destination = counterpartCurrencyCode.trim().toUpperCase();

  // A destination denominated like the source shares the source leg's pair, and
  // a transfer that lost a fee on the way implies a rate that contradicts it.
  // Caching that here would overwrite a correct rate with a wrong one, since the
  // counterpart is written second.
  if (destination === source || destination === base) {
    return null;
  }

  if (
    counterpartAmount == null ||
    !Number.isFinite(counterpartAmount) ||
    counterpartAmount <= 0
  ) {
    return null;
  }

  if (!Number.isFinite(baseAmount) || baseAmount <= 0) {
    return null;
  }

  const rate = baseAmount / counterpartAmount;
  return validatePositiveRate(rate, 'FX rate').valid ? rate : null;
};

export type SuspectTransferInput = {
  amountNative: number;
  counterpartAmount: number | null;
  currencyCode: string | null;
  counterpartCurrencyCode: string | null;
};

/**
 * Whether a transfer's two amounts imply a rate its two currencies contradict.
 *
 * A currency that is not known is not evidence of an error, so an absent code on
 * either side answers false rather than guessing. Callers must pass effective
 * currencies — a fund holding none follows the base currency, and comparing the
 * raw column would report every such fund as a mismatch.
 */
export const isSuspectTransferRate = ({
  amountNative,
  counterpartAmount,
  currencyCode,
  counterpartCurrencyCode,
}: SuspectTransferInput): boolean => {
  if (!currencyCode || !counterpartCurrencyCode || counterpartAmount == null) {
    return false;
  }

  if (
    currencyCode.trim().toUpperCase() ===
    counterpartCurrencyCode.trim().toUpperCase()
  ) {
    return false;
  }

  const rate = impliedTransferRate(amountNative, counterpartAmount);
  return rate != null && isImplausibleRate(rate, null);
};

export type DerivedRate = {
  baseCurrencyCode: string;
  currencyCode: string;
  fxRateToBase: number;
};

export type TransactionRatesInput = CounterpartRateInput &
  SuspectTransferInput & { fxRateToBase: number };

/**
 * Every rate a saved transaction is evidence for, in the order they must be
 * written: the currency it was denominated in, then the currency a transfer
 * arrived in. Empty while no base currency is configured.
 *
 * Callers must apply the whole list — to storage and to any cache held
 * alongside — rather than re-testing its conditions themselves.
 */
export const ratesForTransaction = (
  transaction: TransactionRatesInput,
): DerivedRate[] => {
  const { baseCurrencyCode, currencyCode, counterpartCurrencyCode } =
    transaction;
  if (!baseCurrencyCode) {
    return [];
  }

  const rates: DerivedRate[] = [];
  if (
    currencyCode.trim().toUpperCase() !== baseCurrencyCode.trim().toUpperCase()
  ) {
    rates.push({
      baseCurrencyCode,
      currencyCode,
      fxRateToBase: transaction.fxRateToBase,
    });
  }

  const counterpartRate = deriveCounterpartRate(transaction);
  // A transfer whose two amounts contradict its two currencies contributes its
  // source leg only: the destination is the part in doubt, and a rate offered
  // as a default is harder to reject than one typed from scratch.
  if (
    counterpartRate != null &&
    counterpartCurrencyCode != null &&
    !isSuspectTransferRate(transaction)
  ) {
    rates.push({
      baseCurrencyCode,
      currencyCode: counterpartCurrencyCode,
      fxRateToBase: counterpartRate,
    });
  }

  return rates;
};

/**
 * What `baseAmount` is worth in `targetCurrency`, or null when nothing cached
 * covers the pair — which a caller must offer to the user rather than fill in.
 *
 * Rates are held against the base currency, so a conversion between two
 * non-base currencies resolves through it rather than needing a pair of its own.
 */
export const convertToCurrency = (
  baseAmount: number,
  targetCurrency: string | null,
  baseCurrency: string | null,
  cachedRates: readonly CurrencyFxRateRecord[] = [],
): number | null => {
  if (!targetCurrency || !baseCurrency || !Number.isFinite(baseAmount)) {
    return null;
  }

  const target = targetCurrency.trim().toUpperCase();
  const base = baseCurrency.trim().toUpperCase();
  if (target === base) {
    return bankersRound(baseAmount, 2);
  }

  const cached = cachedRates.find(
    rate =>
      rate.baseCurrencyCode.trim().toUpperCase() === base &&
      rate.currencyCode.trim().toUpperCase() === target,
  );
  if (!cached || !(cached.fxRateToBase > 0)) {
    return null;
  }

  return bankersRound(baseAmount / cached.fxRateToBase, 2);
};
