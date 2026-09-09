import {
  withDatabase,
  withTransaction,
  createTransactionsBulk,
  getCategoryByName,
  createCategory,
  updateCategory,
  createFund,
  getFundByName,
  upsertCurrencyFxRate,
} from '../database';
import type {
  CategoryType,
  CurrencyFxRateRecord,
  FundRecord,
  TransactionDirection,
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
import { convertToCurrency, deriveCounterpartRate } from '../utils/fxRates';
import { resolveTransferCurrency } from '../utils/funds';
import { computeBaseAmount } from '../screens/transactionFormUtils';
import { parseCsv } from './csvParser';
import {
  applyMapping,
  extractTimeFromDate,
  hasAnyValue,
  inferDateOrder,
  missingRequiredFields,
  normalizeDate,
  normalizeTime,
  resolveTransactionType,
} from './mapping';
import { findNearDuplicateCategory } from './categoryMatching';
import { isSuspectDerivedRate } from './fxGuards';
import { fxPairKey } from './types';
import type {
  AmbiguousCurrency,
  CategorySuggestion,
  CategoryTypeWidening,
  CommitImportOptions,
  CounterpartAmountSource,
  DateFormat,
  DateOrder,
  DuplicateFlag,
  FieldMapping,
  FxRateSource,
  FxSuggestion,
  ImportContext,
  ImportPreview,
  ImportRowError,
  ImportSummary,
  ImportTargetField,
  NumberFormat,
  PreparedTransaction,
  SeededRate,
  SuspectDerivedRate,
  TransferConversion,
  UnmappedColumn,
} from './types';

const UNKNOWN_PAYEE = 'Unknown';

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
 *
 * The fund is absent for everything but a transfer. Re-filing a transaction
 * into another fund must not stop a re-imported backup recognising it. A
 * transfer is the exception: its payee and description are usually blank, so
 * without its two funds two distinct moves of the same amount on one day would
 * share a key.
 */
const duplicateKey = (
  type: TransactionType,
  date: string,
  amountNative: number,
  currencyCode: string,
  payee: string,
  description: string,
  fundKey: string,
): string =>
  `${type}|${date}|${amountNative.toFixed(2)}|${currencyCode}|${foldIdentityText(payee)}|${foldIdentityText(description)}|${fundKey}`;

/**
 * Fund component of a duplicate key, under the rule stated on `duplicateKey`.
 */
const transferFundKey = (
  type: TransactionType,
  fundName: string | null,
  counterpartFundName: string | null,
): string =>
  type === 'transfer'
    ? `${foldIdentityText(fundName ?? '')}>${foldIdentityText(counterpartFundName ?? '')}`
    : '';

const findCachedRate = (
  cache: readonly CurrencyFxRateRecord[],
  base: string,
  currency: string,
): CurrencyFxRateRecord | null =>
  cache.find(
    rate =>
      rate.baseCurrencyCode.toUpperCase() === base &&
      rate.currencyCode.toUpperCase() === currency,
  ) ?? null;

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

/**
 * Read a converted amount the file supplied and the rate it implies, so a source
 * that recorded its own conversion does not need one supplied for the whole
 * import. The amount is taken as given rather than recomputed from the rate:
 * it is the figure the source recorded, and multiplying it back out would only
 * introduce rounding the file never had.
 *
 * Returns null when the cell holds no usable positive number, so the caller
 * falls through to the rest of the rate ladder rather than losing the row.
 */
const deriveRateFromBaseAmount = (
  rawBaseAmount: string,
  magnitude: number,
  format: NumberFormat,
): { rate: number; baseAmount: number } | null => {
  const parsed = normalizeAmount(rawBaseAmount, format);
  if (parsed == null) {
    return null;
  }

  // Quantised through the same helper every other base amount passes, so a
  // file-supplied figure is stored to the same precision as a computed one.
  const baseAmount = computeBaseAmount(String(Math.abs(parsed)), '1');
  if (
    baseAmount == null ||
    !validatePositiveAmount(baseAmount, 'Base amount').valid
  ) {
    return null;
  }

  const rate = baseAmount / magnitude;
  if (!validatePositiveRate(rate, 'FX rate').valid) {
    return null;
  }

  return { rate, baseAmount };
};

/**
 * Whether a category must be widened before this import can file these
 * directions under it. A `both` category already accepts either; a narrower one
 * is widened rather than made to reject an otherwise valid row.
 *
 * Shared by the preview and the commit so the disclosure a user accepts and the
 * write that follows cannot disagree.
 */
export const categoryNeedsWidening = (
  type: CategoryType,
  directions: ReadonlySet<TransactionDirection>,
): boolean =>
  type !== 'both' && [...directions].some(direction => direction !== type);

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
 * duplicates, and report everything the caller must weigh before committing.
 * Performs no database writes.
 *
 * Rows that are well-formed but whose currency pair yielded no rate go to
 * `needsFxRate`, disjoint from `invalid`. See `FxRateSource` for the precedence
 * a rate is resolved by and `NegativeMeans` for how direction is decided.
 * Duplicates are flagged, never rejected; so are pairs whose derived rate
 * contradicts what they are worth, reported in `suspectDerivedRates`.
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

  const fundNameById = new Map<number, string>();
  const existingFundsByName = new Map<string, FundRecord>();
  ctx.existingFunds.forEach(fund => {
    fundNameById.set(fund.id, fund.name);
    existingFundsByName.set(fund.name.trim().toLowerCase(), fund);
  });

  const existingKeys = new Map<string, { id: number; time: string | null }[]>();
  ctx.existingTransactions.forEach(transaction => {
    const key = duplicateKey(
      transaction.type,
      transaction.date,
      transaction.amountNative,
      transaction.currencyCode,
      transaction.payee,
      transaction.description,
      transferFundKey(
        transaction.type,
        fundNameById.get(transaction.fundId) ?? null,
        transaction.counterpartFundId != null
          ? (fundNameById.get(transaction.counterpartFundId) ?? null)
          : null,
      ),
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

  const existingFundNames = new Set(
    ctx.existingFunds.map(fund => fund.name.toLowerCase()),
  );

  const { header, rows } = parseCsv(text, { delimiter: ctx.delimiter });

  const mappedColumns = new Set(
    (Object.keys(mapping) as ImportTargetField[])
      .map(field => mapping[field])
      .filter((index): index is number => index !== undefined),
  );
  const unmappedColumns: UnmappedColumn[] = [];
  header.forEach((name, index) => {
    if (mappedColumns.has(index) || !hasAnyValue(rows, index)) {
      return;
    }
    const sample = rows.find(row => (row.cells[index] ?? '').trim().length > 0);
    unmappedColumns.push({
      index,
      header: name.trim(),
      sampleValue: (sample?.cells[index] ?? '').trim(),
    });
  });

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
  const useCachedRates = ctx.useCachedRates ?? true;

  const valid: PreparedTransaction[] = [];
  const invalid: ImportRowError[] = [];
  const needsFxRate: ImportRowError[] = [];
  const unreadableTimes: ImportRowError[] = [];
  const fxReview = new Map<string, FxSuggestion>();
  const suspectDerived = new Map<string, SuspectDerivedRate>();
  const transferConversions = new Map<string, TransferConversion>();
  const currencyReview = new Map<string, AmbiguousCurrency>();
  const duplicates: DuplicateFlag[] = [];
  const seenKeys = new Map<string, { line: number; time: string | null }[]>();
  const newCategoryNames = new Set<string>();
  const newCategoryRowCounts = new Map<string, number>();
  const newFundNames = new Map<string, string>();
  const newFundRowCounts = new Map<string, number>();
  const categoryDirections = new Map<string, Set<TransactionDirection>>();
  const validCurrencies = new Set<string>();

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
      // Authoritative, transfers included: the sign ladder below classifies a
      // row as money in or out, which a transfer is neither of.
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
    let suppliedBaseAmount: number | null = null;
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
      const derived = deriveRateFromBaseAmount(
        raw.baseAmount ?? '',
        magnitude,
        ctx.numberFormat,
      );
      if (derived) {
        fxRate = derived.rate;
        fxRateSource = 'derived';
        suppliedBaseAmount = derived.baseAmount;

        const suspect = isSuspectDerivedRate({
          rate: derived.rate,
          currencyCode,
          baseCurrencyCode,
          cachedRate:
            findCachedRate(ctx.fxRateCache, baseCurrencyCode, currencyCode)
              ?.fxRateToBase ?? null,
        });
        if (suspect) {
          const key = fxPairKey(baseCurrencyCode, currencyCode);
          const seen = suspectDerived.get(key);
          if (seen) {
            seen.rowCount += 1;
          } else {
            suspectDerived.set(key, {
              baseCurrencyCode,
              currencyCode,
              rate: derived.rate,
              rowCount: 1,
            });
          }
        }
      } else {
        const cachedRecord = findCachedRate(
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
            suggestedRate: cachedRecord?.fxRateToBase ?? null,
            suggestedRateUpdatedAt: cachedRecord?.updatedAt ?? null,
            rowCount: 1,
          });
        }

        const cached = useCachedRates
          ? (cachedRecord?.fxRateToBase ?? null)
          : null;
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
    }

    const baseAmount =
      suppliedBaseAmount ??
      computeBaseAmount(String(magnitude), String(fxRate));
    if (baseAmount == null) {
      invalid.push({ line, reason: 'Base amount could not be computed.' });
      return;
    }

    const description = (raw.description ?? '').trim();
    let payee = (raw.payee ?? '').trim();
    const categoryRaw = (raw.categoryName ?? '').trim();
    // A transfer is identified by its two funds, so it never carries a category.
    const categoryName =
      transactionType === 'transfer' || !categoryRaw.length
        ? null
        : categoryRaw;
    if (!description && !payee && transactionType !== 'transfer') {
      payee = UNKNOWN_PAYEE;
    }

    const fundRaw = (raw.fundName ?? '').trim();
    const fundName = fundRaw.length ? fundRaw : null;
    const counterpartRaw = (raw.counterpartFundName ?? '').trim();
    const counterpartFundName =
      transactionType === 'transfer' && counterpartRaw.length
        ? counterpartRaw
        : null;

    if (transactionType === 'transfer' && !counterpartFundName) {
      invalid.push({
        line,
        reason: 'A transfer needs a destination fund.',
      });
      return;
    }
    if (
      counterpartFundName &&
      foldIdentityText(counterpartFundName) === foldIdentityText(fundRaw)
    ) {
      invalid.push({
        line,
        reason: 'A transfer cannot have the same fund on both sides.',
      });
      return;
    }

    let counterpartAmount: number | null = null;
    let counterpartCurrencyCode: string | null = null;
    let counterpartAmountSource: CounterpartAmountSource | null = null;
    if (transactionType === 'transfer') {
      // What the received amount was denominated in when the transfer happened.
      // The row wins, since the destination fund can be re-denominated after the
      // fact; a fund carrying no currency of its own follows the base currency,
      // which is also where a fund this import has yet to create lands.
      const rawCounterpartCurrency = (raw.counterpartCurrency ?? '').trim();
      if (rawCounterpartCurrency) {
        const resolved = resolveCurrency(
          rawCounterpartCurrency,
          null,
          ctx.currencyChoices,
        );
        const code =
          resolved.status === 'ok'
            ? resolved.code
            : rawCounterpartCurrency.toUpperCase();
        const check = validateCurrencyCode(code);
        if (!check.valid) {
          invalid.push({ line, reason: `Received currency: ${check.message}` });
          return;
        }
        counterpartCurrencyCode = code;
      } else {
        const destination = counterpartFundName
          ? (existingFundsByName.get(counterpartFundName.toLowerCase()) ?? null)
          : null;
        counterpartCurrencyCode = resolveTransferCurrency(
          null,
          destination,
          baseCurrency,
          currencyCode,
        );
      }

      const rawCounterpartAmount = (raw.counterpartAmount ?? '').trim();
      const sameCurrency =
        counterpartCurrencyCode != null &&
        counterpartCurrencyCode.toUpperCase() === currencyCode.toUpperCase();
      if (rawCounterpartAmount) {
        counterpartAmount = normalizeAmount(
          rawCounterpartAmount,
          ctx.numberFormat,
        );
        counterpartAmountSource = 'column';
      } else if (sameCurrency) {
        // Absent means the destination received the same magnitude that left,
        // which is what a same-currency transfer records.
        counterpartAmount = magnitude;
        counterpartAmountSource = 'parity';
      } else {
        // Copying the magnitude across a currency boundary would assert a rate
        // of 1 between two currencies that are not worth the same.
        const conversionKey =
          baseCurrencyCode && counterpartCurrencyCode
            ? fxPairKey(baseCurrencyCode, counterpartCurrencyCode)
            : null;
        const manualConversionRate =
          conversionKey != null ? manualFxRates[conversionKey] : undefined;
        const manualConversionUsable =
          manualConversionRate != null &&
          validatePositiveRate(manualConversionRate, 'FX rate').valid;
        const cachedForConversion = useCachedRates ? ctx.fxRateCache : [];
        const converted = convertToCurrency(
          baseAmount,
          counterpartCurrencyCode,
          baseCurrencyCode,
          manualConversionUsable
            ? [
                {
                  baseCurrencyCode: baseCurrencyCode as string,
                  currencyCode: counterpartCurrencyCode as string,
                  fxRateToBase: manualConversionRate as number,
                  updatedAt: '',
                },
                ...cachedForConversion,
              ]
            : cachedForConversion,
        );
        if (converted == null) {
          if (conversionKey != null) {
            const seenPair = fxReview.get(conversionKey);
            if (seenPair) {
              seenPair.rowCount += 1;
            } else {
              const cachedRecord = findCachedRate(
                ctx.fxRateCache,
                baseCurrencyCode as string,
                counterpartCurrencyCode as string,
              );
              fxReview.set(conversionKey, {
                baseCurrencyCode: baseCurrencyCode as string,
                currencyCode: counterpartCurrencyCode as string,
                suggestedRate: cachedRecord?.fxRateToBase ?? null,
                suggestedRateUpdatedAt: cachedRecord?.updatedAt ?? null,
                rowCount: 1,
              });
            }
          }
          needsFxRate.push({
            line,
            reason: 'A cross-currency transfer needs the amount received.',
          });
          return;
        }
        counterpartAmount = converted;
        counterpartAmountSource = manualConversionUsable ? 'manual' : 'cached';
        if (!manualConversionUsable) {
          const disclosureKey = `${currencyCode}>${counterpartCurrencyCode}`;
          const seenConversion = transferConversions.get(disclosureKey);
          if (seenConversion) {
            seenConversion.rowCount += 1;
          } else {
            transferConversions.set(disclosureKey, {
              currencyCode,
              counterpartCurrencyCode: counterpartCurrencyCode as string,
              rate: converted / magnitude,
              rowCount: 1,
            });
          }
        }
      }

      if (
        counterpartAmount == null ||
        !validatePositiveAmount(Math.abs(counterpartAmount), 'Amount received')
          .valid
      ) {
        invalid.push({
          line,
          reason: 'Amount received is not a positive number.',
        });
        return;
      }
      counterpartAmount = Math.abs(counterpartAmount);
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
      transferFundKey(transactionType, fundName, counterpartFundName),
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

    validCurrencies.add(currencyCode);

    if (categoryName && transactionType !== 'transfer') {
      const categoryKey = categoryName.toLowerCase();
      const directions =
        categoryDirections.get(categoryKey) ?? new Set<TransactionDirection>();
      directions.add(transactionType);
      categoryDirections.set(categoryKey, directions);

      if (!existingCategoryNames.has(categoryKey)) {
        newCategoryNames.add(categoryName);
        newCategoryRowCounts.set(
          categoryKey,
          (newCategoryRowCounts.get(categoryKey) ?? 0) + 1,
        );
      }
    }

    [fundName, counterpartFundName].forEach(name => {
      if (!name) {
        return;
      }
      const fundKey = name.toLowerCase();
      if (existingFundNames.has(fundKey)) {
        return;
      }
      newFundRowCounts.set(fundKey, (newFundRowCounts.get(fundKey) ?? 0) + 1);
      if (!newFundNames.has(fundKey)) {
        newFundNames.set(fundKey, name);
      }
    });

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
        counterpartAmount,
        counterpartCurrencyCode,
        notes: notes.length ? notes : null,
      },
      categoryName,
      fundName,
      counterpartFundName,
      fxRateSource,
      counterpartAmountSource,
    });
  });

  const categorySuggestions: CategorySuggestion[] = [];
  newCategoryNames.forEach(name => {
    const match = findNearDuplicateCategory(name, ctx.existingCategories);
    if (match) {
      categorySuggestions.push({
        sourceName: name,
        existingName: match.name,
        existingId: match.id,
        rowCount: newCategoryRowCounts.get(name.toLowerCase()) ?? 0,
      });
    }
  });

  const categoryTypeWidenings: CategoryTypeWidening[] = [];
  ctx.existingCategories.forEach(category => {
    const directions = categoryDirections.get(category.name.toLowerCase());
    if (directions && categoryNeedsWidening(category.type, directions)) {
      categoryTypeWidenings.push({ name: category.name, from: category.type });
    }
  });

  return {
    valid,
    invalid,
    needsFxRate,
    unreadableTimes,
    fxReview: [...fxReview.values()],
    suspectDerivedRates: [...suspectDerived.values()],
    transferConversions: [...transferConversions.values()],
    currencyReview: [...currencyReview.values()],
    duplicates,
    newCategoryNames: [...newCategoryNames],
    newFundNames: [...newFundNames.entries()].map(([key, sourceName]) => ({
      sourceName,
      rowCount: newFundRowCounts.get(key) ?? 0,
    })),
    unmappedColumns,
    mixedCurrencyWithoutBase: !baseCurrency && validCurrencies.size > 1,
    categorySuggestions,
    categoryTypeWidenings,
    totalRows: rows.length,
    defaultFundId: ctx.defaultFundId,
    inferredDateOrder,
    signConventionBypassed: !fileHasAnyNegativeAmount,
  };
};

