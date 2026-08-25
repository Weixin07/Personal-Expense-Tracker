import {
  validateBaseAmountPrecision,
  validateCurrencyCode,
  validateIsoDateWithinFutureWindow,
  validatePositiveAmount,
  validatePositiveRate,
  validateTimeOfDay,
} from '../utils/validation';
import { formatMoneyAmount, formatFxRate } from '../utils/formatting';
import { localIsoDate, localTimeOfDay } from '../utils/date';
import { findDefaultFund, resolveTransferCurrency } from '../utils/funds';
import { convertToCurrency, isSuspectTransferRate } from '../utils/fxRates';
import type {
  CategoryRecord,
  CurrencyFxRateRecord,
  FundRecord,
  TransactionDirection,
  TransactionRecord,
  TransactionType,
  NewTransactionRecord,
  UpdateTransactionRecord,
} from '../database';

/**
 * Categories a transaction of this direction may be filed under: those matching
 * the direction, plus every `both` category, which qualifies for either.
 */
export const categoriesForDirection = (
  categories: readonly CategoryRecord[],
  type: TransactionDirection,
): CategoryRecord[] =>
  categories.filter(
    category => category.type === type || category.type === 'both',
  );

export type TransactionFormValues = {
  type: TransactionType;
  description: string;
  payee: string;
  amountNative: string;
  currencyCode: string;
  fxRateToBase: string;
  baseAmount: string;
  baseCurrencyCode: string | null;
  date: string;
  time: string;
  categoryId: number | null;
  fundId: number | null;
  counterpartFundId: number | null;
  counterpartAmount: string;
  /**
   * Currency the destination fund holds, resolved when it is chosen. Carried on
   * the form so the stored row records what the amount was denominated in at the
   * time, rather than trusting a fund that can be re-denominated later.
   */
  counterpartCurrencyCode: string | null;
  notes: string;
};

export type TransactionFormErrors = Partial<
  Record<
    | 'amountNative'
    | 'currencyCode'
    | 'fxRateToBase'
    | 'baseAmount'
    | 'date'
    | 'time'
    | 'fundId'
    | 'counterpartFundId'
    | 'counterpartAmount',
    string
  >
> & { form?: string };

/**
 * Something worth querying about an otherwise valid entry. Carried alongside the
 * payload rather than reported by a separate check, so a caller cannot save
 * without having been handed it.
 */
export type TransactionFormWarning = {
  field: 'counterpartAmount';
  code: 'suspect-transfer-rate';
  message: string;
};

export type TransactionFormValidationResult =
  | {
      ok: true;
      value: ValidTransactionPayload;
      warnings: TransactionFormWarning[];
    }
  | { ok: false; errors: TransactionFormErrors };

export type ValidTransactionPayload = {
  type: TransactionType;
  description: string;
  payee: string;
  amountNative: number;
  currencyCode: string;
  fxRateToBase: number;
  baseAmount: number;
  baseCurrencyCode: string | null;
  date: string;
  time: string | null;
  categoryId: number | null;
  fundId: number;
  counterpartFundId: number | null;
  counterpartAmount: number | null;
  counterpartCurrencyCode: string | null;
  notes: string | null;
};

export const computeBaseAmount = (
  amountNative: string,
  fxRateToBase: string,
): number | null => {
  const amount = Number(amountNative);
  const rate = Number(fxRateToBase);

  if (!Number.isFinite(amount) || !Number.isFinite(rate)) {
    return null;
  }

  const product = amount * rate;
  if (!Number.isFinite(product)) {
    return null;
  }

  return Math.round(product * 1e8) / 1e8;
};

/**
 * Resolve the FX-rate string to prefill for a given native currency.
 * Returns '1.000000' when the currency matches the base, the last cached rate
 * for the (base, currency) pair when one exists, or '' when unknown.
 */
export const resolveFxRateForCurrency = (
  currencyCode: string,
  baseCurrency: string | null,
  cachedRates: readonly CurrencyFxRateRecord[] = [],
): string => {
  const code = currencyCode.trim().toUpperCase();
  if (!code || !baseCurrency) {
    return '';
  }

  const base = baseCurrency.trim().toUpperCase();
  if (code === base) {
    return formatFxRate(1);
  }

  const cached = cachedRates.find(
    rate =>
      rate.baseCurrencyCode.toUpperCase() === base &&
      rate.currencyCode.toUpperCase() === code,
  );
  return cached ? formatFxRate(cached.fxRateToBase) : '';
};

