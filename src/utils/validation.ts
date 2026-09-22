import currencies from '../constants/currencies.json';
import { localIsoDateOffset } from './date';

export type ValidationResult =
  | { valid: true }
  | { valid: false; message: string };

const valid = (): ValidationResult => ({ valid: true });
const invalid = (message: string): ValidationResult => ({
  valid: false,
  message,
});

const ISO_DATE_PATTERN = /^\d{4}-\d{2}-\d{2}$/;
const TIME_PATTERN = /^([01]\d|2[0-3]):[0-5]\d$/;
const MAX_FUTURE_DAYS = 3;

export const PIN_MIN_LENGTH = 6;
export const PIN_MAX_LENGTH = 12;

const DIGITS_ONLY_PATTERN = /^\d+$/;

const WELL_KNOWN_PINS = new Set([
  '123456',
  '654321',
  '696969',
  '159753',
  '147258',
  '112233',
  '778899',
]);

const currencyCodes: Set<string> = new Set(
  Object.keys(currencies as Record<string, unknown>)
    .filter(code => /^[A-Z]{3}$/.test(code))
    .map(code => code.toUpperCase()),
);

/**
 * Currency display names reversed onto their ISO code. Names in the dataset are
 * distinct — a withdrawn currency carries its period in the name, as in "Afghan
 * Afghani" (AFN) against "Afghan Afghani (1927–2002)" (AFA) — so the reverse
 * mapping is one-to-one.
 */
const currencyNameToCode: Map<string, string> = Object.entries(
  currencies as Record<string, string>,
).reduce((map, [code, name]) => {
  if (/^[A-Z]{3}$/.test(code)) {
    map.set(name.trim().toLowerCase(), code);
  }
  return map;
}, new Map<string, string>());

/**
 * Symbols carry no country, so most map to several ISO codes and cannot be
 * resolved from the file alone. Single-candidate entries are unambiguous;
 * the rest are offered to the user to choose from.
 */
const CURRENCY_SYMBOL_TO_CODES: Record<string, string[]> = {
  $: ['USD', 'AUD', 'CAD', 'NZD', 'SGD', 'HKD'],
  us$: ['USD'],
  a$: ['AUD'],
  c$: ['CAD'],
  nz$: ['NZD'],
  s$: ['SGD'],
  hk$: ['HKD'],
  r$: ['BRL'],
  '€': ['EUR'],
  '£': ['GBP'],
  '¥': ['JPY', 'CNY'],
  '₹': ['INR'],
  '₩': ['KRW'],
  '₽': ['RUB'],
  '₺': ['TRY'],
  '₴': ['UAH'],
  '₫': ['VND'],
  '₪': ['ILS'],
  '฿': ['THB'],
  '₱': ['PHP'],
  kr: ['SEK', 'NOK', 'DKK', 'ISK'],
  zł: ['PLN'],
  rm: ['MYR'],
  rp: ['IDR'],
};

export type CurrencyNormalisation =
  | { status: 'ok'; code: string }
  | { status: 'ambiguous'; candidates: string[] }
  | { status: 'unknown' };

/**
 * Resolve a raw currency cell — an ISO code, a display name, or a symbol — to a
 * single ISO-4217 code. Returns `ambiguous` with every candidate when the value
 * maps to more than one code, so the caller can ask rather than guess.
 */
export const normalizeCurrency = (
  raw: string | null | undefined,
): CurrencyNormalisation => {
  const trimmed = (raw ?? '').trim();
  if (!trimmed) {
    return { status: 'unknown' };
  }

  const upper = trimmed.toUpperCase();
  if (currencyCodes.has(upper)) {
    return { status: 'ok', code: upper };
  }

  const lower = trimmed.toLowerCase();
  const byName = currencyNameToCode.get(lower);
  if (byName) {
    return { status: 'ok', code: byName };
  }

  const candidates =
    CURRENCY_SYMBOL_TO_CODES[trimmed] ?? CURRENCY_SYMBOL_TO_CODES[lower];
  if (!candidates) {
    return { status: 'unknown' };
  }

  return candidates.length === 1
    ? { status: 'ok', code: candidates[0] }
    : { status: 'ambiguous', candidates: [...candidates] };
};

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