type SeedCandidate = {
  record: Pick<
    NewTransactionRecord,
    | 'type'
    | 'baseCurrencyCode'
    | 'currencyCode'
    | 'fxRateToBase'
    | 'baseAmount'
    | 'counterpartAmount'
    | 'counterpartCurrencyCode'
  >;
  fxRateSource: FxRateSource;
  counterpartAmountSource: CounterpartAmountSource | null;
};

/**
 * How far a rate's origin is from the user's own judgement, highest first. A
 * pair carried by more than one row is saved at its best-evidenced rate rather
 * than at whichever row came first, so a rate confirmed during review is never
 * displaced by one a saved rate stood in for.
 */
const RATE_RANK: Record<FxRateSource, number> = {
  manual: 3,
  column: 2,
  cached: 1,
  derived: 0,
  parity: 0,
};

/**
 * The rates an import saves as current, one per pair. A derived rate
 * reconstructs what the source recorded at the time of the transaction, so it
 * is history rather than a rate to reuse; a row whose currency already matches
 * its base carries no conversion to save.
 *
 * A cross-currency transfer also carries what the destination currency was
 * worth, but only where the user confirmed that rate during review: a received
 * amount the file supplied is history for the same reason a derived rate is,
 * and one a saved rate produced is already held.
 *
 * Shared by the commit and the disclosure that precedes it, so what a user is
 * told will be saved is what gets saved.
 */
