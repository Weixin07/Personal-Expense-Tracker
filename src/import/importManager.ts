import {
  withDatabase,
  withTransaction,
  createTransactionsBulk,
  getCategoryByName,
  createCategory,
  upsertCurrencyFxRate,
} from '../database';
import type {
  CategoryRecord,
  CurrencyFxRateRecord,
  TransactionRecord,
  TransactionType,
  NewTransactionRecord,
} from '../database';
import {
  normalizeCurrency,
  validateCurrencyCode,
  validatePositiveAmount,
  validatePositiveRate,
  validateIsoDateWithinFutureWindow,
} from '../utils/validation';
import { computeBaseAmount } from '../screens/transactionFormUtils';
import { parseCsv } from './csvParser';
import {
  applyMapping,
  extractTimeFromDate,
  inferDateOrder,
  missingRequiredFields,
  normalizeDate,
  normalizeTime,
  resolveTransactionType,
} from './mapping';
import { fxPairKey } from './types';
import type {
  AmbiguousCurrency,
  CsvDelimiter,
  DateFormat,
  DateOrder,
  DuplicateFlag,
  FieldMapping,
  FxRateSource,
  FxSuggestion,
  ImportPreview,
  ImportRowError,
  ImportSummary,
  NegativeAmountMeaning,
  NumberFormat,
  PreparedTransaction,
} from './types';

const UNKNOWN_PAYEE = 'Unknown';

export type ImportContext = {
  baseCurrency: string | null;
  /**
   * Applied when the source has no currency column, or the column is blank.
   * Without it such rows cannot be imported at all.
   */
  defaultCurrency: string | null;
  /**
   * Chosen ISO code per raw currency cell that maps to more than one currency,
   * keyed by the lower-cased raw value (e.g. `$` → `AUD`).
   */
  currencyChoices: Record<string, string>;
  negativeMeans: NegativeAmountMeaning;
  numberFormat: NumberFormat;
  delimiter?: CsvDelimiter;
  /**
   * Rates the user confirmed during review, keyed by `fxPairKey`. Consulted
   * after a rate the file supplied and before the cache, so confirming a rate
   * corrects a stale cached one rather than being shadowed by it.
   */
  manualFxRates?: Record<string, number>;
  fxRateCache: readonly CurrencyFxRateRecord[];
  existingTransactions: readonly TransactionRecord[];
  existingCategories: readonly CategoryRecord[];
};

/**
 * Free text differs in case and spacing between exports of the same ledger, so
 * it is folded before it can decide identity. Applied to both sides of every
 * comparison, so it can only ever merge two spellings of one row, never hide a
 * row from its match.
 */
const foldIdentityText = (value: string): string =>
  value.trim().toLowerCase().replace(/\s+/g, ' ');

/**
 * Two times identify the same moment when both are present and equal, or when
 * either is absent. A row that never recorded a time carries no evidence
 * against a match, so it must not count as disagreement — under strict equality
 * a date-only file would flag nothing against rows stored with a time.
 */
const timesMatch = (a: string | null, b: string | null): boolean =>
  a == null || b == null || a === b;

/**
 * Direction is part of the key: a refund and a purchase can share a date,
 * amount and payee without being the same row.
 *
 * Time is deliberately absent: it is compared separately, because a wildcard
 * match cannot be expressed in a concatenated key.
 */
const duplicateKey = (
  type: TransactionType,
  date: string,
  amountNative: number,
  currencyCode: string,
  payee: string,
  description: string,
): string =>
  `${type}|${date}|${amountNative.toFixed(2)}|${currencyCode}|${foldIdentityText(payee)}|${foldIdentityText(description)}`;

const findCachedRate = (
  cache: readonly CurrencyFxRateRecord[],
  base: string,
  currency: string,
): number | null => {
  const found = cache.find(
    rate =>
      rate.baseCurrencyCode.toUpperCase() === base &&
      rate.currencyCode.toUpperCase() === currency,
  );
  return found ? found.fxRateToBase : null;
};

/**
 * Strips symbols, spaces and letters. Digits survive along with the separators,
 * parentheses and minus, which still carry the decimal position and the sign.
 */
const NON_NUMERIC = /[^\d.,()-]/g;
const GROUPING_RUN = 3;

