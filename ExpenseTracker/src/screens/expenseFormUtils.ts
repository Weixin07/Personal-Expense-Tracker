import {
  validateBaseAmountPrecision,
  validateCurrencyCode,
  validateIsoDateWithinFutureWindow,
  validatePositiveAmount,
  validatePositiveRate,
} from '../utils/validation';
import { formatMoneyAmount, formatFxRate } from '../utils/formatting';
import type { CategoryRecord, ExpenseRecord, NewExpenseRecord, UpdateExpenseRecord } from '../database';

export type ExpenseFormValues = {
  description: string;
  amountNative: string;
  currencyCode: string;
  fxRateToBase: string;
  baseAmount: string;
  date: string;
  categoryId: number | null;
  notes: string;
};

export type ExpenseFormErrors = Partial<Record<'description' | 'amountNative' | 'currencyCode' | 'fxRateToBase' | 'baseAmount' | 'date', string>> & { form?: string };

export type ExpenseFormValidationResult =
  | { ok: true; value: ValidExpensePayload }
  | { ok: false; errors: ExpenseFormErrors };

export type ValidExpensePayload = {
  description: string;
  amountNative: number;
  currencyCode: string;
  fxRateToBase: number;
  baseAmount: number;
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

export const getDefaultExpenseFormValues = (
  baseCurrency: string | null,
  categories: CategoryRecord[],
  existing?: ExpenseRecord,
): ExpenseFormValues => {
  if (existing) {
    return {
      description: existing.description,
      amountNative: formatMoneyAmount(existing.amountNative),
      currencyCode: existing.currencyCode,
      fxRateToBase: formatFxRate(existing.fxRateToBase),
      baseAmount: formatMoneyAmount(existing.baseAmount),
      date: existing.date,
      categoryId: existing.categoryId ?? null,
      notes: existing.notes ?? '',
    };
  }

  const today = new Date();
  const isoDate = today.toISOString().slice(0, 10);

  return {
    description: '',
    amountNative: '',
    currencyCode: baseCurrency ?? '',
    fxRateToBase: '',
    baseAmount: '',
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

export const validateExpenseForm = (values: ExpenseFormValues): ExpenseFormValidationResult => {
  const errors: ExpenseFormErrors = {};

  const description = ensureDescription(values.description);
  if (!description) {
    errors.description = 'Description is required.';
  }

  const amountCheck = validatePositiveAmount(Number(values.amountNative), 'Amount');
  if (!amountCheck.valid) {
    errors.amountNative = amountCheck.message;
  }

  const rateCheck = validatePositiveRate(Number(values.fxRateToBase), 'FX rate');
  if (!rateCheck.valid) {
    errors.fxRateToBase = rateCheck.message;
  }

  const currencyCheck = validateCurrencyCode(values.currencyCode);
  if (!currencyCheck.valid) {
    errors.currencyCode = currencyCheck.message;
  }

  const baseAmountNumber = computeBaseAmount(values.amountNative, values.fxRateToBase);
  if (baseAmountNumber == null) {
    errors.baseAmount = 'Base amount could not be computed.';
  } else {
    const baseAmountCheck = validateBaseAmountPrecision(baseAmountNumber.toFixed(8));
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
      description,
      amountNative: Number(values.amountNative),
      currencyCode: values.currencyCode.trim().toUpperCase(),
      fxRateToBase: Number(values.fxRateToBase),
      baseAmount: baseAmountNumber ?? 0,
      date: values.date,
      categoryId: values.categoryId ?? null,
      notes: ensureNotes(values.notes),
    },
  };
};

export const buildCreatePayload = (value: ValidExpensePayload): NewExpenseRecord => ({
  description: value.description,
  amountNative: value.amountNative,
  currencyCode: value.currencyCode,
  fxRateToBase: value.fxRateToBase,
  baseAmount: value.baseAmount,
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
  date: value.date,
  categoryId: value.categoryId,
  notes: value.notes,
});