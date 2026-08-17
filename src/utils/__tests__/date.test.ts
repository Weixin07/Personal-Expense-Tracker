import {
  formatDateBritish,
  formatDateRangeBritish,
  parseBritishDateInput,
  formatDateTimeBritish,
  localIsoDate,
  localIsoDateOffset,
  localTimeOfDay,
  parseTimeInput,
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
      expect(formatDateRangeBritish('2025-01-01', null)).toBe(
        'From 01/01/2025',
      );
      expect(formatDateRangeBritish('2025-01-01', undefined)).toBe(
        'From 01/01/2025',
      );
    });

    it('should handle end date only', () => {
      expect(formatDateRangeBritish(null, '2025-12-31')).toBe(
        'Up to 31/12/2025',
      );
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

describe('parseTimeInput', () => {
  it.each([
    ['14:30', '14:30'],
    ['14.30', '14:30'],
    ['1430', '14:30'],
    ['9:05', '09:05'],
    ['09:05', '09:05'],
    ['930', '09:30'],
    ['2:30pm', '14:30'],
    ['2.30 PM', '14:30'],
    ['2:30 p.m.', '14:30'],
    ['12:15am', '00:15'],
    ['12:15pm', '12:15'],
    ['  14:30  ', '14:30'],
  ])('normalises %s to %s', (input, expected) => {
    expect(parseTimeInput(input)).toBe(expected);
  });

  it('returns an empty string for a cleared field', () => {
    expect(parseTimeInput('')).toBe('');
    expect(parseTimeInput('   ')).toBe('');
  });

  it.each(['25:00', '12:60', 'lunch', '14:3', '1:2:3', '13:00pm', '0:30am'])(
    'returns null for the unreadable value %s',
    input => {
      expect(parseTimeInput(input)).toBeNull();
    },
  );

  it('distinguishes a cleared field from an unreadable one', () => {
    expect(parseTimeInput('')).not.toBeNull();
    expect(parseTimeInput('nonsense')).toBeNull();
  });
});

describe('formatDateTimeBritish', () => {
  it('appends the time when one was recorded', () => {
    expect(formatDateTimeBritish('2026-08-08', '14:30')).toBe(
      '08/08/2026 14:30',
    );
  });

  it('shows the date alone when no time was recorded', () => {
    expect(formatDateTimeBritish('2026-08-08', null)).toBe('08/08/2026');
    expect(formatDateTimeBritish('2026-08-08', '')).toBe('08/08/2026');
    expect(formatDateTimeBritish('2026-08-08', undefined)).toBe('08/08/2026');
  });
});

describe('local now helpers', () => {
  it('reads the calendar day from local getters, not UTC', () => {
    // 23:30 on the 8th locally; UTC would report the 8th or 9th depending on
    // the runner's zone, so the local reading is what must be asserted.
    const localLateEvening = new Date(2026, 7, 8, 23, 30);
    expect(localIsoDate(localLateEvening)).toBe('2026-08-08');
    expect(localTimeOfDay(localLateEvening)).toBe('23:30');
  });

  it('zero-pads single-digit months, days, hours and minutes', () => {
    expect(localIsoDate(new Date(2026, 0, 5, 9, 7))).toBe('2026-01-05');
    expect(localTimeOfDay(new Date(2026, 0, 5, 9, 7))).toBe('09:07');
  });
});

describe('localIsoDateOffset', () => {
  const august14 = new Date(2026, 7, 14, 6, 27);

  it('shifts by whole days in either direction', () => {
    expect(localIsoDateOffset(august14, { days: -6 })).toBe('2026-08-08');
    expect(localIsoDateOffset(august14, { days: -29 })).toBe('2026-07-16');
    expect(localIsoDateOffset(august14, { days: 3 })).toBe('2026-08-17');
  });

  it('shifts by whole months', () => {
    expect(localIsoDateOffset(august14, { months: -12 })).toBe('2025-08-14');
    expect(localIsoDateOffset(august14, { months: 5 })).toBe('2027-01-14');
  });

  it('applies days and months together', () => {
    expect(localIsoDateOffset(august14, { months: -1, days: -13 })).toBe(
      '2026-07-01',
    );
  });

  it('rolls over year boundaries', () => {
    expect(localIsoDateOffset(new Date(2026, 0, 1), { days: -1 })).toBe(
      '2025-12-31',
    );
  });

  it('overflows a month shift past the shorter month, rather than clamping', () => {
    expect(localIsoDateOffset(new Date(2026, 2, 31), { months: -1 })).toBe(
      '2026-03-03',
    );
  });

  it('returns the local day itself when nothing is offset', () => {
    expect(localIsoDateOffset(august14, {})).toBe(localIsoDate(august14));
  });
});
