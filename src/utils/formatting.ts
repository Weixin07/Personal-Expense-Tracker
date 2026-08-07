/**
 * Display precision is deliberately coarser than calculation precision: money
 * shows 2 decimal places and FX rates 6, while computeBaseAmount works at 6-8.
 */

/**
 * Ungrouped and unsigned, so the result survives `Number()`. Use for CSV
 * columns and editable form fields.
 */
export const formatMoneyAmount = (amount: number): string => {
  return amount.toFixed(2);
};

export const formatFxRate = (rate: number): string => {
  return rate.toFixed(6);
};

export const formatCurrencyAmount = (
  amount: number,
  currencyCode: string | null,
  fallback = '',
): string => {
  const formatted = formatMoneyAmount(amount);
  if (currencyCode) {
    return `${formatted} ${currencyCode}`;
  }
  return fallback ? `${formatted} ${fallback}` : formatted;
};

export type MoneyDirection = 'spent' | 'received';

const groupIntegerDigits = (formatted: string): string => {
  const negative = formatted.startsWith('-');
  const magnitude = negative ? formatted.slice(1) : formatted;
  const [integer, fraction] = magnitude.split('.');
  const grouped = integer.replace(/\B(?=(\d{3})+(?!\d))/g, ',');
  const rejoined = fraction === undefined ? grouped : `${grouped}.${fraction}`;

  return negative ? `-${rejoined}` : rejoined;
};

const withCurrency = (
  formatted: string,
  currencyCode: string | null,
): string => (currencyCode ? `${formatted} ${currencyCode}` : formatted);

/**
 * Grouped for display; the separators do not survive `Number()`.
 */
export const formatDisplayMoney = (
  amount: number,
  currencyCode: string | null = null,
): string =>
  withCurrency(groupIntegerDigits(formatMoneyAmount(amount)), currencyCode);

/**
 * Signs from `direction`, not from the value, so the sign holds at zero:
 * nothing received is `+0.00`, not `0.00`.
 */
export const formatDirectionalMoney = (
  magnitude: number,
  direction: MoneyDirection,
  currencyCode: string | null = null,
): string => {
  const sign = direction === 'received' ? '+' : '-';
  const formatted = groupIntegerDigits(formatMoneyAmount(Math.abs(magnitude)));

  return withCurrency(`${sign}${formatted}`, currencyCode);
};

/**
 * Signs from the value; an amount that rounds to zero carries no sign.
 */
export const formatSignedMoney = (
  value: number,
  currencyCode: string | null = null,
): string => {
  const rounded = Number(formatMoneyAmount(value));
  const sign = rounded > 0 ? '+' : rounded < 0 ? '-' : '';
  const formatted = groupIntegerDigits(formatMoneyAmount(Math.abs(value)));

  return withCurrency(`${sign}${formatted}`, currencyCode);
};
