import type {
  DateFormat,
  DateOrder,
  FieldMapping,
  ImportTargetField,
  ParsedRow,
  TransactionType,
} from './types';

/**
 * App export column names (from TRANSACTION_CSV_COLUMNS) → import target fields.
 * Keys mirror the header `buildTransactionsCsv` writes, so a re-imported backup
 * auto-maps with no user interaction. The `id` column is intentionally omitted:
 * import appends new rows and never reuses the source id.
 */
const COLUMN_TO_FIELD: Record<string, ImportTargetField> = {
  description: 'description',
  payee: 'payee',
  amount_native: 'amountNative',
  currency_code: 'currencyCode',
  fx_rate_to_base: 'fxRateToBase',
  base_amount: 'baseAmount',
  base_currency_code: 'baseCurrencyCode',
  date: 'date',
  time: 'time',
  category: 'categoryName',
  notes: 'notes',
  type: 'transactionType',
  fund: 'fundName',
  counterpart_fund: 'counterpartFundName',
  counterpart_amount: 'counterpartAmount',
  counterpart_currency: 'counterpartCurrency',
};

/**
 * Header names other tools commonly export. Consulted only after the app's own
 * column names, so a re-imported backup can never be captured by a synonym.
 * Keys are in normalised form: lower-case, separators collapsed to spaces.
 */
const SYNONYM_TO_FIELD: Record<string, ImportTargetField> = {
  amount: 'amountNative',
  'amount native': 'amountNative',
  'transaction amount': 'amountNative',
  value: 'amountNative',
  total: 'amountNative',
  sum: 'amountNative',
  debit: 'amountNative',
  outflow: 'amountNative',
  spent: 'amountNative',

  currency: 'currencyCode',
  'currency code': 'currencyCode',
  ccy: 'currencyCode',

  'transaction date': 'date',
  'posted date': 'date',
  'booking date': 'date',
  'value date': 'date',
  datetime: 'date',
  'date time': 'date',
  timestamp: 'date',

  'time of day': 'time',
  'transaction time': 'time',
  'entry time': 'time',
  'posted time': 'time',

  details: 'description',
  title: 'description',
  item: 'description',
  subject: 'description',

  merchant: 'payee',
  vendor: 'payee',
  store: 'payee',
  counterparty: 'payee',
  recipient: 'payee',
  beneficiary: 'payee',
  'paid to': 'payee',

  'category name': 'categoryName',
  group: 'categoryName',
  tag: 'categoryName',

  note: 'notes',
  memo: 'notes',
  comment: 'notes',
  comments: 'notes',
  remark: 'notes',
  remarks: 'notes',

  'fx rate': 'fxRateToBase',
  'fx rate to base': 'fxRateToBase',
  'exchange rate': 'fxRateToBase',
  rate: 'fxRateToBase',

  'base amount': 'baseAmount',
  'converted amount': 'baseAmount',

  'base currency': 'baseCurrencyCode',
  'base currency code': 'baseCurrencyCode',
  'home currency': 'baseCurrencyCode',

  // `normalizeHeader` collapses `_` and `-` to spaces but leaves `/` intact,
  // so slashed header names must be keyed with the slash.
  'income/expense': 'transactionType',
  'expense/income': 'transactionType',
  'debit/credit': 'transactionType',
  'credit/debit': 'transactionType',
  'dr/cr': 'transactionType',
  type: 'transactionType',
  'transaction type': 'transactionType',
  direction: 'transactionType',
  'credit debit indicator': 'transactionType',

  // Terms this app does not write, but other tools do for the same concept.
  'fund name': 'fundName',
  account: 'fundName',
  'account name': 'fundName',
  pot: 'fundName',
  envelope: 'fundName',
  wallet: 'fundName',
  'from account': 'fundName',
  'from fund': 'fundName',
  'to account': 'counterpartFundName',
  'to fund': 'counterpartFundName',
  'destination account': 'counterpartFundName',
  'transfer account': 'counterpartFundName',
  'amount received': 'counterpartAmount',
  'counterpart amount': 'counterpartAmount',
  'received currency': 'counterpartCurrency',
  'counterpart currency': 'counterpartCurrency',
};

