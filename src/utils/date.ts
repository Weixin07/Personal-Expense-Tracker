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

const pad = (value: number): string => String(value).padStart(2, '0');

/**
 * Today's calendar day in the device's own timezone. Deriving it from UTC
 * misfiles the hours where the two calendars disagree: ahead of UTC the early
 * morning falls under the previous day, behind UTC the late evening falls under
 * the next one.
 */
export const localIsoDate = (now: Date = new Date()): string =>
  `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;

/** The device's current wall-clock time as `HH:MM`. */
export const localTimeOfDay = (now: Date = new Date()): string =>
  `${pad(now.getHours())}:${pad(now.getMinutes())}`;

/**
 * Render a stored date and optional time as one display string. A record with
 * no time shows the date alone, since absence is the normal state rather than
 * something missing.
 */
export const formatDateTimeBritish = (
  isoDate: string,
  time: string | null | undefined,
): string => {
  const date = formatDateBritish(isoDate);
  return time ? `${date} ${time}` : date;
};

const TIME_MERIDIEM = /^(.*?)\s*([ap])\.?m\.?$/i;
const TIME_PARTS = /^(\d{1,2})[:.]?(\d{2})$/;

/**
 * Parse a typed time of day to `HH:MM`. Accepts `:` or `.` as the separator or
 * none at all (`1430`), with an optional 12-hour suffix.
 *
 * Returns `''` for empty input — the field is optional, so blank is a valid
 * answer meaning "no time" — and `null` when the value cannot be read, so a
 * caller can tell a cleared field from a malformed one.
 */
export const parseTimeInput = (input: string): string | null => {
  const trimmed = input.trim();
  if (!trimmed) {
    return '';
  }

  const meridiemMatch = trimmed.match(TIME_MERIDIEM);
  const meridiem = meridiemMatch ? meridiemMatch[2].toLowerCase() : null;
  const body = (meridiemMatch ? meridiemMatch[1] : trimmed).trim();

  const parts = body.match(TIME_PARTS);
  if (!parts) {
    return null;
  }

  let hours = Number(parts[1]);
  const minutes = Number(parts[2]);
  if (minutes > 59) {
    return null;
  }

  if (meridiem) {
    if (hours < 1 || hours > 12) {
      return null;
    }
    if (meridiem === 'a') {
      hours = hours === 12 ? 0 : hours;
    } else if (hours !== 12) {
      hours += 12;
    }
  } else if (hours > 23) {
    return null;
  }

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
};

export const parseBritishDateInput = (input: string): string | null => {
  const trimmed = input.trim();
  if (!trimmed) {
    return '';
  }

  if (/^\d{4}-\d{2}-\d{2}$/.test(trimmed)) {
    return trimmed;
  }

  const parts = trimmed.split(/[/\-.\s]+/).filter(Boolean);
  if (parts.length !== 3) {
    return null;
  }

  const [day, month] = parts;
  let year = parts[2];
  if (
    !/^\d{1,2}$/.test(day) ||
    !/^\d{1,2}$/.test(month) ||
    !/^\d{2,4}$/.test(year)
  ) {
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

  // The Date constructor silently rolls over invalid dates (Feb 31 → Mar 3),
  // so a successful parse is not proof the input named a real calendar day.
  const parsedYear = parsed.getUTCFullYear();
  const parsedMonth = parsed.getUTCMonth() + 1; // 0-indexed
  const parsedDay = parsed.getUTCDate();

  if (
    parsedYear !== parseInt(year, 10) ||
    parsedMonth !== parseInt(month, 10) ||
    parsedDay !== parseInt(day, 10)
  ) {
    return null;
  }

  return iso;
};
