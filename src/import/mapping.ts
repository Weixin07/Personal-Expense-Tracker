import type {
  DateFormat,
  DateOrder,
  FieldMapping,
  ImportTargetField,
  ParsedRow,
  TransactionDirection,
} from './types';

/**
 * App export column names (from EXPENSE_CSV_COLUMNS) → import target fields.
 * Keys mirror the header `buildExpensesCsv` writes, so a re-imported backup
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
  category: 'categoryName',
  notes: 'notes',
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
};

/** Values an explicit transaction-type column uses for each direction. */
const TRANSACTION_TYPE_VALUES: Record<string, TransactionDirection> = {
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
 * Read a raw transaction-type cell as a direction. Returns null when the value
 * is empty or outside the known vocabulary, so the caller can fall back to the
 * sign convention rather than reject the row.
 */
export const resolveTransactionType = (
  raw: string,
): TransactionDirection | null =>
  TRANSACTION_TYPE_VALUES[raw.trim().toLowerCase()] ?? null;

export const REQUIRED_TARGET_FIELDS: readonly ImportTargetField[] = [
  'amountNative',
  'currencyCode',
  'date',
];

export type RawCandidate = Partial<Record<ImportTargetField, string>>;

const normalizeHeader = (raw: string): string =>
  raw.trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ');

const hasAnyValue = (rows: readonly ParsedRow[], index: number): boolean =>
  rows.some(row => (row.cells[index] ?? '').trim().length > 0);

/**
 * Auto-map a header to target fields. `rows` are consulted only to break ties
 * between columns whose names are equally good candidates, so a header-only call
 * still maps everything a header alone can settle.
 *
 * Exports written for people rather than for re-import often carry a note column
 * and no description column at all. Such a column is the row's identity — what a
 * reader would call the expense — so it fills `description` when nothing else
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

const ISO_DATE = /^(\d{4})-(\d{2})-(\d{2})(?:[T ].*)?$/;

/**
 * Optional clock time trailing a date, as exported by tools that stamp the
 * moment of entry. Matched as a time-shaped token rather than "any trailing
 * text" so a malformed value is still rejected. Covers seconds, fractional
 * seconds, 12-hour suffixes and zone offsets; the value itself is discarded,
 * since an expense stores a calendar day.
 */
const TIME_SUFFIX =
  '(?:[T\\s]+\\d{1,2}:\\d{2}(?::\\d{2}(?:\\.\\d+)?)?\\s*(?:[AaPp]\\.?[Mm]\\.?)?\\s*(?:Z|[+-]\\d{2}:?\\d{2})?)?';

const NUMERIC_DATE = new RegExp(
  `^(\\d{1,2})[/\\-.](\\d{1,2})[/\\-.](\\d{2}|\\d{4})${TIME_SUFFIX}$`,
);
const MONTH_FIRST_DATE = new RegExp(
  `^([A-Za-z]{3,})\\.?\\s+(\\d{1,2})(?:st|nd|rd|th)?,?\\s+(\\d{2}|\\d{4})${TIME_SUFFIX}$`,
);
const DAY_FIRST_DATE = new RegExp(
  `^(\\d{1,2})(?:st|nd|rd|th)?\\s+([A-Za-z]{3,})\\.?,?\\s+(\\d{2}|\\d{4})${TIME_SUFFIX}$`,
);

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