/** Values an explicit transaction-type column uses for each type. */
const TRANSACTION_TYPE_VALUES: Record<string, TransactionType> = {
  transfer: 'transfer',
  transfers: 'transfer',
  xfer: 'transfer',
  move: 'transfer',
  movement: 'transfer',

  income: 'income',
  incomes: 'income',
  credit: 'income',
  cr: 'income',
  deposit: 'income',
  in: 'income',
  inflow: 'income',

  expense: 'expense',
  expenses: 'expense',
  debit: 'expense',
  dr: 'expense',
  withdrawal: 'expense',
  payment: 'expense',
  out: 'expense',
  outflow: 'expense',
};

/**
 * Read a raw transaction-type cell. Returns null when the value is empty or
 * outside the known vocabulary, so the caller can fall back to the sign
 * convention rather than reject the row.
 */
export const resolveTransactionType = (raw: string): TransactionType | null =>
  TRANSACTION_TYPE_VALUES[raw.trim().toLowerCase()] ?? null;

export const REQUIRED_TARGET_FIELDS: readonly ImportTargetField[] = [
  'amountNative',
  'currencyCode',
  'date',
];

export type RawCandidate = Partial<Record<ImportTargetField, string>>;

const normalizeHeader = (raw: string): string =>
  raw.trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');

export const hasAnyValue = (
  rows: readonly ParsedRow[],
  index: number,
): boolean => rows.some(row => (row.cells[index] ?? '').trim().length > 0);

/**
 * Auto-map a header to target fields. `rows` are consulted only to break ties
 * between columns whose names are equally good candidates, so a header-only call
 * still maps everything a header alone can settle.
 *
 * Exports written for people rather than for re-import often carry a note column
 * and no description column at all. Such a column is the row's identity — what a
 * reader would call the transaction — so it fills `description` when nothing else
 * claims that field, leaving any second note-ish column for `notes`. Without
 * this, every row of such a file imports under the `Unknown` payee placeholder.
 */
export const autoDetectMapping = (
  header: readonly string[],
  rows: readonly ParsedRow[] = [],
): FieldMapping => {
  const mapping: FieldMapping = {};
  const usedColumns = new Set<number>();

  const assign = (
    field: ImportTargetField | undefined,
    index: number,
  ): void => {
    if (!field || mapping[field] !== undefined || usedColumns.has(index)) {
      return;
    }
    mapping[field] = index;
    usedColumns.add(index);
  };

  header.forEach((raw, index) =>
    assign(COLUMN_TO_FIELD[raw.trim().toLowerCase()], index),
  );

  if (mapping.description === undefined) {
    const noteColumns = header
      .map((raw, index) => ({ index, raw }))
      .filter(
        ({ index, raw }) =>
          !usedColumns.has(index) &&
          SYNONYM_TO_FIELD[normalizeHeader(raw)] === 'notes',
      )
      .map(({ index }) => index);

    const populated = noteColumns.find(index => hasAnyValue(rows, index));
    const chosen = populated ?? noteColumns[0];
    if (chosen !== undefined) {
      assign('description', chosen);
    }
  }

  header.forEach((raw, index) =>
    assign(SYNONYM_TO_FIELD[normalizeHeader(raw)], index),
  );

  return mapping;
};

/**
 * Required fields still unmapped. `currencyCode` drops out of the requirement
 * when a default currency is supplied, since single-currency exports carry no
 * currency column at all.
 */
export const missingRequiredFields = (
  mapping: FieldMapping,
  options: { hasDefaultCurrency?: boolean } = {},
): ImportTargetField[] =>
  REQUIRED_TARGET_FIELDS.filter(field => {
    if (field === 'currencyCode' && options.hasDefaultCurrency) {
      return false;
    }
    return mapping[field] === undefined;
  });

export const applyMapping = (
  cells: readonly string[],
  mapping: FieldMapping,
): RawCandidate => {
  const candidate: RawCandidate = {};
  (Object.keys(mapping) as ImportTargetField[]).forEach(field => {
    const index = mapping[field];
    if (index !== undefined) {
      candidate[field] = cells[index] ?? '';
    }
  });
  return candidate;
};

