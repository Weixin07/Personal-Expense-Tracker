import type { CategoryRecord, TransactionRecord } from '../../database';
import {
  buildCreatePayload,
  buildUpdatePayload,
  computeBaseAmount,
  getDefaultTransactionFormValues,
  validateTransactionForm,
} from '../transactionFormUtils';

describe('transactionFormUtils', () => {
  const categories: CategoryRecord[] = [
    { id: 1, name: 'Essentials', createdAt: '', updatedAt: '', type: 'both' },
    { id: 2, name: 'Travel', createdAt: '', updatedAt: '', type: 'both' },
  ];

  describe('computeBaseAmount', () => {
    it('computes and rounds to 8 decimal places', () => {
      expect(computeBaseAmount('12.34', '1.23456789')).toBeCloseTo(15.23456776);
    });

    it('returns null for invalid inputs', () => {
      expect(computeBaseAmount('abc', '1.23')).toBeNull();
      expect(computeBaseAmount('10', 'rate')).toBeNull();
    });
  });

  describe('getDefaultTransactionFormValues', () => {
    it('prefills using base currency when no existing expense provided', () => {
      const values = getDefaultTransactionFormValues('USD', categories);
      expect(values.currencyCode).toBe('USD');
      expect(values.description).toBe('');
      expect(values.payee).toBe('');
    });

    it('hydrates from existing expense', () => {
      const existing: TransactionRecord = {
        type: 'expense',
        id: 42,
        description: 'Lunch',
        payee: 'Cafe Rio',
        amountNative: 10,
        currencyCode: 'USD',
        fxRateToBase: 1,
        baseAmount: 10,
        baseCurrencyCode: 'USD',
        date: '2025-01-01',
        time: null,
        categoryId: 1,
        notes: 'Receipt #123',
        createdAt: '',
        updatedAt: '',
      };
      const values = getDefaultTransactionFormValues(
        null,
        categories,
        existing,
      );
      expect(values.description).toBe('Lunch');
      expect(values.payee).toBe('Cafe Rio');
      expect(values.baseAmount).toBe('10.00');
    });
  });

  describe('amount round trip', () => {
    const existingLargeAmount: TransactionRecord = {
      type: 'expense',
      id: 99,
      description: 'Deposit',
      payee: 'Landlord',
      amountNative: 1234.56,
      currencyCode: 'USD',
      fxRateToBase: 1,
      baseAmount: 1234.56,
      baseCurrencyCode: 'USD',
      date: '2025-01-01',
      time: null,
      categoryId: 1,
      notes: null,
      createdAt: '',
      updatedAt: '',
    };

    it('hydrates four-figure amounts as parseable text', () => {
      const values = getDefaultTransactionFormValues(
        'USD',
        categories,
        existingLargeAmount,
      );

      expect(values.amountNative).toBe('1234.56');
      expect(values.baseAmount).toBe('1234.56');
      expect(Number(values.amountNative)).toBe(1234.56);
      expect(Number(values.baseAmount)).toBe(1234.56);
    });

    it('validates and rebuilds a hydrated four-figure amount unchanged', () => {
      const values = getDefaultTransactionFormValues(
        'USD',
        categories,
        existingLargeAmount,
      );
      const result = validateTransactionForm(values);

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.amountNative).toBe(1234.56);
        expect(buildUpdatePayload(99, result.value).amountNative).toBe(1234.56);
      }
    });
  });

  describe('validateTransactionForm', () => {
    it('returns errors for invalid form', () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 10); // Exceeds the 3-day future limit.
      const futureDateStr = futureDate.toISOString().slice(0, 10);

      const result = validateTransactionForm({
        type: 'expense',
        description: '',
        payee: '',
        amountNative: '0',
        currencyCode: 'BTC',
        fxRateToBase: '0',
        baseAmount: '',
        baseCurrencyCode: 'USD',
        date: futureDateStr,
        time: '',
        categoryId: null,
        notes: '',
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors.form).toBe(
          'Add a description, payee, or category.',
        );
        expect(result.errors.amountNative).toBe(
          'Amount must be greater than zero.',
        );
        expect(result.errors.currencyCode).toBe(
          'Currency code must be a valid ISO-4217 code.',
        );
        expect(result.errors.date).toBe(
          'Date cannot be more than 3 days in the future.',
        );
      }
    });

    it('passes with valid data', () => {
      const result = validateTransactionForm({
        type: 'expense',
        description: 'Dinner',
        payee: 'Bistro',
        amountNative: '20.50',
        currencyCode: 'USD',
        fxRateToBase: '1.123456',
        baseAmount: '',
        baseCurrencyCode: 'USD',
        date: '2025-01-10',
        time: '',
        categoryId: 1,
        notes: 'Friends',
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.payee).toBe('Bistro');
        expect(result.value.baseAmount).toBeCloseTo(23.030848, 8);
      }
    });

    const validBase = {
      type: 'expense',
      amountNative: '20.50',
      currencyCode: 'USD',
      fxRateToBase: '1.123456',
      baseAmount: '',
      baseCurrencyCode: 'USD',
      date: '2025-01-10',
      time: '',
      notes: '',
    } as const;

    it('accepts a category-only expense with blank description and payee', () => {
      const result = validateTransactionForm({
        ...validBase,
        description: '',
        payee: '',
        categoryId: 1,
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.description).toBe('');
        expect(result.value.payee).toBe('');
      }
    });

    it('accepts a description-only expense with no payee or category', () => {
      const result = validateTransactionForm({
        ...validBase,
        description: 'Lunch',
        payee: '',
        categoryId: null,
      });
      expect(result.ok).toBe(true);
    });

    it('accepts a payee-only expense with no description or category', () => {
      const result = validateTransactionForm({
        ...validBase,
        description: '',
        payee: 'Cafe',
        categoryId: null,
      });
      expect(result.ok).toBe(true);
    });

    it('rejects an expense with no description, payee, or category', () => {
      const result = validateTransactionForm({
        ...validBase,
        description: '   ',
        payee: '',
        categoryId: null,
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors.form).toBe(
          'Add a description, payee, or category.',
        );
      }
    });
  });

  describe('build payload helpers', () => {
    const valid = {
      type: 'expense',
      description: 'Groceries',
      payee: 'Local Market',
      amountNative: 50,
      currencyCode: 'USD',
      fxRateToBase: 1,
      baseAmount: 50,
      baseCurrencyCode: 'USD',
      date: '2025-01-09',
      time: null,
      categoryId: 1,
      notes: 'Farmer market',
    } as const;

    it('builds create payload', () => {
      expect(buildCreatePayload(valid)).toEqual(valid);
    });

    it('builds update payload', () => {
      expect(buildUpdatePayload(5, valid)).toEqual({ id: 5, ...valid });
    });
  });
  describe('time of day', () => {
    afterEach(() => {
      jest.useRealTimers();
    });

    it('prefills a new form with the local date and clock time', () => {
      const now = new Date(2026, 7, 8, 23, 30);
      jest.useFakeTimers().setSystemTime(now);

      const values = getDefaultTransactionFormValues('USD', categories);

      const expectedDate = `${now.getFullYear()}-${String(
        now.getMonth() + 1,
      ).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      expect(values.date).toBe(expectedDate);
      expect(values.time).toBe('23:30');
    });

    it('keeps an existing record without a time rather than stamping now', () => {
      jest.useFakeTimers().setSystemTime(new Date(2026, 7, 8, 23, 30));
      const existing: TransactionRecord = {
        type: 'expense',
        id: 7,
        description: 'Legacy',
        payee: 'Shop',
        amountNative: 5,
        currencyCode: 'USD',
        fxRateToBase: 1,
        baseAmount: 5,
        baseCurrencyCode: 'USD',
        date: '2024-03-02',
        time: null,
        categoryId: null,
        notes: null,
        createdAt: '',
        updatedAt: '',
      };

      const values = getDefaultTransactionFormValues(
        'USD',
        categories,
        existing,
      );

      expect(values.time).toBe('');
      expect(values.date).toBe('2024-03-02');
    });

    it('hydrates a recorded time from an existing record', () => {
      const existing: TransactionRecord = {
        type: 'expense',
        id: 8,
        description: 'Lunch',
        payee: 'Cafe',
        amountNative: 5,
        currencyCode: 'USD',
        fxRateToBase: 1,
        baseAmount: 5,
        baseCurrencyCode: 'USD',
        date: '2026-08-08',
        time: '14:30',
        categoryId: null,
        notes: null,
        createdAt: '',
        updatedAt: '',
      };

      expect(
        getDefaultTransactionFormValues('USD', categories, existing).time,
      ).toBe('14:30');
    });

    const timeBase = {
      type: 'expense',
      description: 'Dinner',
      payee: 'Bistro',
      amountNative: '20.50',
      currencyCode: 'USD',
      fxRateToBase: '1.123456',
      baseAmount: '',
      baseCurrencyCode: 'USD',
      date: '2025-01-10',
      categoryId: 1,
      notes: '',
    } as const;

    it('carries a valid time through to the payload', () => {
      const result = validateTransactionForm({ ...timeBase, time: '14:30' });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.time).toBe('14:30');
      }
    });

    it('records a blank time as absent rather than as an error', () => {
      const result = validateTransactionForm({ ...timeBase, time: '   ' });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.time).toBeNull();
      }
    });

    it('rejects a time that could not be read', () => {
      const result = validateTransactionForm({ ...timeBase, time: 'lunch' });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors.time).toBe(
          'Time must be in 24-hour format HH:MM.',
        );
      }
    });

    it('carries the time through both payload builders', () => {
      const result = validateTransactionForm({ ...timeBase, time: '08:15' });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(buildCreatePayload(result.value).time).toBe('08:15');
        expect(buildUpdatePayload(42, result.value).time).toBe('08:15');
      }
    });
  });
});
