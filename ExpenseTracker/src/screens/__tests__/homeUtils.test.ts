import {
  computePresetRange,
  detectPreset,
  formatDateRangeLabel,
  DATE_PRESETS,
} from '../homeUtils';

describe('homeUtils', () => {
  describe('DATE_PRESETS', () => {
    it('should define all date preset options', () => {
      expect(DATE_PRESETS).toHaveLength(4);
      expect(DATE_PRESETS[0]).toEqual({ label: 'Last 7 days', value: 'last7Days' });
      expect(DATE_PRESETS[1]).toEqual({ label: 'Last 30 days', value: 'last30Days' });
      expect(DATE_PRESETS[2]).toEqual({ label: 'This month', value: 'thisMonth' });
      expect(DATE_PRESETS[3]).toEqual({ label: 'All time', value: 'allTime' });
    });
  });

  describe('computePresetRange', () => {
    const mockDate = new Date('2025-01-15T12:00:00Z');

    it('should compute "last7Days" range', () => {
      const result = computePresetRange('last7Days', mockDate);
      expect(result).toEqual({
        startDate: '2025-01-09',
        endDate: '2025-01-15',
      });
    });

    it('should compute "last30Days" range', () => {
      const result = computePresetRange('last30Days', mockDate);
      expect(result).toEqual({
        startDate: '2024-12-17',
        endDate: '2025-01-15',
      });
    });

    it('should compute "thisMonth" range', () => {
      const result = computePresetRange('thisMonth', mockDate);
      expect(result).toEqual({
        startDate: '2025-01-01',
        endDate: '2025-01-15',
      });
    });

    it('should compute "allTime" range as null dates', () => {
      const result = computePresetRange('allTime', mockDate);
      expect(result).toEqual({
        startDate: null,
        endDate: null,
      });
    });

    it('should handle end of month correctly', () => {
      const endOfMonth = new Date('2025-01-31T12:00:00Z');
      const result = computePresetRange('thisMonth', endOfMonth);
      expect(result).toEqual({
        startDate: '2025-01-01',
        endDate: '2025-01-31',
      });
    });

    it('should handle start of month correctly', () => {
      const startOfMonth = new Date('2025-01-01T12:00:00Z');
      const result = computePresetRange('thisMonth', startOfMonth);
      expect(result).toEqual({
        startDate: '2025-01-01',
        endDate: '2025-01-01',
      });
    });

    it('should handle month boundary for last30Days', () => {
      const marchFirst = new Date('2025-03-01T12:00:00Z');
      const result = computePresetRange('last30Days', marchFirst);
      expect(result).toEqual({
        startDate: '2025-01-31', // 29 days before March 1 is January 31
        endDate: '2025-03-01',
      });
    });

    it('should handle leap year in last30Days', () => {
      const leapDay = new Date('2024-02-29T12:00:00Z');
      const result = computePresetRange('last30Days', leapDay);
      expect(result).toEqual({
        startDate: '2024-01-31',
        endDate: '2024-02-29',
      });
    });

    it('should use current date when no date provided', () => {
      const result = computePresetRange('allTime');
      expect(result).toEqual({
        startDate: null,
        endDate: null,
      });
    });

    it('should handle December correctly for thisMonth', () => {
      const december = new Date('2024-12-25T12:00:00Z');
      const result = computePresetRange('thisMonth', december);
      expect(result).toEqual({
        startDate: '2024-12-01',
        endDate: '2024-12-25',
      });
    });
  });

  describe('detectPreset', () => {
    const mockDate = new Date('2025-01-15T12:00:00Z');

    it('should detect "allTime" when no dates provided', () => {
      expect(detectPreset({}, mockDate)).toBe('allTime');
      expect(detectPreset({ startDate: null, endDate: null }, mockDate)).toBe('allTime');
      expect(detectPreset({ startDate: undefined, endDate: undefined }, mockDate)).toBe('allTime');
    });

    it('should detect "last7Days" preset', () => {
      const filters = { startDate: '2025-01-09', endDate: '2025-01-15' };
      expect(detectPreset(filters, mockDate)).toBe('last7Days');
    });

    it('should detect "last30Days" preset', () => {
      const filters = { startDate: '2024-12-17', endDate: '2025-01-15' };
      expect(detectPreset(filters, mockDate)).toBe('last30Days');
    });

    it('should detect "thisMonth" preset', () => {
      const filters = { startDate: '2025-01-01', endDate: '2025-01-15' };
      expect(detectPreset(filters, mockDate)).toBe('thisMonth');
    });

    it('should return "custom" for non-matching ranges', () => {
      const filters = { startDate: '2025-01-05', endDate: '2025-01-10' };
      expect(detectPreset(filters, mockDate)).toBe('custom');
    });

    it('should return "custom" when only start date provided', () => {
      const filters = { startDate: '2025-01-01', endDate: null };
      expect(detectPreset(filters, mockDate)).toBe('custom');
    });

    it('should return "custom" when only end date provided', () => {
      const filters = { startDate: null, endDate: '2025-01-15' };
      expect(detectPreset(filters, mockDate)).toBe('custom');
    });

    it('should prioritize exact matches in order', () => {
      const mockDateForOverlap = new Date('2025-01-07T12:00:00Z');
      const filters = { startDate: '2025-01-01', endDate: '2025-01-07' };
      expect(detectPreset(filters, mockDateForOverlap)).toBe('last7Days');
    });

    it('should handle edge case where date changes between calls', () => {
      const jan1 = new Date('2025-01-01T12:00:00Z');
      const filters = { startDate: '2025-01-01', endDate: '2025-01-01' };
      expect(detectPreset(filters, jan1)).toBe('thisMonth');
    });
  });

  describe('formatDateRangeLabel', () => {
    it('should format "All time" when no dates provided', () => {
      expect(formatDateRangeLabel({})).toBe('All time');
      expect(formatDateRangeLabel({ startDate: null, endDate: null })).toBe('All time');
    });

    it('should format date range in British format', () => {
      const filters = { startDate: '2025-01-01', endDate: '2025-01-31' };
      expect(formatDateRangeLabel(filters)).toBe('01/01/2025 to 31/01/2025');
    });

    it('should format start date only', () => {
      const filters = { startDate: '2025-01-01', endDate: null };
      expect(formatDateRangeLabel(filters)).toBe('From 01/01/2025');
    });

    it('should format end date only', () => {
      const filters = { startDate: null, endDate: '2025-01-31' };
      expect(formatDateRangeLabel(filters)).toBe('Up to 31/01/2025');
    });

    it('should handle undefined dates', () => {
      const filters = { startDate: undefined, endDate: undefined };
      expect(formatDateRangeLabel(filters)).toBe('All time');
    });
  });

  describe('integration: preset detection and computation', () => {
    it('should detect the same preset that was computed', () => {
      const mockDate = new Date('2025-01-15T12:00:00Z');

      const last7Range = computePresetRange('last7Days', mockDate);
      expect(detectPreset(last7Range, mockDate)).toBe('last7Days');

      const last30Range = computePresetRange('last30Days', mockDate);
      expect(detectPreset(last30Range, mockDate)).toBe('last30Days');

      const thisMonthRange = computePresetRange('thisMonth', mockDate);
      expect(detectPreset(thisMonthRange, mockDate)).toBe('thisMonth');

      const allTimeRange = computePresetRange('allTime', mockDate);
      expect(detectPreset(allTimeRange, mockDate)).toBe('allTime');
    });

    it('should format labels consistently with computed ranges', () => {
      const mockDate = new Date('2025-01-15T12:00:00Z');

      const last7Range = computePresetRange('last7Days', mockDate);
      expect(formatDateRangeLabel(last7Range)).toBe('09/01/2025 to 15/01/2025');

      const allTimeRange = computePresetRange('allTime', mockDate);
      expect(formatDateRangeLabel(allTimeRange)).toBe('All time');
    });
  });
});