/**
 * A clock time as exported by other tools: hours and minutes, optionally
 * seconds or fractional seconds, an English 12-hour suffix, and a zone offset.
 * Seconds are surplus to the minute granularity a record stores, and the offset
 * is read only so a zoned value is not mistaken for malformed. A colon is
 * required: a source column of plain digits would otherwise read as a time.
 */
const TIME_TOKEN =
  '(\\d{1,2}):(\\d{2})(?::\\d{2}(?:\\.\\d+)?)?\\s*(?:([AaPp])\\.?[Mm]\\.?)?\\s*(?:Z|[+-]\\d{2}:?\\d{2})?';

const TIME_SUFFIX = `(?:[T\\s]+${TIME_TOKEN})?`;

const STANDALONE_TIME = new RegExp(`^${TIME_TOKEN}$`);

const ISO_DATE = new RegExp(`^(\\d{4})-(\\d{2})-(\\d{2})${TIME_SUFFIX}$`);

const NUMERIC_DATE = new RegExp(
  `^(\\d{1,2})[/\\-.](\\d{1,2})[/\\-.](\\d{2}|\\d{4})${TIME_SUFFIX}$`,
);
const MONTH_FIRST_DATE = new RegExp(
  `^([A-Za-z]{3,})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{2}|\\d{4})${TIME_SUFFIX}$`,
);
const DAY_FIRST_DATE = new RegExp(
  `^(\\d{1,2})(?:st|nd|rd|th)?\\s+([A-Za-z]{3,})\\.?,?\\s+(\\d{2}|\\d{4})${TIME_SUFFIX}$`,
);

/**
 * Fold captured hour/minute/meridiem parts into `HH:MM`, or null when they do
 * not name a real time. The meridiem is applied before the range check, so
 * `13:00 PM` is rejected rather than silently wrapped.
 */
const toTimeOfDay = (
  rawHours: string | undefined,
  rawMinutes: string | undefined,
  meridiem: string | undefined,
): string | null => {
  if (!rawHours || !rawMinutes) {
    return null;
  }

  let hours = Number(rawHours);
  const minutes = Number(rawMinutes);
  if (minutes > 59) {
    return null;
  }

  if (meridiem) {
    if (hours < 1 || hours > 12) {
      return null;
    }
    const isMorning = meridiem.toLowerCase() === 'a';
    if (isMorning) {
      hours = hours === 12 ? 0 : hours;
    } else if (hours !== 12) {
      hours += 12;
    }
  } else if (hours > 23) {
    return null;
  }

  return `${String(hours).padStart(2, '0')}:${String(minutes).padStart(2, '0')}`;
};

const MONTH_NAMES: Record<string, number> = {
  jan: 1,
  january: 1,
  feb: 2,
  february: 2,
  mar: 3,
  march: 3,
  apr: 4,
  april: 4,
  may: 5,
  jun: 6,
  june: 6,
  jul: 7,
  july: 7,
  aug: 8,
  august: 8,
  sep: 9,
  sept: 9,
  september: 9,
  oct: 10,
  october: 10,
  nov: 11,
  november: 11,
  dec: 12,
  december: 12,
};

/**
 * Two-digit years at or below this map to the 2000s, above it to the 1900s —
 * the POSIX/strptime convention.
 */
const CENTURY_PIVOT = 69;

const expandYear = (raw: string): number => {
  const year = Number(raw);
  if (raw.length === 4) {
    return year;
  }
  return year <= CENTURY_PIVOT ? 2000 + year : 1900 + year;
};

