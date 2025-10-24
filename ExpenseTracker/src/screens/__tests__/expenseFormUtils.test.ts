import type { CategoryRecord, ExpenseRecord } from '../../database';
import {
  buildCreatePayload,
  buildUpdatePayload,
  computeBaseAmount,
  getDefaultExpenseFormValues,
  validateExpenseForm,
} from '../expenseFormUtils';

describe('expenseFormUtils', () => {
  const categories: CategoryRecord[] = [
    { id: 1, name: 'Essentials', createdAt: '', updatedAt: '' },
    { id: 2, name: 'Travel', createdAt: '', updatedAt: '' },
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

  describe('getDefaultExpenseFormValues', () => {
    it('prefills using base currency when no existing expense provided', () => {
      const values = getDefaultExpenseFormValues('USD', categories);
      expect(values.currencyCode).toBe('USD');
      expect(values.description).toBe('');
    });

    it('hydrates from existing expense', () => {
      const existing: ExpenseRecord = {
        id: 42,
        description: 'Lunch',
        amountNative: 10,
        currencyCode: 'USD',
        fxRateToBase: 1,
        baseAmount: 10,
        date: '2025-01-01',
        categoryId: 1,
        notes: 'Receipt #123',
        createdAt: '',
        updatedAt: '',
      };
      const values = getDefaultExpenseFormValues(null, categories, existing);
      expect(values.description).toBe('Lunch');
      expect(values.baseAmount).toBe('10.00000000');
    });
  });

  describe('validateExpenseForm', () => {
    it('returns errors for invalid form', () => {
      const result = validateExpenseForm({
        description: '',
        amountNative: '0',
        currencyCode: 'BTC',
        fxRateToBase: '0',
        baseAmount: '',
        date: '2025-02-30',
        categoryId: null,
        notes: '',
      });
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors.description).toBeDefined();
        expect(result.errors.amountNative).toBe('Amount must be greater than zero.');
        expect(result.errors.currencyCode).toBe('Currency code must be a valid ISO-4217 code.');
        expect(result.errors.date).toBeDefined();
      }
    });

    it('passes with valid data', () => {
      const result = validateExpenseForm({
        description: 'Dinner',
        amountNative: '20.50',
        currencyCode: 'USD',
        fxRateToBase: '1.123456',
        baseAmount: '',
        date: '2025-01-10',
        categoryId: 1,
        notes: 'Friends',
      });
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.baseAmount).toBeCloseTo(23.030848, 8);
      }
    });
  });

  describe('build payload helpers', () => {
    const valid = {
      description: 'Groceries',
      amountNative: 50,
      currencyCode: 'USD',
      fxRateToBase: 1,
      baseAmount: 50,
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