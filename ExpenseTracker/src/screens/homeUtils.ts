export type DateRangePreset = 'last7Days' | 'last30Days' | 'thisMonth' | 'allTime';

export type DatePresetOption = {
  label: string;
  value: DateRangePreset;
};

export const DATE_PRESETS: readonly DatePresetOption[] = [
  { label: 'Last 7 days', value: 'last7Days' },
  { label: 'Last 30 days', value: 'last30Days' },
  { label: 'This month', value: 'thisMonth' },
  { label: 'All time', value: 'allTime' },
];

type DateRange = {
  startDate: string | null;
  endDate: string | null;
};

const MS_IN_DAY = 24 * 60 * 60 * 1000;

const toUtcDate = (date: Date): Date =>
  new Date(Date.UTC(date.getUTCFullYear(), date.getUTCMonth(), date.getUTCDate()));

export const computePresetRange = (preset: DateRangePreset, now = new Date()): DateRange => {
  const today = toUtcDate(now);

  switch (preset) {
    case 'last7Days': {
      const start = new Date(today.getTime() - 6 * MS_IN_DAY);
      return {
        startDate: start.toISOString().slice(0, 10),
        endDate: today.toISOString().slice(0, 10),
      };
    }
    case 'last30Days': {
      const start = new Date(today.getTime() - 29 * MS_IN_DAY);
      return {
        startDate: start.toISOString().slice(0, 10),
        endDate: today.toISOString().slice(0, 10),
      };
    }
    case 'thisMonth': {
      const start = new Date(Date.UTC(today.getUTCFullYear(), today.getUTCMonth(), 1));
      return {
        startDate: start.toISOString().slice(0, 10),
        endDate: today.toISOString().slice(0, 10),
      };
    }
    case 'allTime':
    default:
      return { startDate: null, endDate: null };
  }
};

const rangesEqual = (
  filtersStart: string | null,
  filtersEnd: string | null,
  target: DateRange,
): boolean => filtersStart === target.startDate && filtersEnd === target.endDate;

export const detectPreset = (
  filters: { startDate?: string | null; endDate?: string | null },
  now = new Date(),
): DateRangePreset | 'custom' => {
  const filterStart = filters.startDate ?? null;
  const filterEnd = filters.endDate ?? null;

  if (!filterStart && !filterEnd) {
    return 'allTime';
  }

  const last7 = computePresetRange('last7Days', now);
  if (rangesEqual(filterStart, filterEnd, last7)) {
    return 'last7Days';
  }

  const last30 = computePresetRange('last30Days', now);
  if (rangesEqual(filterStart, filterEnd, last30)) {
    return 'last30Days';
  }

  const thisMonth = computePresetRange('thisMonth', now);
  if (rangesEqual(filterStart, filterEnd, thisMonth)) {
    return 'thisMonth';
  }

  return 'custom';
};

export const formatDateRangeLabel = (filters: { startDate?: string | null; endDate?: string | null }): string => {
  const start = filters.startDate ?? null;
  const end = filters.endDate ?? null;

  if (!start && !end) {
    return 'All time';
  }

  if (start && end) {
    return `${start} – ${end}`;
  }

  if (start) {
    return `From ${start}`;
  }

  return `Up to ${end}`;
};

export const formatCurrencyAmount = (
  amount: number,
  currencyCode: string | null,
  fallback = '',
): string => {
  const formatted = amount.toFixed(2);
  if (currencyCode) {
    return `${formatted} ${currencyCode}`;
  }
  return fallback ? `${formatted} ${fallback}` : formatted;
};