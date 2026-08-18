import {
  applyMapping,
  autoDetectMapping,
  extractTimeFromDate,
  inferDateOrder,
  missingRequiredFields,
  normalizeDate,
  normalizeTime,
  resolveTransactionType,
} from '../mapping';
import { TRANSACTION_CSV_COLUMNS } from '../../export/csvColumns';

describe('autoDetectMapping', () => {
  it('maps the app export header to target fields', () => {
    const mapping = autoDetectMapping(
      TRANSACTION_CSV_COLUMNS as unknown as string[],
    );
    expect(mapping.amountNative).toBe(2);
    expect(mapping.currencyCode).toBe(3);
    expect(mapping.date).toBe(6);
    expect(mapping.categoryName).toBe(7);
    expect(mapping.payee).toBe(10);
  });

  it('is case- and whitespace-insensitive', () => {
    const mapping = autoDetectMapping([
      ' Amount_Native ',
      'CURRENCY_CODE',
      'Date',
    ]);
    expect(mapping.amountNative).toBe(0);
    expect(mapping.currencyCode).toBe(1);
    expect(mapping.date).toBe(2);
  });

  it('leaves unknown columns unmapped', () => {
    const mapping = autoDetectMapping(['foo', 'bar']);
    expect(mapping).toEqual({});
  });

  it('maps common headers used by other apps', () => {
    const mapping = autoDetectMapping([
      'Transaction Date',
      'Merchant',
      'Amount',
      'Currency',
      'Memo',
    ]);
    expect(mapping.date).toBe(0);
    expect(mapping.payee).toBe(1);
    expect(mapping.amountNative).toBe(2);
    expect(mapping.currencyCode).toBe(3);
    expect(mapping.description).toBe(4);
  });

  it('prefers the app export column over a synonym for the same field', () => {
    const mapping = autoDetectMapping(['Amount', 'amount_native']);
    expect(mapping.amountNative).toBe(1);
  });

  it('never maps two fields onto the same column', () => {
    const mapping = autoDetectMapping(['Amount']);
    expect(mapping.amountNative).toBe(0);
    expect(Object.values(mapping)).toEqual([0]);
  });

  it('maps slashed transaction-type headers', () => {
    expect(autoDetectMapping(['Income/Expense']).transactionType).toBe(0);
    expect(autoDetectMapping(['Debit/Credit']).transactionType).toBe(0);
    expect(autoDetectMapping(['Dr/Cr']).transactionType).toBe(0);
    expect(autoDetectMapping(['Type']).transactionType).toBe(0);
    expect(autoDetectMapping(['Transaction Type']).transactionType).toBe(0);
  });

  it('maps a third-party header carrying repeated column names', () => {
    const mapping = autoDetectMapping([
      'Date',
      'Account',
      'Category',
      'Subcategory',
      'Note',
      'INR',
      'Income/Expense',
      'Note',
      'Amount',
      'Currency',
      'Account',
    ]);
    expect(mapping.date).toBe(0);
    expect(mapping.categoryName).toBe(2);
    expect(mapping.description).toBe(4);
    expect(mapping.transactionType).toBe(6);
    expect(mapping.amountNative).toBe(8);
    expect(mapping.currencyCode).toBe(9);
  });

  describe('note columns', () => {
    it('leaves notes unmapped when the only note column becomes description', () => {
      const mapping = autoDetectMapping(['Date', 'Amount', 'Note']);
      expect(mapping.description).toBe(2);
      expect(mapping.notes).toBeUndefined();
    });

    it('keeps a note column as notes when a description column exists', () => {
      const mapping = autoDetectMapping(['Description', 'Amount', 'Note']);
      expect(mapping.description).toBe(0);
      expect(mapping.notes).toBe(2);
    });

    it('keeps the app export mapping intact', () => {
      const mapping = autoDetectMapping(
        TRANSACTION_CSV_COLUMNS as unknown as string[],
      );
      const description = TRANSACTION_CSV_COLUMNS.indexOf('description');
      const notes = TRANSACTION_CSV_COLUMNS.indexOf('notes');
      expect(mapping.description).toBe(description);
      expect(mapping.notes).toBe(notes);
    });

    it('gives description the populated column when names tie', () => {
      const header = ['Date', 'Amount', 'Note', 'Note'];
      const rows = [
        { line: 2, cells: ['2024-01-01', '10', '', 'Brownie'] },
        { line: 3, cells: ['2024-01-02', '20', '', 'Metro'] },
      ];
      const mapping = autoDetectMapping(header, rows);
      expect(mapping.description).toBe(3);
      expect(mapping.notes).toBe(2);
    });

    it('falls back to the first candidate when no rows are supplied', () => {
      const mapping = autoDetectMapping(['Date', 'Amount', 'Note', 'Note']);
      expect(mapping.description).toBe(2);
    });
  });
});