export const ratesToSeed = (items: readonly SeedCandidate[]): SeededRate[] => {
  const seeded = new Map<string, { rate: SeededRate; rank: number }>();
  const offer = (rate: SeededRate, rank: number) => {
    const key = fxPairKey(rate.baseCurrencyCode, rate.currencyCode);
    const held = seeded.get(key);
    if (!held || rank > held.rank) {
      seeded.set(key, { rate, rank });
    }
  };

  items.forEach(({ record, fxRateSource, counterpartAmountSource }) => {
    const { baseCurrencyCode, currencyCode, fxRateToBase } = record;
    if (!baseCurrencyCode) {
      return;
    }

    if (fxRateSource !== 'derived' && baseCurrencyCode !== currencyCode) {
      offer(
        { baseCurrencyCode, currencyCode, fxRateToBase },
        RATE_RANK[fxRateSource],
      );
    }

    if (record.type !== 'transfer' || counterpartAmountSource !== 'manual') {
      return;
    }
    const counterpartRate = deriveCounterpartRate(record);
    if (counterpartRate == null || record.counterpartCurrencyCode == null) {
      return;
    }
    offer(
      {
        baseCurrencyCode,
        currencyCode: record.counterpartCurrencyCode,
        fxRateToBase: counterpartRate,
      },
      RATE_RANK.manual,
    );
  });

  return [...seeded.values()].map(entry => entry.rate);
};