/**
 * Decide which of `.` / `,` acts as the decimal point. Under `auto`, a value
 * carrying both separators is resolved by position — the rightmost is the
 * decimal — and a lone separator followed by exactly three digits is read as
 * grouping, since that is what `1.234` almost always means in the wild. `us`
 * and `eu` state the answer outright for values `auto` cannot settle.
 * Returns null when every separator is grouping.
 */
const pickDecimalSeparator = (
  value: string,
  format: NumberFormat,
): '.' | ',' | null => {
  const lastDot = value.lastIndexOf('.');
  const lastComma = value.lastIndexOf(',');

  if (format === 'us') {
    return lastDot === -1 ? null : '.';
  }
  if (format === 'eu') {
    return lastComma === -1 ? null : ',';
  }

  if (lastDot === -1 && lastComma === -1) {
    return null;
  }
  if (lastDot !== -1 && lastComma !== -1) {
    return lastDot > lastComma ? '.' : ',';
  }

  const separator = lastDot !== -1 ? '.' : ',';
  const index = Math.max(lastDot, lastComma);
  const occurrences = value.split(separator).length - 1;
  if (occurrences > 1) {
    return null;
  }
  return value.length - index - 1 === GROUPING_RUN ? null : separator;
};

/**
 * Parse a source amount that may carry a currency symbol, digit grouping, a
 * locale-specific decimal mark, or an accounting-style parenthesised negative.
 * Returns null when no number can be read.
 */
export const normalizeAmount = (
  raw: string,
  format: NumberFormat,
): number | null => {
  const trimmed = raw.trim();
  if (!trimmed) {
    return null;
  }

  const stripped = trimmed.replace(NON_NUMERIC, '');
  const negative = /^\(.*\)$/.test(stripped) || stripped.includes('-');
  const digits = stripped.replace(/[()-]/g, '');
  if (!/\d/.test(digits)) {
    return null;
  }

  const decimalSeparator = pickDecimalSeparator(digits, format);
  let normalized: string;
  if (decimalSeparator === null) {
    normalized = digits.replace(/[.,]/g, '');
  } else {
    const grouping = decimalSeparator === '.' ? ',' : '.';
    normalized = digits
      .split(grouping)
      .join('')
      .split(decimalSeparator)
      .join('.');
  }

  const value = Number(normalized);
  if (!Number.isFinite(value)) {
    return null;
  }
  return negative ? -value : value;
};

type CurrencyResolution =
  | { status: 'ok'; code: string }
  | { status: 'ambiguous'; candidates: string[] }
  | { status: 'missing' }
  | { status: 'unknown' };

/**
 * Resolve a raw currency cell to an ISO code, falling back to the default
 * currency only when the cell is empty — an unrecognised value is reported
 * rather than silently replaced.
 */
const resolveCurrency = (
  rawValue: string,
  defaultCurrency: string | null,
  choices: Record<string, string>,
): CurrencyResolution => {
  const trimmed = rawValue.trim();
  if (!trimmed) {
    return defaultCurrency
      ? { status: 'ok', code: defaultCurrency }
      : { status: 'missing' };
  }

  const normalised = normalizeCurrency(trimmed);
  if (normalised.status === 'ok') {
    return { status: 'ok', code: normalised.code };
  }
  if (normalised.status === 'ambiguous') {
    const chosen = choices[trimmed.toLowerCase()];
    if (chosen && normalised.candidates.includes(chosen)) {
      return { status: 'ok', code: chosen };
    }
    return { status: 'ambiguous', candidates: normalised.candidates };
  }
  return { status: 'unknown' };
};

/**
 * Read-only phase: parse + map + validate every row, resolve FX rates, flag
 * duplicates, and list categories that would be created. Performs no database
 * writes.
 *
 * Rows that are well-formed but whose currency pair yielded no rate go to
 * `needsFxRate`, disjoint from `invalid`. See `FxRateSource` for the precedence
 * a rate is resolved by and `NegativeMeans` for how direction is decided.
 * Duplicates are flagged, never rejected.
 *
 * Throws only when required columns are unmapped — individual bad rows are
 * reported in `invalid`, never thrown.
 */
