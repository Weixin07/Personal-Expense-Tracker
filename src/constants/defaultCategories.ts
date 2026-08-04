import type { CategoryType } from '../database';

export type DefaultCategory = {
  name: string;
  type: CategoryType;
};

export const DEFAULT_CATEGORIES: readonly DefaultCategory[] = [
  { name: 'Essentials', type: 'both' },
  { name: 'Groceries', type: 'both' },
  { name: 'Dining', type: 'both' },
  { name: 'Transport', type: 'both' },
  { name: 'Housing', type: 'both' },
  { name: 'Utilities', type: 'both' },
  { name: 'Healthcare', type: 'both' },
  { name: 'Insurance', type: 'both' },
  { name: 'Education', type: 'both' },
  { name: 'Personal Care', type: 'both' },
  { name: 'Entertainment', type: 'both' },
  { name: 'Gifts', type: 'both' },
  { name: 'Travel', type: 'both' },
  { name: 'Savings', type: 'both' },
  { name: 'Investments', type: 'both' },
  { name: 'Fees', type: 'both' },
  { name: 'Income Adjustments', type: 'income' },
  { name: 'Miscellaneous', type: 'both' },
  { name: 'Salary', type: 'income' },
  { name: 'Bonus', type: 'income' },
  { name: 'Interest', type: 'income' },
  { name: 'Refund', type: 'income' },
  { name: 'Investment Income', type: 'income' },
];
