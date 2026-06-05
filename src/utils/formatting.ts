/**
 * Formatting utilities for displaying currency amounts and FX rates.
 *
 * DISPLAY PRECISION REQUIREMENTS:
 * - Money (amount_native, base_amount): 2 decimal places
 * - FX rates: 6 decimal places (within 4-6 range)
 * - Internal calculations: 6-8 decimal places (handled in computeBaseAmount)
 */

/**
 * Format a money amount for display (2 decimal places).
 * Use for: amount_native, base_amount
 */
export const formatMoneyAmount = (amount: number): string => {
  return amount.toFixed(2);
};

/**
 * Format an FX rate for display (6 decimal places).
 * Use for: fx_rate_to_base
 */
export const formatFxRate = (rate: number): string => {
  return rate.toFixed(6);
};

/**
 * Format currency amount with currency code.
 * Use for: displaying amounts in lists and summaries
 */
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