export const validateCurrencyCode = (
  code: string | null | undefined,
): ValidationResult => {
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

  if (!Number.isFinite(amount)) {
    return invalid(`${fieldLabel} must be a number.`);
  }

  if (amount <= 0) {
    return invalid(`${fieldLabel} must be greater than zero.`);
  }

  return valid();
};

/**
 * An opening balance may be zero — a new fund starts empty — which is why this
 * cannot defer to `validatePositiveAmount`. Negatives are rejected: a pot holds
 * what was put into it.
 */
export const validateOpeningBalance = (
  amount: number | null | undefined,
): ValidationResult => {
  if (amount == null || !Number.isFinite(amount)) {
    return invalid('Opening balance must be a number.');
  }

  if (amount < 0) {
    return invalid('Opening balance cannot be negative.');
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
  const numericValue =
    typeof baseAmount === 'string' ? Number(baseAmount) : baseAmount;
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

/**
 * Validate a stored time of day. An absent time is valid — the field is
 * optional, and `null` records that no time was captured.
 */
export const validateTimeOfDay = (
  time: string | null | undefined,
): ValidationResult => {
  const trimmed = (time ?? '').trim();
  if (!trimmed) {
    return valid();
  }

  if (!TIME_PATTERN.test(trimmed)) {
    return invalid('Time must be in 24-hour format HH:MM.');
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

  if (!toUtcDate(date)) {
    return invalid('Date must be valid.');
  }

  // Safe as a string comparison only because the pattern check above has
  // already fixed the width and zero-padding, which is what makes ISO dates
  // sort chronologically.
  if (date > localIsoDateOffset(now, { days: MAX_FUTURE_DAYS })) {
    return invalid('Date cannot be more than 3 days in the future.');
  }

  return valid();
};

const isMonotonicRun = (pin: string): boolean => {
  const step = Number(pin[1]) - Number(pin[0]);
  if (step !== 1 && step !== -1) {
    return false;
  }
  for (let index = 2; index < pin.length; index += 1) {
    if (Number(pin[index]) - Number(pin[index - 1]) !== step) {
      return false;
    }
  }
  return true;
};

const isSingleDigitRepeated = (pin: string): boolean => new Set(pin).size === 1;

const isRepeatedBlock = (pin: string): boolean => {
  for (let period = 2; period <= Math.floor(pin.length / 2); period += 1) {
    if (pin.length % period !== 0) {
      continue;
    }
    const unit = pin.slice(0, period);
    if (unit.repeat(pin.length / period) === pin) {
      return true;
    }
  }
  return false;
};

/**
 * The single home of the app PIN's shape. Messages name the rule broken and
 * never echo the input, because they are rendered into the unlock modal.
 */
export const validatePin = (
  pin: string | null | undefined,
): ValidationResult => {
  const candidate = pin ?? '';

  if (!candidate) {
    return invalid('PIN is required.');
  }

  if (!DIGITS_ONLY_PATTERN.test(candidate)) {
    return invalid('PIN must contain digits only.');
  }

  if (candidate.length < PIN_MIN_LENGTH) {
    return invalid(`PIN must be at least ${PIN_MIN_LENGTH} digits.`);
  }

  if (candidate.length > PIN_MAX_LENGTH) {
    return invalid(`PIN must be at most ${PIN_MAX_LENGTH} digits.`);
  }

  if (isSingleDigitRepeated(candidate)) {
    return invalid('PIN cannot be the same digit repeated.');
  }

  if (isMonotonicRun(candidate)) {
    return invalid('PIN cannot be a run of consecutive digits.');
  }

  if (isRepeatedBlock(candidate)) {
    return invalid('PIN cannot be a short pattern repeated.');
  }

  if (WELL_KNOWN_PINS.has(candidate)) {
    return invalid('PIN is too easily guessed. Choose another.');
  }

  return valid();
};