/**
 * Currency and rate to adopt when a fund is chosen, or null to leave the form
 * as it stands. Null covers both the fund that carries no currency of its own —
 * it follows the base currency, so there is nothing to adopt — and the form
 * whose currency the user has already chosen.
 *
 * Rate and currency move together. A currency adopted without its rate would
 * leave the previous currency's rate in place, and the base amount computes
 * from that rate. An uncached pair resolves to no rate at all, in which case
 * `currentRate` is retained rather than blanked.
 */
export const resolveFundCurrencySeed = (
  fund: FundRecord | null,
  currencyTouched: boolean,
  currentRate: string,
  baseCurrency: string | null,
  cachedRates: readonly CurrencyFxRateRecord[] = [],
): Pick<TransactionFormValues, 'currencyCode' | 'fxRateToBase'> | null => {
  if (currencyTouched || !fund?.currencyCode) {
    return null;
  }

  const resolvedRate = resolveFxRateForCurrency(
    fund.currencyCode,
    baseCurrency,
    cachedRates,
  );
  return {
    currencyCode: fund.currencyCode,
    fxRateToBase: resolvedRate !== '' ? resolvedRate : currentRate,
  };
};

export const getDefaultTransactionFormValues = (
  baseCurrency: string | null,
  categories: CategoryRecord[],
  existing?: TransactionRecord,
  cachedRates: readonly CurrencyFxRateRecord[] = [],
  funds: readonly FundRecord[] = [],
): TransactionFormValues => {
  if (existing) {
    // The stored category is kept even when its type no longer matches the
    // direction: narrowing a category must not silently rewrite transactions
    // already filed under it.
    return {
      type: existing.type,
      description: existing.description,
      payee: existing.payee,
      amountNative: formatMoneyAmount(existing.amountNative),
      currencyCode: existing.currencyCode,
      fxRateToBase: formatFxRate(existing.fxRateToBase),
      baseAmount: formatMoneyAmount(existing.baseAmount),
      baseCurrencyCode: existing.baseCurrencyCode ?? baseCurrency,
      date: existing.date,
      time: existing.time ?? '',
      categoryId: existing.categoryId ?? null,
      fundId: existing.fundId,
      counterpartFundId: existing.counterpartFundId,
      counterpartAmount:
        existing.counterpartAmount != null
          ? formatMoneyAmount(existing.counterpartAmount)
          : '',
      counterpartCurrencyCode: existing.counterpartCurrencyCode,
      notes: existing.notes ?? '',
    };
  }

  const now = new Date();
  const isoDate = localIsoDate(now);
  const currencyCode = baseCurrency ?? '';
  const selectable = categoriesForDirection(categories, 'expense');

  return {
    type: 'expense',
    description: '',
    payee: '',
    amountNative: '',
    currencyCode,
    fxRateToBase: resolveFxRateForCurrency(
      currencyCode,
      baseCurrency,
      cachedRates,
    ),
    baseAmount: '',
    baseCurrencyCode: baseCurrency,
    date: isoDate,
    time: localTimeOfDay(now),
    categoryId: selectable.length ? selectable[0].id : null,
    fundId: findDefaultFund(funds)?.id ?? null,
    counterpartFundId: null,
    counterpartAmount: '',
    counterpartCurrencyCode: null,
    notes: '',
  };
};

const ensureNotes = (value: string): string | null => {
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
};

/**
 * Currency the destination holds for the purpose of this entry: what the form
 * captured when the fund was chosen, else the fund's own currency, else the base
 * currency a fund without one follows, and last the currency the transfer left
 * in — the fallback that keeps this total, under `resolveTransferCurrency`.
 */
