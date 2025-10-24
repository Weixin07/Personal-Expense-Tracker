import currencies from "../constants/currencies.json";

export type ValidationResult = { valid: true } | { valid: false; message: string };

const valid = (): ValidationResult => ({ valid: true });
const invalid = (message: string): ValidationResult => ({ valid: false, message });

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const MAX_FUTURE_DAYS = 3;
const MS_IN_DAY = 24 * 60 * 60 * 1000;

const currencyCodes: Set<string> = new Set(
  Object.keys(currencies as Record<string, unknown>)
    .filter(code => /^[A-Z]{3}$/.test(code))
    .map(code => code.toUpperCase()),
);

const truncateUtcDate = (date: Date): Date =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));

const toUtcDate = (value: string): Date | null => {
  if (!ISO_DATE_PATTERN.test(value)) {
    return null;
  }
  const parsed = new Date(`${value}T00:00:00Z`);
  return Number.isNaN(parsed.getTime()) ? null : parsed;
};

const decimalPlaces = (value: number | string): number => {
  if (typeof value === 'string') {
    const trimmed = value.trim();
    if (!trimmed.includes('.')) {
      return 0;
    }
    return trimmed.split('.')[1]?.length ?? 0;
  }

  if (!Number.isFinite(value)) {
    return 0;
  }

  const valueAsString = value.toString();
  const [, decimal = ''] = valueAsString.split('.');
  return decimal.length;
};

export const validateCurrencyCode = (code: string | null | undefined): ValidationResult => {
  if (!code) {
    return invalid('Currency code is required.');
  }

  const normalised = code.trim().toUpperCase();
  if (!/^[A-Z]{3}$/.test(normalised)) {
    return invalid('Currency code must be three letters.');
  }

  if (!currencyCodes.has(normalised)) {
    return invalid('Currency code must be a valid ISO-4217 code.');
  }

  return valid();
};

export const validatePositiveAmount = (
  amount: number | null | undefined,
  fieldLabel = 'Amount',
): ValidationResult => {
  if (amount == null || Number.isNaN(amount)) {
    return invalid(`${fieldLabel} is required.`);
  }

  if (amount <= 0) {
    return invalid(`${fieldLabel} must be greater than zero.`);
  }

  return valid();
};

export const validatePositiveRate = (
  rate: number | null | undefined,
  fieldLabel = 'Rate',
): ValidationResult => validatePositiveAmount(rate, fieldLabel);

export const validateBaseAmountPrecision = (
  baseAmount: number | string | null | undefined,
): ValidationResult => {
  const numericValue = typeof baseAmount === 'string' ? Number(baseAmount) : baseAmount;
  const amountCheck = validatePositiveAmount(numericValue, 'Base amount');
  if (!amountCheck.valid) {
    return amountCheck;
  }

  const places = decimalPlaces(baseAmount ?? 0);
  if (places < 6 || places > 8) {
    return invalid('Base amount must have between 6 and 8 decimal places.');
  }

  return valid();
};

export const validateIsoDateWithinFutureWindow = (
  date: string | null | undefined,
  now: Date = new Date(),
): ValidationResult => {
  if (!date) {
    return invalid('Date is required.');
  }

  if (!ISO_DATE_PATTERN.test(date)) {
    return invalid('Date must be in ISO format YYYY-MM-DD.');
  }

  const parsed = toUtcDate(date);
  if (!parsed) {
    return invalid('Date must be valid.');
  }

  const todayUtc = truncateUtcDate(now);
  const limit = new Date(todayUtc.getTime() + MAX_FUTURE_DAYS * MS_IN_DAY);

  if (parsed.getTime() > limit.getTime()) {
    return invalid('Date cannot be more than 3 days in the future.');
  }

  return valid();
};