describe('missingRequiredFields', () => {
  it('reports required fields that are unmapped', () => {
    expect(missingRequiredFields({ amountNative: 0 })).toEqual([
      'currencyCode',
      'date',
    ]);
  });

  it('returns empty when all required fields are mapped', () => {
    expect(
      missingRequiredFields({ amountNative: 0, currencyCode: 1, date: 2 }),
    ).toEqual([]);
  });

  it('drops the currency requirement when a default currency is supplied', () => {
    expect(
      missingRequiredFields(
        { amountNative: 0, date: 1 },
        { hasDefaultCurrency: true },
      ),
    ).toEqual([]);
  });

  it('still requires amount and date with a default currency', () => {
    expect(missingRequiredFields({}, { hasDefaultCurrency: true })).toEqual([
      'amountNative',
      'date',
    ]);
  });
});

describe('applyMapping', () => {
  it('pulls mapped columns into a candidate', () => {
    const candidate = applyMapping(['2024-01-01', '10.00', 'USD'], {
      date: 0,
      amountNative: 1,
      currencyCode: 2,
    });
    expect(candidate).toEqual({
      date: '2024-01-01',
      amountNative: '10.00',
      currencyCode: 'USD',
    });
  });

  it('substitutes empty string for out-of-range columns', () => {
    const candidate = applyMapping(['x'], { amountNative: 5 });
    expect(candidate.amountNative).toBe('');
  });
});

describe('normalizeDate', () => {
  it('passes through ISO dates', () => {
    expect(normalizeDate('2024-03-04', 'iso')).toBe('2024-03-04');
  });

  it('rejects non-ISO input in iso mode', () => {
    expect(normalizeDate('04/03/2024', 'iso')).toBeNull();
  });

  it('interprets dmy as day-first', () => {
    expect(normalizeDate('04/03/2024', 'dmy')).toBe('2024-03-04');
  });

  it('interprets mdy as month-first', () => {
    expect(normalizeDate('04/03/2024', 'mdy')).toBe('2024-04-03');
  });

  it('accepts dash and dot separators', () => {
    expect(normalizeDate('4-3-2024', 'dmy')).toBe('2024-03-04');
    expect(normalizeDate('4.3.2024', 'dmy')).toBe('2024-03-04');
  });

  it('rejects impossible months and days', () => {
    expect(normalizeDate('13/01/2024', 'mdy')).toBeNull();
    expect(normalizeDate('01/32/2024', 'mdy')).toBeNull();
  });

  it('rejects unparseable values', () => {
    expect(normalizeDate('not-a-date', 'dmy')).toBeNull();
  });

  it('accepts an ISO date carrying a time part', () => {
    expect(normalizeDate('2024-03-04T10:15:00Z', 'iso')).toBe('2024-03-04');
  });

  it('reads month names in either order', () => {
    expect(normalizeDate('Jan 5, 2024', 'dmy')).toBe('2024-01-05');
    expect(normalizeDate('5 January 2024', 'dmy')).toBe('2024-01-05');
  });

  it('expands two-digit years around the century pivot', () => {
    expect(normalizeDate('04/03/24', 'dmy')).toBe('2024-03-04');
    expect(normalizeDate('04/03/98', 'dmy')).toBe('1998-03-04');
  });

  describe('auto', () => {
    it('resolves ISO without a format hint', () => {
      expect(normalizeDate('2024-03-04', 'auto')).toBe('2024-03-04');
    });

    it('resolves a numeric date when the day exceeds 12', () => {
      expect(normalizeDate('25/03/2024', 'auto')).toBe('2024-03-25');
      expect(normalizeDate('03/25/2024', 'auto')).toBe('2024-03-25');
    });

    it('defers an ambiguous numeric date to an explicit format', () => {
      expect(normalizeDate('01/02/2024', 'auto')).toBeNull();
      expect(normalizeDate('01/02/2024', 'dmy')).toBe('2024-02-01');
    });
  });

  describe('trailing time', () => {
    it('accepts a numeric date carrying a clock time', () => {
      expect(normalizeDate('3/2/2022 10:11', 'mdy')).toBe('2022-03-02');
      expect(normalizeDate('3/2/2022 10:11', 'dmy')).toBe('2022-02-03');
      expect(normalizeDate('3/2/2022 9:05', 'mdy')).toBe('2022-03-02');
    });

    it('accepts seconds, fractional seconds, meridiem and zone offsets', () => {
      expect(normalizeDate('3/2/2022 10:11:30', 'mdy')).toBe('2022-03-02');
      expect(normalizeDate('3/2/2022 10:11:30.500', 'mdy')).toBe('2022-03-02');
      expect(normalizeDate('3/2/2022 10:11 PM', 'mdy')).toBe('2022-03-02');
      expect(normalizeDate('3/2/2022 10:11pm', 'mdy')).toBe('2022-03-02');
      expect(normalizeDate('3/2/2022 10:11Z', 'mdy')).toBe('2022-03-02');
      expect(normalizeDate('3/2/2022 10:11+05:30', 'mdy')).toBe('2022-03-02');
      expect(normalizeDate('3/2/2022T10:11', 'mdy')).toBe('2022-03-02');
    });

    it('accepts a time on month-name dates', () => {
      expect(normalizeDate('Jan 5, 2024 10:11', 'dmy')).toBe('2024-01-05');
      expect(normalizeDate('5 January 2024 10:11', 'dmy')).toBe('2024-01-05');
    });

    it('rejects trailing text that is not a time', () => {
      expect(normalizeDate('3/2/2022 garbage', 'mdy')).toBeNull();
      expect(normalizeDate('3/2/2022 10', 'mdy')).toBeNull();
      expect(normalizeDate('3/2/2022 10:1', 'mdy')).toBeNull();
      expect(normalizeDate('3/2/2022 10:11 extra', 'mdy')).toBeNull();
    });

    it('still resolves an unambiguous timed date under auto', () => {
      expect(normalizeDate('25/03/2024 10:11', 'auto')).toBe('2024-03-25');
    });
  });
});

