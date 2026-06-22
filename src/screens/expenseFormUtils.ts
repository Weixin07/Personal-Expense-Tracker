import {
  validateBaseAmountPrecision,
  validateCurrencyCode,
  validateIsoDateWithinFutureWindow,
  validatePositiveAmount,
  validatePositiveRate,
} from '../utils/validation';
import { formatMoneyAmount, formatFxRate } from '../utils/formatting';
import type {
  CategoryRecord,
  CurrencyFxRateRecord,
  ExpenseRecord,
  NewExpenseRecord,
  UpdateExpenseRecord,
} from '../database';

export type ExpenseFormValues = {
  description: string;
  amountNative: string;
  currencyCode: string;
  fxRateToBase: string;
  baseAmount: string;
  baseCurrencyCode: string | null;
  date: string;
  categoryId: number | null;
  notes: string;
};

export type ExpenseFormErrors = Partial<
  Record<
    | 'description'
    | 'amountNative'
    | 'currencyCode'
    | 'fxRateToBase'
    | 'baseAmount'
    | 'date',
    string
  >
> & { form?: string };

export type ExpenseFormValidationResult =
  | { ok: true; value: ValidExpensePayload }
  | { ok: false; errors: ExpenseFormErrors };

export type ValidExpensePayload = {
  description: string;
  amountNative: number;
  currencyCode: string;
  fxRateToBase: number;
  baseAmount: number;
  baseCurrencyCode: string | null;
  date: string;
  categoryId: number | null;
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

export const getDefaultExpenseFormValues = (
  baseCurrency: string | null,
  categories: CategoryRecord[],
  existing?: ExpenseRecord,
  cachedRates: readonly CurrencyFxRateRecord[] = [],
): ExpenseFormValues => {
  if (existing) {
    return {
      description: existing.description,
      amountNative: formatMoneyAmount(existing.amountNative),
      currencyCode: existing.currencyCode,
      fxRateToBase: formatFxRate(existing.fxRateToBase),
      baseAmount: formatMoneyAmount(existing.baseAmount),
      baseCurrencyCode: existing.baseCurrencyCode ?? baseCurrency,
      date: existing.date,
      categoryId: existing.categoryId ?? null,
      notes: existing.notes ?? '',
    };
  }

  const today = new Date();
  const isoDate = today.toISOString().slice(0, 10);
  const currencyCode = baseCurrency ?? '';

  return {
    description: '',
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
    categoryId: categories.length ? categories[0].id : null,
    notes: '',
  };
};

const ensureDescription = (value: string): string | null => {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }
  return trimmed;
};

const ensureNotes = (value: string): string | null => {
  const trimmed = value.trim();
  return trimmed.length ? trimmed : null;
};

export const validateExpenseForm = (
  values: ExpenseFormValues,
): ExpenseFormValidationResult => {
  const errors: ExpenseFormErrors = {};

  const description = ensureDescription(values.description);
  if (!description) {
    errors.description = 'Description is required.';
  }

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

  if (Object.keys(errors).length > 0) {
    return { ok: false, errors };
  }

  return {
    ok: true,
    value: {
      description: description!,
      amountNative: Number(values.amountNative),
      currencyCode: values.currencyCode.trim().toUpperCase(),
      fxRateToBase: Number(values.fxRateToBase),
      baseAmount: baseAmountNumber ?? 0,
      baseCurrencyCode: values.baseCurrencyCode
        ? values.baseCurrencyCode.trim().toUpperCase()
        : null,
      date: values.date,
      categoryId: values.categoryId ?? null,
      notes: ensureNotes(values.notes),
    },
  };
};

export const buildCreatePayload = (
  value: ValidExpensePayload,
): NewExpenseRecord => ({
  description: value.description,
  amountNative: value.amountNative,
  currencyCode: value.currencyCode,
  fxRateToBase: value.fxRateToBase,
  baseAmount: value.baseAmount,
  baseCurrencyCode: value.baseCurrencyCode,
  date: value.date,
  categoryId: value.categoryId,
  notes: value.notes,
});

export const buildUpdatePayload = (
  originalId: number,
  value: ValidExpensePayload,
): UpdateExpenseRecord => ({
  id: originalId,
  description: value.description,
  amountNative: value.amountNative,
  currencyCode: value.currencyCode,
  fxRateToBase: value.fxRateToBase,
  baseAmount: value.baseAmount,
  baseCurrencyCode: value.baseCurrencyCode,
  date: value.date,
  categoryId: value.categoryId,
  notes: value.notes,
});