export const previewImport = (
  text: string,
  mapping: FieldMapping,
  dateFormat: DateFormat,
  ctx: ImportContext,
): ImportPreview => {
  const defaultCurrency = ctx.defaultCurrency
    ? ctx.defaultCurrency.trim().toUpperCase()
    : null;

  const missing = missingRequiredFields(mapping, {
    hasDefaultCurrency: Boolean(defaultCurrency),
  });
  if (missing.length) {
    throw new Error(
      `Map the required columns before importing: ${missing.join(', ')}.`,
    );
  }

  const baseCurrency = ctx.baseCurrency
    ? ctx.baseCurrency.trim().toUpperCase()
    : null;

  const existingKeys = new Map<string, { id: number; time: string | null }[]>();
  ctx.existingTransactions.forEach(transaction => {
    const key = duplicateKey(
      transaction.type,
      transaction.date,
      transaction.amountNative,
      transaction.currencyCode,
      transaction.payee,
      transaction.description,
    );
    const entry = { id: transaction.id, time: transaction.time };
    const bucket = existingKeys.get(key);
    if (bucket) {
      bucket.push(entry);
    } else {
      existingKeys.set(key, [entry]);
    }
  });

  const existingCategoryNames = new Set(
    ctx.existingCategories.map(category => category.name.toLowerCase()),
  );

  const { rows } = parseCsv(text, { delimiter: ctx.delimiter });

  const dateColumn = mapping.date;
  let inferredDateOrder: DateOrder | null = null;
  if (dateFormat === 'auto' && dateColumn !== undefined) {
    inferredDateOrder = inferDateOrder(
      rows.map(row => row.cells[dateColumn] ?? ''),
    );
  }
  const effectiveDateFormat: DateFormat = inferredDateOrder ?? dateFormat;

  // Whole-file property, so it is settled before any row is classified. Rows
  // that fail later validation still count: whether the file carries sign
  // information does not depend on which rows survive.
  const amountColumn = mapping.amountNative;
  const fileHasAnyNegativeAmount =
    amountColumn !== undefined &&
    rows.some(row => {
      const parsed = normalizeAmount(
        row.cells[amountColumn] ?? '',
        ctx.numberFormat,
      );
      return parsed != null && parsed < 0;
    });

  const manualFxRates = ctx.manualFxRates ?? {};

  const valid: PreparedTransaction[] = [];
  const invalid: ImportRowError[] = [];
  const needsFxRate: ImportRowError[] = [];
  const unreadableTimes: ImportRowError[] = [];
  const fxReview = new Map<string, FxSuggestion>();
  const currencyReview = new Map<string, AmbiguousCurrency>();
  const duplicates: DuplicateFlag[] = [];
  const seenKeys = new Map<string, { line: number; time: string | null }[]>();
  const newCategoryNames = new Set<string>();

  rows.forEach(row => {
    const { line } = row;
    const raw = applyMapping(row.cells, mapping);

    const parsedAmount = normalizeAmount(
      raw.amountNative ?? '',
      ctx.numberFormat,
    );
    if (parsedAmount == null) {
      invalid.push({ line, reason: 'Amount is required.' });
      return;
    }
    const magnitude = Math.abs(parsedAmount);
    const amountCheck = validatePositiveAmount(magnitude, 'Amount');
    if (!amountCheck.valid) {
      invalid.push({ line, reason: amountCheck.message });
      return;
    }

    const isNegative = parsedAmount < 0;
    const declaredType = resolveTransactionType(raw.transactionType ?? '');
    let transactionType: TransactionType;
    if (declaredType) {
      transactionType = declaredType;
    } else if (!fileHasAnyNegativeAmount) {
      transactionType = 'expense';
    } else if (ctx.negativeMeans === 'income') {
      transactionType = isNegative ? 'income' : 'expense';
    } else {
      transactionType = isNegative ? 'expense' : 'income';
    }

    const rawCurrency = raw.currencyCode ?? '';
    const currencyResolution = resolveCurrency(
      rawCurrency,
      defaultCurrency,
      ctx.currencyChoices,
    );
    if (currencyResolution.status === 'ambiguous') {
      const key = rawCurrency.trim().toLowerCase();
      if (!currencyReview.has(key)) {
        currencyReview.set(key, {
          raw: rawCurrency.trim(),
          candidates: currencyResolution.candidates,
        });
      }
      invalid.push({
        line,
        reason: `Choose which currency "${rawCurrency.trim()}" means.`,
      });
      return;
    }
    if (currencyResolution.status === 'missing') {
      invalid.push({ line, reason: 'Currency code is required.' });
      return;
    }

    // An unrecognised value falls through to validateCurrencyCode so it reports
    // the same reason it would for a directly-entered code.
    const currencyCode =
      currencyResolution.status === 'ok'
        ? currencyResolution.code
        : rawCurrency.trim().toUpperCase();
    const currencyCheck = validateCurrencyCode(currencyCode);
    if (!currencyCheck.valid) {
      invalid.push({ line, reason: currencyCheck.message });
      return;
    }

    const rawBase = (raw.baseCurrencyCode ?? '').trim();
    let baseCurrencyCode: string | null = baseCurrency;
    if (rawBase) {
      const baseResolution = resolveCurrency(
        rawBase,
        null,
        ctx.currencyChoices,
      );
      baseCurrencyCode =
        baseResolution.status === 'ok'
          ? baseResolution.code
          : rawBase.toUpperCase();
    }
    if (baseCurrencyCode) {
      const baseCheck = validateCurrencyCode(baseCurrencyCode);
      if (!baseCheck.valid) {
        invalid.push({ line, reason: `Base currency: ${baseCheck.message}` });
        return;
      }
    }

    const normalizedDate = normalizeDate(raw.date ?? '', effectiveDateFormat);
    if (!normalizedDate) {
      invalid.push({
        line,
        reason: 'Date is invalid or does not match the selected format.',
      });
      return;
    }
    const dateCheck = validateIsoDateWithinFutureWindow(normalizedDate);
    if (!dateCheck.valid) {
      invalid.push({ line, reason: dateCheck.message });
      return;
    }

    const rawTime = (raw.time ?? '').trim();
    let time: string | null;
    if (rawTime) {
      time = normalizeTime(rawTime);
      if (!time) {
        unreadableTimes.push({
          line,
          reason: `Could not read the time "${rawTime}".`,
        });
      }
    } else {
      time = extractTimeFromDate(raw.date ?? '');
    }

    let fxRate: number;
    let fxRateSource: FxRateSource;
    const mappedRate = (raw.fxRateToBase ?? '').trim();
    if (mappedRate) {
      const parsed = normalizeAmount(mappedRate, ctx.numberFormat);
      if (parsed == null) {
        invalid.push({ line, reason: 'FX rate is required.' });
        return;
      }
      const rateCheck = validatePositiveRate(parsed, 'FX rate');
      if (!rateCheck.valid) {
        invalid.push({ line, reason: rateCheck.message });
        return;
      }
      fxRate = parsed;
      fxRateSource = 'column';
    } else if (!baseCurrencyCode || currencyCode === baseCurrencyCode) {
      fxRate = 1;
      fxRateSource = 'parity';
    } else {
      const cached = findCachedRate(
        ctx.fxRateCache,
        baseCurrencyCode,
        currencyCode,
      );
      const key = fxPairKey(baseCurrencyCode, currencyCode);
      const seen = fxReview.get(key);
      if (seen) {
        seen.rowCount += 1;
      } else {
        fxReview.set(key, {
          baseCurrencyCode,
          currencyCode,
          suggestedRate: cached,
          rowCount: 1,
        });
      }

      const manual = manualFxRates[key];
      const manualUsable =
        manual != null && validatePositiveRate(manual, 'FX rate').valid;
      const resolved = manualUsable ? manual : cached;
      if (resolved == null) {
        needsFxRate.push({
          line,
          reason: `FX rate required for ${currencyCode} to ${baseCurrencyCode}.`,
        });
        return;
      }
      fxRate = resolved;
      fxRateSource = manualUsable ? 'manual' : 'cached';
    }

    const baseAmount = computeBaseAmount(String(magnitude), String(fxRate));
    if (baseAmount == null) {
      invalid.push({ line, reason: 'Base amount could not be computed.' });
      return;
    }

    const description = (raw.description ?? '').trim();
    let payee = (raw.payee ?? '').trim();
    const categoryRaw = (raw.categoryName ?? '').trim();
    const categoryName = categoryRaw.length ? categoryRaw : null;
    if (!description && !payee) {
      payee = UNKNOWN_PAYEE;
    }

    const notes = (raw.notes ?? '').trim();

    // Must follow the payee fallback: the placeholder is what gets stored, so
    // it is what a later import will match against.
    const key = duplicateKey(
      transactionType,
      normalizedDate,
      magnitude,
      currencyCode,
      payee,
      description,
    );
    const existingMatch = existingKeys
      .get(key)
      ?.find(entry => timesMatch(entry.time, time));
    const seenMatch = seenKeys
      .get(key)
      ?.find(entry => timesMatch(entry.time, time));
    if (existingMatch) {
      duplicates.push({ line, matchesTransactionId: existingMatch.id });
    } else if (seenMatch) {
      duplicates.push({
        line,
        matchesTransactionId: null,
        matchesLine: seenMatch.line,
      });
    }
    if (!seenMatch) {
      const bucket = seenKeys.get(key);
      const entry = { line, time };
      if (bucket) {
        bucket.push(entry);
      } else {
        seenKeys.set(key, [entry]);
      }
    }

    if (
      categoryName &&
      !existingCategoryNames.has(categoryName.toLowerCase())
    ) {
      newCategoryNames.add(categoryName);
    }

    valid.push({
      line,
      record: {
        type: transactionType,
        description,
        payee,
        amountNative: magnitude,
        currencyCode,
        fxRateToBase: fxRate,
        baseAmount,
        baseCurrencyCode: baseCurrencyCode ?? null,
        date: normalizedDate,
        time,
        notes: notes.length ? notes : null,
      },
      categoryName,
      fxRateSource,
    });
  });

  return {
    valid,
    invalid,
    needsFxRate,
    unreadableTimes,
    fxReview: [...fxReview.values()],
    currencyReview: [...currencyReview.values()],
    duplicates,
    newCategoryNames: [...newCategoryNames],
    totalRows: rows.length,
    inferredDateOrder,
    signConventionBypassed: !fileHasAnyNegativeAmount,
  };
};

