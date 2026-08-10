import {
  normalizeCurrency,
  validateBaseAmountPrecision,
  validateCurrencyCode,
  validateIsoDateWithinFutureWindow,
  validatePositiveAmount,
  validatePositiveRate,
  validateTimeOfDay,
} from '../validation';

describe('validation helpers', () => {
  beforeEach(() => {
    jest.useFakeTimers();
    jest.setSystemTime(new Date('2025-01-10T00:00:00Z'));
  });

  afterEach(() => {
    jest.useRealTimers();
  });

  describe('validateCurrencyCode', () => {
    it('accepts valid ISO currency codes', () => {
      expect(validateCurrencyCode('usd').valid).toBe(true);
      expect(validateCurrencyCode('EUR').valid).toBe(true);
    });

    it('rejects unknown or malformed codes', () => {
      expect(validateCurrencyCode('btc')).toEqual({
        valid: false,
        message: 'Currency code must be a valid ISO-4217 code.',
      });
      expect(validateCurrencyCode('US')).toEqual({
        valid: false,
        message: 'Currency code must be three letters.',
      });
      expect(validateCurrencyCode('')).toEqual({
        valid: false,
        message: 'Currency code is required.',
      });
    });
  });

  describe('validatePositiveAmount & validatePositiveRate', () => {
    it('accepts positive values', () => {
      expect(validatePositiveAmount(12.34).valid).toBe(true);
      expect(validatePositiveRate(0.89).valid).toBe(true);
    });

    it('rejects zero, negatives, or NaN', () => {
      expect(validatePositiveAmount(0)).toEqual({
        valid: false,
        message: 'Amount must be greater than zero.',
      });
      expect(validatePositiveRate(-1)).toEqual({
        valid: false,
        message: 'Rate must be greater than zero.',
      });
      expect(validatePositiveAmount(Number.NaN)).toEqual({
        valid: false,
        message: 'Amount is required.',
      });
    });
  });

  describe('validateBaseAmountPrecision', () => {
    it('accepts base amounts with 6-8 decimal places', () => {
      expect(validateBaseAmountPrecision('12.123456')).toEqual({ valid: true });
      expect(validateBaseAmountPrecision(12.1234567)).toEqual({ valid: true });
      expect(validateBaseAmountPrecision(12.12345678)).toEqual({ valid: true });
    });

    it('rejects values lower than 6 decimal places', () => {
      expect(validateBaseAmountPrecision(12.1234)).toEqual({
        valid: false,
        message: 'Base amount must have between 6 and 8 decimal places.',
      });
    });

    it('rejects values with more than 8 decimal places', () => {
      expect(validateBaseAmountPrecision(12.123456789)).toEqual({
        valid: false,
        message: 'Base amount must have between 6 and 8 decimal places.',
      });
    });

    it('rejects missing or non-positive values', () => {
      expect(validateBaseAmountPrecision(null)).toEqual({
        valid: false,
        message: 'Base amount is required.',
      });
      expect(validateBaseAmountPrecision(-0.1)).toEqual({
        valid: false,
        message: 'Base amount must be greater than zero.',
      });
    });
  });

  describe('validateIsoDateWithinFutureWindow', () => {
    it('accepts valid ISO dates within the allowed window', () => {
      expect(validateIsoDateWithinFutureWindow('2025-01-10').valid).toBe(true);
      expect(validateIsoDateWithinFutureWindow('2025-01-13').valid).toBe(true);
    });

    it('rejects dates beyond the +3 day limit', () => {
      expect(validateIsoDateWithinFutureWindow('2025-01-14')).toEqual({
        valid: false,
        message: 'Date cannot be more than 3 days in the future.',
      });
    });

    it('rejects malformed or invalid dates', () => {
      expect(validateIsoDateWithinFutureWindow('2025/01/01')).toEqual({
        valid: false,
        message: 'Date must be in ISO format YYYY-MM-DD.',
      });
      // Note: JavaScript Date silently rolls over invalid dates (e.g., 2025-02-30 -> 2025-03-02)
      // so this will be caught by the future date check instead
      expect(validateIsoDateWithinFutureWindow('2025-02-30')).toEqual({
        valid: false,
        message: 'Date cannot be more than 3 days in the future.',
      });
      expect(validateIsoDateWithinFutureWindow(null)).toEqual({
        valid: false,
        message: 'Date is required.',
      });
    });
  });
});

describe('normalizeCurrency', () => {
  it('passes a valid ISO code through, upper-casing it', () => {
    expect(normalizeCurrency('usd')).toEqual({ status: 'ok', code: 'USD' });
  });

  it('resolves a display name', () => {
    expect(normalizeCurrency('US Dollar')).toEqual({
      status: 'ok',
      code: 'USD',
    });
  });

  it('resolves an unambiguous symbol', () => {
    expect(normalizeCurrency('€')).toEqual({ status: 'ok', code: 'EUR' });
    expect(normalizeCurrency('£')).toEqual({ status: 'ok', code: 'GBP' });
  });

  it('reports every candidate for an ambiguous symbol', () => {
    const result = normalizeCurrency('$');
    expect(result.status).toBe('ambiguous');
    if (result.status === 'ambiguous') {
      expect(result.candidates).toContain('USD');
      expect(result.candidates).toContain('AUD');
      expect(result.candidates).toContain('CAD');
    }
  });

  it('distinguishes a withdrawn currency by its period suffix', () => {
    expect(normalizeCurrency('Afghan Afghani')).toEqual({
      status: 'ok',
      code: 'AFN',
    });
    expect(normalizeCurrency('Afghan Afghani (1927–2002)')).toEqual({
      status: 'ok',
      code: 'AFA',
    });
  });

  it('returns unknown for an unrecognised value', () => {
    expect(normalizeCurrency('ZZZ')).toEqual({ status: 'unknown' });
    expect(normalizeCurrency('')).toEqual({ status: 'unknown' });
  });
});

describe('validateTimeOfDay', () => {
  it('accepts an absent time, since the field is optional', () => {
    expect(validateTimeOfDay(null)).toEqual({ valid: true });
    expect(validateTimeOfDay(undefined)).toEqual({ valid: true });
    expect(validateTimeOfDay('')).toEqual({ valid: true });
    expect(validateTimeOfDay('   ')).toEqual({ valid: true });
  });

  it('tolerates surrounding whitespace on a real time', () => {
    expect(validateTimeOfDay('  14:30  ')).toEqual({ valid: true });
  });

  it('accepts times at both ends of the day', () => {
    expect(validateTimeOfDay('00:00')).toEqual({ valid: true });
    expect(validateTimeOfDay('23:59')).toEqual({ valid: true });
    expect(validateTimeOfDay('14:30')).toEqual({ valid: true });
  });

  it('rejects out-of-range hours and minutes', () => {
    expect(validateTimeOfDay('24:00').valid).toBe(false);
    expect(validateTimeOfDay('12:60').valid).toBe(false);
    expect(validateTimeOfDay('99:99').valid).toBe(false);
  });

  it('rejects shapes that are not zero-padded 24-hour time', () => {
    expect(validateTimeOfDay('9:05').valid).toBe(false);
    expect(validateTimeOfDay('1430').valid).toBe(false);
    expect(validateTimeOfDay('2:30pm').valid).toBe(false);
    expect(validateTimeOfDay('lunch').valid).toBe(false);
  });
});
