import type { CsvDelimiter, ParsedCsv } from './types';

const BOM_CODE = 0xfeff;
const NUL = '\u0000';
const REPLACEMENT_CHAR = '\uFFFD';
const UTF16_NUL_RATIO = 0.2;

type RawRecord = { line: number; cells: string[] };

export const CSV_DELIMITERS: readonly CsvDelimiter[] = [',', ';', '\t'];

/**
 * Used when sniffing finds no delimiter or cannot separate two candidates.
 * Also the delimiter `buildExpensesCsv` writes, so app backups always round-trip.
 */
export const DEFAULT_DELIMITER: CsvDelimiter = ',';

const stripBom = (text: string): string =>
  text.charCodeAt(0) === BOM_CODE ? text.slice(1) : text;

/**
 * A UTF-16 file read as UTF-8 arrives as its ASCII-range characters interleaved
 * with NUL, preceded by replacement characters where the byte-order mark was.
 * A well-formed UTF-8 document never contains NUL, so a high NUL ratio is a
 * reliable signal.
 */
const looksLikeUtf16 = (text: string): boolean => {
  const firstNul = text.indexOf(NUL);
  if (firstNul === -1 || text.length === 0) {
    return false;
  }
  let nulCount = 0;
  for (let i = firstNul; i < text.length; i += 1) {
    if (text[i] === NUL) {
      nulCount += 1;
    }
  }
  return nulCount / text.length > UTF16_NUL_RATIO;
};

/**
 * Recover the ASCII range of a UTF-16 document that was decoded as UTF-8.
 * Characters above U+007F were already lost to replacement characters during
 * that decode and cannot be restored here — such files must be re-saved as
 * UTF-8 at the source.
 */
const recoverUtf16 = (text: string): string =>
  text.split(NUL).join('').split(REPLACEMENT_CHAR).join('');

const decode = (input: string): string => {
  const text = stripBom(input);
  return looksLikeUtf16(text) ? stripBom(recoverUtf16(text)) : text;
};

/**
 * Count delimiter candidates across the header record, ignoring anything inside
 * quotes so that a quoted `a;b` never outvotes the real separator. Returns the
 * sole highest scorer, or the default when nothing scored or two candidates tie.
 */
export const detectDelimiter = (input: string): CsvDelimiter => {
  const text = decode(input);
  const counts = new Map<CsvDelimiter, number>(
    CSV_DELIMITERS.map(delimiter => [delimiter, 0]),
  );

  let inQuotes = false;
  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];

    if (char === '"') {
      if (inQuotes && text[i + 1] === '"') {
        i += 1;
      } else {
        inQuotes = !inQuotes;
      }
      continue;
    }
    if (inQuotes) {
      continue;
    }
    if (char === '\r' || char === '\n') {
      break;
    }

    const count = counts.get(char as CsvDelimiter);
    if (count !== undefined) {
      counts.set(char as CsvDelimiter, count + 1);
    }
  }

  let best: CsvDelimiter = DEFAULT_DELIMITER;
  let bestCount = 0;
  let tied = false;
  counts.forEach((count, delimiter) => {
    if (count > bestCount) {
      best = delimiter;
      bestCount = count;
      tied = false;
    } else if (count === bestCount && count > 0) {
      tied = true;
    }
  });

  return bestCount === 0 || tied ? DEFAULT_DELIMITER : best;
};

/**
 * Parse CSV text into a header row plus data rows, faithfully inverting the
 * output of `buildExpensesCsv`. Implements RFC 4180 quoting: double-quoted
 * fields may contain the delimiter, escaped quotes (`""`), and embedded
 * newlines. A leading UTF-8 BOM is stripped, UTF-16 text decoded as UTF-8 is
 * recovered where possible, and both CRLF and LF line endings are accepted.
 * The delimiter is sniffed unless one is supplied.
 * Each row carries the 1-based line where its record began, for error reporting.
 */
export const parseCsv = (
  input: string,
  options: { delimiter?: CsvDelimiter } = {},
): ParsedCsv => {
  const text = decode(input);
  const delimiter = options.delimiter ?? detectDelimiter(text);

  const records: RawRecord[] = [];
  let cells: string[] = [];
  let field = '';
  let inQuotes = false;
  let line = 1;
  let recordLine = 1;
  let sawContent = false;

  const endField = (): void => {
    cells.push(field);
    field = '';
  };

  const endRecord = (): void => {
    endField();
    const isBlankLine = cells.length === 1 && cells[0] === '';
    if (!isBlankLine) {
      records.push({ line: recordLine, cells });
    }
    cells = [];
    sawContent = false;
  };

  for (let i = 0; i < text.length; i += 1) {
    const char = text[i];

    if (!sawContent && !inQuotes) {
      recordLine = line;
    }

    if (inQuotes) {
      if (char === '"') {
        if (text[i + 1] === '"') {
          field += '"';
          i += 1;
        } else {
          inQuotes = false;
        }
      } else {
        field += char;
        if (char === '\n') {
          line += 1;
        }
      }
      sawContent = true;
      continue;
    }

    if (char === '"') {
      inQuotes = true;
      sawContent = true;
      continue;
    }
    if (char === delimiter) {
      endField();
      sawContent = true;
      continue;
    }
    if (char === '\r') {
      if (text[i + 1] === '\n') {
        i += 1;
      }
      endRecord();
      line += 1;
      continue;
    }
    if (char === '\n') {
      endRecord();
      line += 1;
      continue;
    }

    field += char;
    sawContent = true;
  }

  if (sawContent || field !== '' || cells.length > 0) {
    endRecord();
  }

  const [header, ...rows] = records;
  return {
    header: header ? header.cells : [],
    delimiter,
    rows: rows.map(record => ({ line: record.line, cells: record.cells })),
  };
};