/**
 * Write phase: inside a single transaction, drop skipped rows, resolve and where
 * necessary widen categories, bulk-insert, and seed the FX-rate cache — all
 * atomic, so a failure rolls the whole import back.
 *
 * The steps run in that order by necessity: categories are resolved from the
 * rows that survive skipping and aliasing, so a name carried only by a dropped
 * row is never created, and the cache is seeded only from what was written.
 *
 * `acceptedRates` (keyed by `fxPairKey`) overrides the rate for rows that did
 * not get one from the file, recomputing the base amount to match; see
 * `FxRateSource` for which rows are overridable and `ratesToSeed` for which
 * reach the cache. What reached it is reported on the summary.
 */
export const commitImport = async (
  preview: ImportPreview,
  acceptedRates: Record<string, number> = {},
  options: CommitImportOptions = {},
): Promise<ImportSummary> =>
  withDatabase(db =>
    withTransaction(db, async () => {
      const skippedLines = options.skipDuplicates
        ? new Set(preview.duplicates.map(duplicate => duplicate.line))
        : new Set<number>();
      const items = preview.valid.filter(item => !skippedLines.has(item.line));

      const aliases = options.categoryAliases ?? {};
      const resolveName = (name: string): string =>
        aliases[name.toLowerCase()] ?? name;

      const directions = new Map<string, Set<TransactionDirection>>();
      items.forEach(item => {
        if (!item.categoryName || item.record.type === 'transfer') {
          return;
        }
        const key = resolveName(item.categoryName).toLowerCase();
        const used = directions.get(key) ?? new Set<TransactionDirection>();
        used.add(item.record.type);
        directions.set(key, used);
      });

      const distinctNames = [
        ...new Set(
          items
            .map(item => item.categoryName)
            .filter((name): name is string => Boolean(name))
            .map(resolveName),
        ),
      ];

      const fundAliases = options.fundAliases ?? {};
      const allowedNewFunds = new Set(
        (options.createFunds ?? []).map(name => name.toLowerCase()),
      );
      const defaultFundId = preview.defaultFundId;
      let createdFunds = 0;

      // Resolves an incoming fund name to an id, creating one only when the
      // review step said to. Anything else falls back to the default fund
      // rather than bringing a money-bearing record into existence unasked.
      const fundIdCache = new Map<string, number>();
      const resolveFundId = async (name: string | null): Promise<number> => {
        if (!name) {
          return defaultFundId;
        }
        const key = name.toLowerCase();
        const cached = fundIdCache.get(key);
        if (cached !== undefined) {
          return cached;
        }
        const aliased = fundAliases[key] ?? name;
        const existing = await getFundByName(db, aliased);
        if (existing) {
          fundIdCache.set(key, existing.id);
          return existing.id;
        }
        if (!allowedNewFunds.has(key)) {
          fundIdCache.set(key, defaultFundId);
          return defaultFundId;
        }
        const created = await createFund(db, {
          name,
          currencyCode: null,
          openingBalance: 0,
          notes: null,
        });
        createdFunds += 1;
        fundIdCache.set(key, created.id);
        return created.id;
      };

      const nameToId = new Map<string, number>();
      let createdCategories = 0;
      for (const name of distinctNames) {
        const key = name.toLowerCase();
        const existing = await getCategoryByName(db, name);
        if (existing) {
          nameToId.set(key, existing.id);
          const used = directions.get(key);
          if (used && categoryNeedsWidening(existing.type, used)) {
            await updateCategory(db, {
              id: existing.id,
              name: existing.name,
              type: 'both',
            });
          }
        } else {
          const created = await createCategory(db, { name, type: 'both' });
          nameToId.set(key, created.id);
          createdCategories += 1;
        }
      }

      const fundIds = new Map<
        number,
        { fundId: number; counterpart: number | null }
      >();
      for (const item of items) {
        fundIds.set(item.line, {
          fundId: await resolveFundId(item.fundName),
          counterpart:
            item.record.type === 'transfer'
              ? await resolveFundId(item.counterpartFundName)
              : null,
        });
      }

      const prepared = items.map(item => {
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
        const categoryName = item.categoryName
          ? resolveName(item.categoryName)
          : null;
        const resolvedFunds = fundIds.get(item.line);
        const record: NewTransactionRecord = {
          ...item.record,
          fxRateToBase,
          baseAmount,
          categoryId: categoryName
            ? (nameToId.get(categoryName.toLowerCase()) ?? null)
            : null,
          fundId: resolvedFunds?.fundId ?? defaultFundId,
          counterpartFundId: resolvedFunds?.counterpart ?? null,
          // Arriving unconfirmed is a property of having been imported, not of
          // anything the file said: no column supplies this.
          isConfirmed: false,
        };
        return {
          record,
          fxRateSource: item.fxRateSource,
          counterpartAmountSource: item.counterpartAmountSource,
        };
      });

      const records = prepared.map(entry => entry.record);
      await createTransactionsBulk(db, records);
      const insertedIncome = records.filter(
        record => record.type === 'income',
      ).length;
      const insertedTransfers = records.filter(
        record => record.type === 'transfer',
      ).length;

      const seededRates = ratesToSeed(prepared);
      for (const rate of seededRates) {
        await upsertCurrencyFxRate(
          db,
          rate.baseCurrencyCode,
          rate.currencyCode,
          rate.fxRateToBase,
        );
      }

      return {
        insertedExpenses: records.length - insertedIncome - insertedTransfers,
        insertedIncome,
        insertedTransfers,
        skippedInvalid: preview.invalid.length,
        skippedNeedsFxRate: preview.needsFxRate.length,
        skippedDuplicates: preview.valid.length - items.length,
        createdCategories,
        createdFunds,
        seededRates,
      };
    }),
  );
