import {
  formatDateRangeBritish,
  localIsoDate,
  localIsoDateOffset,
} from '../utils/date';

export type DateRangePreset =
  | 'last7Days'
  | 'last30Days'
  | 'thisMonth'
  | 'allTime';

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

export const computePresetRange = (
  preset: DateRangePreset,
  now = new Date(),
): DateRange => {
  // These bounds are compared against a transaction's `date`, so they have to
  // name a day on the same calendar it was written on — see `localIsoDate`.
  const endDate = localIsoDate(now);

  switch (preset) {
    case 'last7Days':
      return { startDate: localIsoDateOffset(now, { days: -6 }), endDate };
    case 'last30Days':
      return { startDate: localIsoDateOffset(now, { days: -29 }), endDate };
    case 'thisMonth':
      return {
        startDate: localIsoDate(new Date(now.getFullYear(), now.getMonth(), 1)),
        endDate,
      };
    case 'allTime':
    default:
      return { startDate: null, endDate: null };
  }
};

const rangesEqual = (
  filtersStart: string | null,
  filtersEnd: string | null,
  target: DateRange,
): boolean =>
  filtersStart === target.startDate && filtersEnd === target.endDate;

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

export const formatDateRangeLabel = (filters: {
  startDate?: string | null;
  endDate?: string | null;
}): string => {
  const start = filters.startDate ?? null;
  const end = filters.endDate ?? null;

  if (!start && !end) {
    return 'All time';
  }

  return formatDateRangeBritish(start, end);
};
