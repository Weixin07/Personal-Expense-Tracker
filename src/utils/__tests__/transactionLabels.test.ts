import { formatExpenseCount, formatIncomeCount } from '../transactionLabels';

describe('transactionLabels', () => {
  describe('formatExpenseCount', () => {
    it('pluralises the noun', () => {
      expect(formatExpenseCount(0)).toBe('0 expenses');
      expect(formatExpenseCount(1)).toBe('1 expense');
      expect(formatExpenseCount(5)).toBe('5 expenses');
    });
  });

  describe('formatIncomeCount', () => {
    it('counts a noun rather than pluralising the mass noun', () => {
      expect(formatIncomeCount(0)).toBe('0 income entries');
      expect(formatIncomeCount(1)).toBe('1 income entry');
      expect(formatIncomeCount(5)).toBe('5 income entries');
    });
  });
});
