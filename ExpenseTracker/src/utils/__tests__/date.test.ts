import {
  formatDateBritish,
  formatDateRangeBritish,
  parseBritishDateInput,
} from '../date';

describe('date utilities', () => {
  describe('formatDateBritish', () => {
    it('should format ISO dates to DD/MM/YYYY', () => {
      expect(formatDateBritish('2025-01-15')).toBe('15/01/2025');
      expect(formatDateBritish('2024-12-31')).toBe('31/12/2024');
      expect(formatDateBritish('2023-07-04')).toBe('04/07/2023');
    });

    it('should handle single digit days and months with leading zeros', () => {
      expect(formatDateBritish('2025-01-01')).toBe('01/01/2025');
      expect(formatDateBritish('2025-09-09')).toBe('09/09/2025');
    });

    it('should return empty string for empty input', () => {
      expect(formatDateBritish('')).toBe('');
    });

    it('should return original input for invalid ISO format', () => {
      expect(formatDateBritish('invalid')).toBe('invalid');
      expect(formatDateBritish('2025-13')).toBe('2025-13');
      expect(formatDateBritish('2025')).toBe('2025');
    });

    it('should handle malformed dates gracefully', () => {
      expect(formatDateBritish('2025-')).toBe('2025-');
      expect(formatDateBritish('2025-01-')).toBe('2025-01-');
    });
  });

  describe('formatDateRangeBritish', () => {
    it('should format both start and end dates', () => {
      expect(formatDateRangeBritish('2025-01-01', '2025-01-31')).toBe(
        '01/01/2025 to 31/01/2025',
      );
      expect(formatDateRangeBritish('2024-06-15', '2024-06-30')).toBe(
        '15/06/2024 to 30/06/2024',
      );
    });

    it('should handle start date only', () => {
      expect(formatDateRangeBritish('2025-01-01', null)).toBe('From 01/01/2025');
      expect(formatDateRangeBritish('2025-01-01', undefined)).toBe(
        'From 01/01/2025',
      );
    });

    it('should handle end date only', () => {
      expect(formatDateRangeBritish(null, '2025-12-31')).toBe('Up to 31/12/2025');
      expect(formatDateRangeBritish(undefined, '2025-12-31')).toBe(
        'Up to 31/12/2025',
      );
    });

    it('should return "All time" when both dates are null/undefined', () => {
      expect(formatDateRangeBritish(null, null)).toBe('All time');
      expect(formatDateRangeBritish(undefined, undefined)).toBe('All time');
      expect(formatDateRangeBritish(null, undefined)).toBe('All time');
    });

    it('should handle empty strings', () => {
      expect(formatDateRangeBritish('', '')).toBe('All time');
      expect(formatDateRangeBritish('', null)).toBe('All time');
      expect(formatDateRangeBritish(null, '')).toBe('All time');
    });
  });

  describe('parseBritishDateInput', () => {
    it('should parse British date format DD/MM/YYYY', () => {
      expect(parseBritishDateInput('15/01/2025')).toBe('2025-01-15');
      expect(parseBritishDateInput('31/12/2024')).toBe('2024-12-31');
      expect(parseBritishDateInput('04/07/2023')).toBe('2023-07-04');
    });

    it('should parse dates with single digit day/month', () => {
      expect(parseBritishDateInput('1/1/2025')).toBe('2025-01-01');
      expect(parseBritishDateInput('9/9/2025')).toBe('2025-09-09');
      expect(parseBritishDateInput('5/12/2025')).toBe('2025-12-05');
    });

    it('should parse dates with 2-digit year', () => {
      expect(parseBritishDateInput('15/01/25')).toBe('2025-01-15');
      expect(parseBritishDateInput('31/12/24')).toBe('2024-12-31');
    });

    it('should accept ISO format dates unchanged', () => {
      expect(parseBritishDateInput('2025-01-15')).toBe('2025-01-15');
      expect(parseBritishDateInput('2024-12-31')).toBe('2024-12-31');
    });

    it('should handle different separators', () => {
      expect(parseBritishDateInput('15-01-2025')).toBe('2025-01-15');
      expect(parseBritishDateInput('15.01.2025')).toBe('2025-01-15');
      expect(parseBritishDateInput('15 01 2025')).toBe('2025-01-15');
    });

    it('should return empty string for empty input', () => {
      expect(parseBritishDateInput('')).toBe('');
      expect(parseBritishDateInput('   ')).toBe('');
    });

    it('should return null for invalid formats', () => {
      expect(parseBritishDateInput('invalid')).toBeNull();
      expect(parseBritishDateInput('15')).toBeNull();
      expect(parseBritishDateInput('15/01')).toBeNull();
      expect(parseBritishDateInput('15/01/2025/extra')).toBeNull();
    });

    it('should return null for invalid date values', () => {
      expect(parseBritishDateInput('32/01/2025')).toBeNull();
      expect(parseBritishDateInput('31/02/2025')).toBeNull();
      expect(parseBritishDateInput('00/01/2025')).toBeNull();
      expect(parseBritishDateInput('15/13/2025')).toBeNull();
    });

    it('should return null for non-numeric values', () => {
      expect(parseBritishDateInput('ab/01/2025')).toBeNull();
      expect(parseBritishDateInput('15/ab/2025')).toBeNull();
      expect(parseBritishDateInput('15/01/abcd')).toBeNull();
    });

    it('should handle leap years correctly', () => {
      expect(parseBritishDateInput('29/02/2024')).toBe('2024-02-29');
      expect(parseBritishDateInput('29/02/2023')).toBeNull();
    });

    it('should pad single digits with zeros', () => {
      expect(parseBritishDateInput('5/3/2025')).toBe('2025-03-05');
      expect(parseBritishDateInput('10/3/2025')).toBe('2025-03-10');
    });
  });
});