describe('inferDateOrder', () => {
  it('infers month-first when a second component exceeds 12', () => {
    expect(inferDateOrder(['3/2/2022 10:11', '1/25/2022 9:00'])).toBe('mdy');
  });

  it('infers day-first when a first component exceeds 12', () => {
    expect(inferDateOrder(['3/2/2022 10:11', '25/1/2022 9:00'])).toBe('dmy');
  });

  it('returns null when every value is ambiguous', () => {
    expect(inferDateOrder(['3/2/2022', '1/2/2022', '12/11/2022'])).toBeNull();
  });

  it('returns null when rows prove opposite orders', () => {
    expect(inferDateOrder(['13/01/2022', '01/13/2022'])).toBeNull();
  });

  it('ignores values carrying no ordering evidence', () => {
    expect(inferDateOrder(['2024-03-04', 'Jan 5, 2024', '', 'nonsense'])).toBe(
      null,
    );
    expect(inferDateOrder(['2024-03-04', '1/25/2022'])).toBe('mdy');
  });

  it('reads an order out of a column of timed dates', () => {
    const column = ['3/2/2022 10:11', '3/1/2022 19:50', '3/31/2022 18:56'];
    expect(inferDateOrder(column)).toBe('mdy');
  });
});

describe('resolveTransactionType', () => {
  it('reads both directions case- and space-insensitively', () => {
    expect(resolveTransactionType('Expense')).toBe('expense');
    expect(resolveTransactionType(' income ')).toBe('income');
    expect(resolveTransactionType('DEBIT')).toBe('expense');
    expect(resolveTransactionType('Credit')).toBe('income');
    expect(resolveTransactionType('cr')).toBe('income');
    expect(resolveTransactionType('dr')).toBe('expense');
  });

  it('returns null for empty or unknown values so the sign can decide', () => {
    expect(resolveTransactionType('')).toBeNull();
    expect(resolveTransactionType('   ')).toBeNull();
    expect(resolveTransactionType('nonsense')).toBeNull();
  });
});

describe('extractTimeFromDate', () => {
  it('reads the time riding along in a date value', () => {
    expect(extractTimeFromDate('2024-03-02 10:11')).toBe('10:11');
    expect(extractTimeFromDate('2024-03-02T10:11')).toBe('10:11');
    expect(extractTimeFromDate('3/2/2022 10:11')).toBe('10:11');
    expect(extractTimeFromDate('Jan 5, 2024 09:05')).toBe('09:05');
    expect(extractTimeFromDate('5 January 2024 09:05')).toBe('09:05');
  });

  it('truncates seconds to the minute a record stores', () => {
    expect(extractTimeFromDate('2024-03-02 10:11:30')).toBe('10:11');
    expect(extractTimeFromDate('2024-03-02 10:11:30.500')).toBe('10:11');
  });

  it('converts a 12-hour suffix to 24-hour', () => {
    expect(extractTimeFromDate('3/2/2022 10:11 PM')).toBe('22:11');
    expect(extractTimeFromDate('3/2/2022 10:11pm')).toBe('22:11');
    expect(extractTimeFromDate('3/2/2022 12:30am')).toBe('00:30');
    expect(extractTimeFromDate('3/2/2022 12:30pm')).toBe('12:30');
  });

  it('keeps the wall-clock reading when the source states an offset', () => {
    expect(extractTimeFromDate('2024-03-02 10:11Z')).toBe('10:11');
    expect(extractTimeFromDate('2024-03-02 10:11+05:30')).toBe('10:11');
  });

  it('returns null when the value carries no time', () => {
    expect(extractTimeFromDate('2024-03-02')).toBeNull();
    expect(extractTimeFromDate('3/2/2022')).toBeNull();
    expect(extractTimeFromDate('')).toBeNull();
  });
});