export const resolveCounterpartCurrency = (
  counterpartFundId: number | null,
  counterpartCurrencyCode: string | null,
  funds: readonly FundRecord[],
  baseCurrency: string | null,
  sourceCurrencyCode: string,
): string =>
  resolveTransferCurrency(
    counterpartCurrencyCode,
    funds.find(item => item.id === counterpartFundId) ?? null,
    baseCurrency,
    sourceCurrencyCode,
  );

/**
 * Amount to prefill as what arrived, or null to leave the field as it stands —
 * which is what an uncached currency pair resolves to, since a figure that
 * cannot be derived must be asked for rather than guessed.
 */
export const resolveCounterpartAmountSeed = (
  amountNative: string,
  fxRateToBase: string,
  counterpartCurrency: string | null,
  baseCurrency: string | null,
  cachedRates: readonly CurrencyFxRateRecord[] = [],
): string | null => {
  const baseAmount = computeBaseAmount(amountNative, fxRateToBase);
  if (baseAmount == null || baseAmount <= 0) {
    return null;
  }

  const converted = convertToCurrency(
    baseAmount,
    counterpartCurrency,
    baseCurrency,
    cachedRates,
  );
  return converted == null ? null : formatMoneyAmount(converted);
};

/**
 * Checks a filled form and, on success, returns the payload to persist along
 * with anything worth querying first. `funds` and `baseCurrency` are needed to
 * resolve what the destination of a transfer is denominated in.
 *
 * The payload carries that resolved currency rather than whatever the form
 * captured: the schema refuses a transfer naming no received currency, so a
 * form value left null would abort the write.
 */
export const validateTransactionForm = (
  values: TransactionFormValues,
  funds: readonly FundRecord[],
  baseCurrency: string | null,
): TransactionFormValidationResult => {
  const errors: TransactionFormErrors = {};

  const description = values.description.trim();
  const payee = values.payee.trim();

  const amountCheck = validatePositiveAmount(
    Number(values.amountNative),
    'Amount',
  );
  if (!amountCheck.valid) {
    errors.amountNative = amountCheck.message;
  }

  const rateCheck = validatePositiveRate(
    Number(values.fxRateToBase),
    'FX rate',
  );
  if (!rateCheck.valid) {
    errors.fxRateToBase = rateCheck.message;
  }

  const currencyCheck = validateCurrencyCode(values.currencyCode);
  if (!currencyCheck.valid) {
    errors.currencyCode = currencyCheck.message;
  }

  if (values.baseCurrencyCode) {
    const baseCurrencyCheck = validateCurrencyCode(values.baseCurrencyCode);
    if (!baseCurrencyCheck.valid) {
      errors.form =
        'Base currency is invalid. Set a valid base currency in Settings.';
    }
  }

  const baseAmountNumber = computeBaseAmount(
    values.amountNative,
    values.fxRateToBase,
  );
  if (baseAmountNumber == null) {
    errors.baseAmount = 'Base amount could not be computed.';
  } else {
    const baseAmountCheck = validateBaseAmountPrecision(
      baseAmountNumber.toFixed(8),
    );
    if (!baseAmountCheck.valid) {
      errors.baseAmount = baseAmountCheck.message;
    }
  }

  const dateCheck = validateIsoDateWithinFutureWindow(values.date);
  if (!dateCheck.valid) {
    errors.date = dateCheck.message;
  }

  const timeCheck = validateTimeOfDay(values.time);
  if (!timeCheck.valid) {
    errors.time = timeCheck.message;
  }

  const isTransfer = values.type === 'transfer';

  if (values.fundId == null) {
    errors.fundId = 'Choose a fund.';
  }

  let counterpartAmount: number | null = null;
  const counterpartCurrency = isTransfer
    ? resolveCounterpartCurrency(
        values.counterpartFundId,
        values.counterpartCurrencyCode,
        funds,
        baseCurrency,
        values.currencyCode,
      )
    : null;

  if (isTransfer) {
    if (values.counterpartFundId == null) {
      errors.counterpartFundId = 'Choose a destination fund.';
    } else if (values.counterpartFundId === values.fundId) {
      errors.counterpartFundId = 'A transfer needs two different funds.';
    }

    const sameCurrency =
      counterpartCurrency != null &&
      counterpartCurrency.trim().toUpperCase() ===
        values.currencyCode.trim().toUpperCase();

    const raw = values.counterpartAmount.trim();
    if (raw) {
      counterpartAmount = Number(raw);
    } else if (sameCurrency) {
      // Blank means the destination received what left, which is what a
      // transfer within one currency records.
      counterpartAmount = Number(values.amountNative);
    } else {
      // Across a currency boundary the two are not the same figure, and copying
      // one onto the other would assert a rate of 1 between them.
      errors.counterpartAmount = `Enter the amount that arrived in ${
        counterpartCurrency ?? 'the destination fund'
      }.`;
    }

    if (counterpartAmount != null) {
      const receivedCheck = validatePositiveAmount(
        counterpartAmount,
        'Amount received',
      );
      if (!receivedCheck.valid) {
        errors.counterpartAmount = receivedCheck.message;
      }
    }
  }

  // A transfer is identified by the two funds it moves money between, so it
  // needs none of these to be recognisable, and carries no category at all.
  if (
    !errors.form &&
    !isTransfer &&
    !description &&
    !payee &&
    values.categoryId == null
  ) {
    errors.form = 'Add a description, payee, or category.';
  }

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }

  const warnings: TransactionFormWarning[] = [];
  if (
    isTransfer &&
    isSuspectTransferRate({
      amountNative: Number(values.amountNative),
      counterpartAmount,
      currencyCode: values.currencyCode,
      counterpartCurrencyCode: counterpartCurrency,
    })
  ) {
    warnings.push({
      field: 'counterpartAmount',
      code: 'suspect-transfer-rate',
      message:
        `${formatMoneyAmount(Number(values.amountNative))} ${values.currencyCode.trim().toUpperCase()}` +
        ` and ${formatMoneyAmount(counterpartAmount as number)} ${counterpartCurrency}` +
        ' imply a rate of 1.',
    });
  }

  return {
    ok: true,
    warnings,
    value: {
      type: values.type,
      description,
      payee,
      amountNative: Number(values.amountNative),
      currencyCode: values.currencyCode.trim().toUpperCase(),
      fxRateToBase: Number(values.fxRateToBase),
      baseAmount: baseAmountNumber ?? 0,
      baseCurrencyCode: values.baseCurrencyCode
        ? values.baseCurrencyCode.trim().toUpperCase()
        : null,
      date: values.date,
      time: values.time.trim() || null,
      categoryId: isTransfer ? null : (values.categoryId ?? null),
      fundId: values.fundId as number,
      counterpartFundId: isTransfer ? values.counterpartFundId : null,
      counterpartAmount: isTransfer ? counterpartAmount : null,
      counterpartCurrencyCode: isTransfer ? counterpartCurrency : null,
      notes: ensureNotes(values.notes),
    },
  };
};

