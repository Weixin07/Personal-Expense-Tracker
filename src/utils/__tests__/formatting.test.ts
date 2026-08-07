import {
  formatMoneyAmount,
  formatFxRate,
  formatCurrencyAmount,
  formatDisplayMoney,
  formatDirectionalMoney,
  formatSignedMoney,
} from '../formatting';

describe('formatting utilities', () => {
  describe('formatMoneyAmount', () => {
    it('should format whole numbers with 2 decimal places', () => {
      expect(formatMoneyAmount(100)).toBe('100.00');
      expect(formatMoneyAmount(0)).toBe('0.00');
      expect(formatMoneyAmount(1)).toBe('1.00');
    });

    it('should format decimal numbers with 2 decimal places', () => {
      expect(formatMoneyAmount(123.456)).toBe('123.46');
      expect(formatMoneyAmount(99.994)).toBe('99.99');
      expect(formatMoneyAmount(99.995)).toBe('100.00');
      expect(formatMoneyAmount(0.1)).toBe('0.10');
      expect(formatMoneyAmount(0.01)).toBe('0.01');
    });

    it('should format negative numbers correctly', () => {
      expect(formatMoneyAmount(-50.25)).toBe('-50.25');
      expect(formatMoneyAmount(-0.01)).toBe('-0.01');
    });

    it('should handle very large numbers', () => {
      expect(formatMoneyAmount(999999.99)).toBe('999999.99');
      expect(formatMoneyAmount(1000000.0)).toBe('1000000.00');
    });

    it('should handle very small numbers', () => {
      expect(formatMoneyAmount(0.001)).toBe('0.00');
      expect(formatMoneyAmount(0.005)).toBe('0.01');
    });
  });

  describe('formatFxRate', () => {
    it('should format rates with 6 decimal places', () => {
      expect(formatFxRate(1)).toBe('1.000000');
      expect(formatFxRate(1.5)).toBe('1.500000');
      expect(formatFxRate(0.85)).toBe('0.850000');
    });

    it('should format precise FX rates correctly', () => {
      expect(formatFxRate(1.234567)).toBe('1.234567');
      expect(formatFxRate(0.123456)).toBe('0.123456');
      expect(formatFxRate(123.456789)).toBe('123.456789');
    });

    it('should round to 6 decimal places', () => {
      expect(formatFxRate(1.2345678)).toBe('1.234568');
      expect(formatFxRate(0.1234564)).toBe('0.123456');
      expect(formatFxRate(0.1234567)).toBe('0.123457');
    });

    it('should handle edge cases', () => {
      expect(formatFxRate(0)).toBe('0.000000');
      expect(formatFxRate(1000000)).toBe('1000000.000000');
      expect(formatFxRate(0.000001)).toBe('0.000001');
    });
  });

  describe('formatCurrencyAmount', () => {
    it('should format amount with currency code', () => {
      expect(formatCurrencyAmount(123.45, 'USD')).toBe('123.45 USD');
      expect(formatCurrencyAmount(99.99, 'GBP')).toBe('99.99 GBP');
      expect(formatCurrencyAmount(0.01, 'EUR')).toBe('0.01 EUR');
    });

    it('should handle null currency code with no fallback', () => {
      expect(formatCurrencyAmount(123.45, null)).toBe('123.45');
      expect(formatCurrencyAmount(0, null)).toBe('0.00');
    });

    it('should handle null currency code with fallback', () => {
      expect(formatCurrencyAmount(123.45, null, 'XXX')).toBe('123.45 XXX');
      expect(formatCurrencyAmount(0, null, 'UNKNOWN')).toBe('0.00 UNKNOWN');
    });

    it('should format amount with 2 decimal places', () => {
      expect(formatCurrencyAmount(100, 'USD')).toBe('100.00 USD');
      expect(formatCurrencyAmount(123.456, 'GBP')).toBe('123.46 GBP');
    });

    it('should handle negative amounts', () => {
      expect(formatCurrencyAmount(-50.25, 'EUR')).toBe('-50.25 EUR');
    });

    it('should handle empty string fallback', () => {
      expect(formatCurrencyAmount(123.45, null, '')).toBe('123.45');
    });

    it('should prioritize currency code over fallback', () => {
      expect(formatCurrencyAmount(123.45, 'USD', 'FALLBACK')).toBe(
        '123.45 USD',
      );
    });
  });

  describe('formatDisplayMoney', () => {
    it('groups thousands only once the integer part needs it', () => {
      expect(formatDisplayMoney(999.99)).toBe('999.99');
      expect(formatDisplayMoney(1000)).toBe('1,000.00');
      expect(formatDisplayMoney(1234.56)).toBe('1,234.56');
      expect(formatDisplayMoney(1234567.89)).toBe('1,234,567.89');
    });

    it('groups without disturbing a leading minus', () => {
      expect(formatDisplayMoney(-1234.56)).toBe('-1,234.56');
    });

    it('appends a currency code only when one is given', () => {
      expect(formatDisplayMoney(1234.56, 'MYR')).toBe('1,234.56 MYR');
      expect(formatDisplayMoney(1234.56, null)).toBe('1,234.56');
      expect(formatDisplayMoney(1234.56)).toBe('1,234.56');
    });
  });

  describe('formatDirectionalMoney', () => {
    it('signs from the direction rather than the value', () => {
      expect(formatDirectionalMoney(5, 'spent')).toBe('-5.00');
      expect(formatDirectionalMoney(5, 'received')).toBe('+5.00');
      expect(formatDirectionalMoney(-5, 'spent')).toBe('-5.00');
      expect(formatDirectionalMoney(-5, 'received')).toBe('+5.00');
    });

    it('keeps its sign at zero', () => {
      expect(formatDirectionalMoney(0, 'spent')).toBe('-0.00');
      expect(formatDirectionalMoney(0, 'received')).toBe('+0.00');
    });

    it('groups thousands and appends an optional code', () => {
      expect(formatDirectionalMoney(1234.56, 'spent', 'MYR')).toBe(
        '-1,234.56 MYR',
      );
      expect(formatDirectionalMoney(1234.56, 'received', null)).toBe(
        '+1,234.56',
      );
    });
  });

  describe('formatSignedMoney', () => {
    it('signs from the value', () => {
      expect(formatSignedMoney(5)).toBe('+5.00');
      expect(formatSignedMoney(-5)).toBe('-5.00');
    });

    it('renders exactly zero unsigned', () => {
      expect(formatSignedMoney(0)).toBe('0.00');
      expect(formatSignedMoney(-0)).toBe('0.00');
    });

    it('decides the sign after rounding', () => {
      expect(formatSignedMoney(0.001)).toBe('0.00');
      expect(formatSignedMoney(-0.001)).toBe('0.00');
      expect(formatSignedMoney(-0.005)).toBe('-0.01');
    });

    it('groups thousands and appends an optional code', () => {
      expect(formatSignedMoney(-1234.56, 'MYR')).toBe('-1,234.56 MYR');
      expect(formatSignedMoney(1234.56, null)).toBe('+1,234.56');
    });
  });
});
