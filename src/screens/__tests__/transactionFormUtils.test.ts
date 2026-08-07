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
});