const toIsoDate = (year: number, month: number, day: number): string | null => {
  if (month < 1 || month > 12 || day < 1 || day > 31) {
    return null;
  }
  return `${String(year).padStart(4, '0')}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
};

const parseMonthNameDate = (value: string): string | null => {
  const monthFirst = value.match(MONTH_FIRST_DATE);
  if (monthFirst) {
    const month = MONTH_NAMES[monthFirst[1].toLowerCase()];
    return month
      ? toIsoDate(expandYear(monthFirst[3]), month, Number(monthFirst[2]))
      : null;
  }

  const dayFirst = value.match(DAY_FIRST_DATE);
  if (dayFirst) {
    const month = MONTH_NAMES[dayFirst[2].toLowerCase()];
    return month
      ? toIsoDate(expandYear(dayFirst[3]), month, Number(dayFirst[1]))
      : null;
  }

  return null;
};

/**
 * Normalize a source date string to ISO `YYYY-MM-DD` using the user-selected
 * format, resolving the DD-vs-MM ambiguity explicitly. ISO dates (with or
 * without a time part) are accepted in every mode. Under `auto`, a numeric date
 * is resolved only when one component exceeds 12; a genuinely ambiguous value
 * like `01/02/2024` returns null so the caller falls back to an explicit choice.
 * Returns null when the value does not match the chosen format or is not a real
 * calendar day.
 */
export const normalizeDate = (
  value: string,
  format: DateFormat,
): string | null => {
  const trimmed = value.trim();
  if (!trimmed) {
    return null;
  }

  const iso = trimmed.match(ISO_DATE);
  if (iso) {
    return toIsoDate(Number(iso[1]), Number(iso[2]), Number(iso[3]));
  }

  if (format === 'iso') {
    return null;
  }

  const named = parseMonthNameDate(trimmed);
  if (named) {
    return named;
  }

  const numeric = trimmed.match(NUMERIC_DATE);
  if (!numeric) {
    return null;
  }

  const first = Number(numeric[1]);
  const second = Number(numeric[2]);
  const year = expandYear(numeric[3]);

  if (format === 'auto') {
    if (first > 12 && second <= 12) {
      return toIsoDate(year, second, first);
    }
    if (second > 12 && first <= 12) {
      return toIsoDate(year, first, second);
    }
    return null;
  }

  return format === 'dmy'
    ? toIsoDate(year, second, first)
    : toIsoDate(year, first, second);
};

const DATE_PATTERNS = [
  ISO_DATE,
  NUMERIC_DATE,
  MONTH_FIRST_DATE,
  DAY_FIRST_DATE,
] as const;

/**
 * Read the clock time riding along in a date value, as exported by tools that
 * stamp the moment of entry. Returns null when the value carries no time, so a
 * date-only column simply yields no time rather than an error.
 */
export const extractTimeFromDate = (value: string): string | null => {
  const trimmed = value.trim();
  for (const pattern of DATE_PATTERNS) {
    const match = trimmed.match(pattern);
    if (match) {
      return toTimeOfDay(match[4], match[5], match[6]);
    }
  }
  return null;
};

/**
 * Normalize a dedicated time column's value to `HH:MM`. Returns null when the
 * value cannot be read as a time; the caller decides whether that is worth
 * reporting, since a transaction may be stored without one.
 */
export const normalizeTime = (value: string): string | null => {
  const match = value.trim().match(STANDALONE_TIME);
  return match ? toTimeOfDay(match[1], match[2], match[3]) : null;
};

/**
 * Infer the day/month order of a numeric date column from the column as a
 * whole: a component above 12 can only be a day, which settles the order for
 * every other row. Returns null when no row proves an order, or when different
 * rows prove opposite orders — the caller then keeps its own format rather than
 * guessing. ISO and month-name values carry no ordering evidence and are
 * ignored.
 *
 * The whole column is scanned rather than a sample, because a single
 * contradicting row must be able to veto an order the rest of the file implies.
 */
export const inferDateOrder = (values: readonly string[]): DateOrder | null => {
  let sawDayFirst = false;
  let sawMonthFirst = false;

  for (const value of values) {
    const numeric = value.trim().match(NUMERIC_DATE);
    if (!numeric) {
      continue;
    }

    const first = Number(numeric[1]);
    const second = Number(numeric[2]);
    if (first > 12 && second <= 12) {
      sawDayFirst = true;
    } else if (second > 12 && first <= 12) {
      sawMonthFirst = true;
    }

    if (sawDayFirst && sawMonthFirst) {
      return null;
    }
  }

  if (sawDayFirst === sawMonthFirst) {
    return null;
  }
  return sawDayFirst ? 'dmy' : 'mdy';
};
