import type { CategoryType } from '../database';

export const CATEGORY_TYPE_LABELS: Record<CategoryType, string> = {
  expense: 'Expense only',
  income: 'Income only',
  both: 'Expense and income',
};