describe('normalizeTime', () => {
  it('normalises a dedicated time column', () => {
    expect(normalizeTime('14:30')).toBe('14:30');
    expect(normalizeTime('9:05')).toBe('09:05');
    expect(normalizeTime('14:30:59')).toBe('14:30');
    expect(normalizeTime('2:30 PM')).toBe('14:30');
    expect(normalizeTime('  14:30  ')).toBe('14:30');
  });

  it('returns null for values that do not name a time', () => {
    expect(normalizeTime('25:00')).toBeNull();
    expect(normalizeTime('12:60')).toBeNull();
    expect(normalizeTime('lunch')).toBeNull();
    expect(normalizeTime('')).toBeNull();
  });

  it('does not read bare digits as a time', () => {
    expect(normalizeTime('1430')).toBeNull();
    expect(normalizeTime('1200')).toBeNull();
  });

  it('rejects a 12-hour value whose hour cannot be one', () => {
    expect(normalizeTime('13:00 PM')).toBeNull();
    expect(normalizeTime('0:30 am')).toBeNull();
  });
});

describe('time column mapping', () => {
  it('auto-maps the time column this app exports', () => {
    const mapping = autoDetectMapping([...TRANSACTION_CSV_COLUMNS]);
    expect(mapping.time).toBe(TRANSACTION_CSV_COLUMNS.indexOf('time'));
  });

  it('maps every exported column, so a backup round-trips', () => {
    const mapping = autoDetectMapping([...TRANSACTION_CSV_COLUMNS]);
    expect(mapping.date).toBe(TRANSACTION_CSV_COLUMNS.indexOf('date'));
    expect(mapping.time).toBe(TRANSACTION_CSV_COLUMNS.indexOf('time'));
    expect(mapping.amountNative).toBe(
      TRANSACTION_CSV_COLUMNS.indexOf('amount_native'),
    );
  });

  it('recognises common time header names', () => {
    expect(autoDetectMapping(['Time of day']).time).toBe(0);
    expect(autoDetectMapping(['Transaction Time']).time).toBe(0);
    expect(autoDetectMapping(['entry_time']).time).toBe(0);
  });

  it('keeps a datetime column on the date field, which also yields its time', () => {
    const mapping = autoDetectMapping(['datetime', 'amount']);
    expect(mapping.date).toBe(0);
    expect(mapping.time).toBeUndefined();
    expect(extractTimeFromDate('2024-03-02 10:11')).toBe('10:11');
  });
});

describe('fund columns and transfer vocabulary', () => {
  it('reads the words other tools use for a transfer', () => {
    expect(resolveTransactionType('Transfer')).toBe('transfer');
    expect(resolveTransactionType('xfer')).toBe('transfer');
    expect(resolveTransactionType(' MOVE ')).toBe('transfer');
  });

  it('auto-maps the app’s own fund columns from a backup header', () => {
    const mapping = autoDetectMapping([
      'date',
      'amount_native',
      'currency_code',
      'fund',
      'counterpart_fund',
      'counterpart_amount',
    ]);

    expect(mapping.fundName).toBe(3);
    expect(mapping.counterpartFundName).toBe(4);
    expect(mapping.counterpartAmount).toBe(5);
  });

  it('accepts the words other tools use for a fund column', () => {
    ['Account', 'Account Name', 'Pot', 'Envelope', 'Wallet'].forEach(header => {
      const mapping = autoDetectMapping(['date', 'amount', 'currency', header]);
      expect(mapping.fundName).toBe(3);
    });
  });

  it('maps a destination column separately from the source', () => {
    const mapping = autoDetectMapping([
      'date',
      'amount',
      'currency',
      'From Account',
      'To Account',
    ]);

    expect(mapping.fundName).toBe(3);
    expect(mapping.counterpartFundName).toBe(4);
  });
});
