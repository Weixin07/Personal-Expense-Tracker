import currencies from './currencies.json';

export type CurrencyOption = {
  code: string;
  name: string;
};

const currencyOptions: CurrencyOption[] = Object.entries(
  currencies as Record<string, string>,
)
  .filter(([code]) => /^[A-Z]{3}$/.test(code))
  .map(([code, name]) => ({ code, name }))
  .sort((a, b) => a.code.localeCompare(b.code));

export const getCurrencyOptions = (): CurrencyOption[] => currencyOptions;

export const findCurrencyName = (code: string | null | undefined): string | null => {
  if (!code) {
    return null;
  }
  const option = currencyOptions.find(item => item.code === code.toUpperCase());
  return option?.name ?? null;
};