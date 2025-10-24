export const formatDateBritish = (isoDate: string): string => {
  if (!isoDate) {
    return '';
  }
  const [year, month, day] = isoDate.split('-');
  if (!year || !month || !day) {
    return isoDate;
  }
  return `${day}/${month}/${year}`;
};

export const formatDateRangeBritish = (
  start: string | null | undefined,
  end: string | null | undefined,
): string => {
  const startFormatted = start ? formatDateBritish(start) : null;
  const endFormatted = end ? formatDateBritish(end) : null;
  if (startFormatted && endFormatted) {
    return `${startFormatted} to ${endFormatted}`;
  }
  if (startFormatted) {
    return `From ${startFormatted}`;
  }
  if (endFormatted) {
    return `Up to ${endFormatted}`;
  }
  return 'All time';
};

export const parseBritishDateInput = (input: string): string | null => {
  const trimmed = input.trim();
  if (!trimmed) {
    return '';
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  const parts = trimmed.split(/[\/-\.\s]+/).filter(Boolean);
  if (parts.length !== 3) {
    return null;
  }

  let [day, month, year] = parts;
  if (!/^\d{1,2}$/.test(day) || !/^\d{1,2}$/.test(month) || !/^\d{2,4}$/.test(year)) {
    return null;
  }

  if (year.length === 2) {
    year = `20${year}`;
  }

  const iso = `${year.padStart(4, '0')}-${month.padStart(2, '0')}-${day.padStart(2, '0')}`;
  const parsed = new Date(`${iso}T00:00:00Z`);
  if (Number.isNaN(parsed.getTime())) {
    return null;
  }
  return iso;
};