export const buildCreatePayload = (
  value: ValidTransactionPayload,
): NewTransactionRecord => ({
  type: value.type,
  description: value.description,
  payee: value.payee,
  amountNative: value.amountNative,
  currencyCode: value.currencyCode,
  fxRateToBase: value.fxRateToBase,
  baseAmount: value.baseAmount,
  baseCurrencyCode: value.baseCurrencyCode,
  date: value.date,
  time: value.time,
  categoryId: value.categoryId,
  fundId: value.fundId,
  counterpartFundId: value.counterpartFundId,
  counterpartAmount: value.counterpartAmount,
  counterpartCurrencyCode: value.counterpartCurrencyCode,
  notes: value.notes,
});

export const buildUpdatePayload = (
  originalId: number,
  value: ValidTransactionPayload,
): UpdateTransactionRecord => ({
  id: originalId,
  type: value.type,
  description: value.description,
  payee: value.payee,
  amountNative: value.amountNative,
  currencyCode: value.currencyCode,
  fxRateToBase: value.fxRateToBase,
  baseAmount: value.baseAmount,
  baseCurrencyCode: value.baseCurrencyCode,
  date: value.date,
  time: value.time,
  categoryId: value.categoryId,
  fundId: value.fundId,
  counterpartFundId: value.counterpartFundId,
  counterpartAmount: value.counterpartAmount,
  counterpartCurrencyCode: value.counterpartCurrencyCode,
  notes: value.notes,
});