/**
 * Write phase: inside a single transaction, create any missing categories,
 * bulk-insert the valid rows, and seed the FX-rate cache — all atomic, so a
 * failure rolls the whole import back.
 *
 * `acceptedRates` (keyed by `fxPairKey`) overrides the rate for rows that did
 * not get one from the file, recomputing the base amount to match; `column` and
 * `parity` rows are never overridden, per `FxRateSource`.
 *
 * Every committed pair is written to the FX-rate cache, so a rate confirmed here
 * becomes the prefill for later manual entry.
 */
export const commitImport = async (
  preview: ImportPreview,
  acceptedRates: Record<string, number> = {},
): Promise<ImportSummary> =>
  withDatabase(db =>
    withTransaction(db, async () => {
      const distinctNames = [
        ...new Set(
          preview.valid
            .map(item => item.categoryName)
            .filter((name): name is string => Boolean(name)),
        ),
      ];

      const nameToId = new Map<string, number>();
      let createdCategories = 0;
      for (const name of distinctNames) {
        const existing = await getCategoryByName(db, name);
        if (existing) {
          nameToId.set(name.toLowerCase(), existing.id);
        } else {
          const created = await createCategory(db, { name, type: 'both' });
          nameToId.set(name.toLowerCase(), created.id);
          createdCategories += 1;
        }
      }

      const records: NewTransactionRecord[] = preview.valid.map(item => {
        let { fxRateToBase, baseAmount } = item.record;
        const overridable =
          item.fxRateSource === 'manual' || item.fxRateSource === 'cached';
        const override = item.record.baseCurrencyCode
          ? acceptedRates[
              fxPairKey(item.record.baseCurrencyCode, item.record.currencyCode)
            ]
          : undefined;
        if (overridable && override != null && override > 0) {
          fxRateToBase = override;
          baseAmount =
            computeBaseAmount(
              String(item.record.amountNative),
              String(override),
            ) ?? baseAmount;
        }
        return {
          ...item.record,
          fxRateToBase,
          baseAmount,
          categoryId: item.categoryName
            ? (nameToId.get(item.categoryName.toLowerCase()) ?? null)
            : null,
        };
      });

      await createTransactionsBulk(db, records);
      const insertedIncome = records.filter(
        record => record.type === 'income',
      ).length;

      const seeded = new Set<string>();
      for (const record of records) {
        if (!record.baseCurrencyCode) {
          continue;
        }
        const key = fxPairKey(record.baseCurrencyCode, record.currencyCode);
        if (seeded.has(key)) {
          continue;
        }
        seeded.add(key);
        await upsertCurrencyFxRate(
          db,
          record.baseCurrencyCode,
          record.currencyCode,
          record.fxRateToBase,
        );
      }

      return {
        insertedExpenses: records.length - insertedIncome,
        insertedIncome,
        skippedInvalid: preview.invalid.length,
        skippedNeedsFxRate: preview.needsFxRate.length,
        createdCategories,
      };
    }),
  );
