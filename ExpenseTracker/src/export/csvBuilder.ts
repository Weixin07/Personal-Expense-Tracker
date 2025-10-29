import type { CategoryRecord, ExpenseRecord } from "../database";

type BuildCsvInput = {
  expenses: readonly ExpenseRecord[];
  categories?: readonly CategoryRecord[];
  generatedAt?: Date;
};

type BuildCsvOutput = {
  filename: string;
  content: string;
};

const HEADER_COLUMNS = [
  'id',
  'description',
  'amount_native',
  'currency_code',
  'fx_rate_to_base',
  'base_amount',
  'date',
  'category',
  'notes',
] as const;

const UTF8_BOM = '\uFEFF';
const LINE_ENDING = '\r\n';

const pad = (value: number): string => value.toString().padStart(2, '0');

const formatTimestamp = (date: Date): string => {
  const year = date.getUTCFullYear();
  const month = pad(date.getUTCMonth() + 1);
  const day = pad(date.getUTCDate());
  const hours = pad(date.getUTCHours());
  const minutes = pad(date.getUTCMinutes());
  const seconds = pad(date.getUTCSeconds());

  return `${year}${month}${day}_${hours}${minutes}${seconds}`;
};

const escapeCell = (input: unknown): string => {
  if (input === null || input === undefined) {
    return '';
  }

  const value = String(input);
  const needsQuoting = /[",\r\n]/.test(value) || /^\s|\s$/.test(value);
  const escaped = value.replace(/"/g, '""');

  return needsQuoting ? `"${escaped}"` : escaped;
};

const formatAmountNative = (amount: number): string => amount.toFixed(2);
const formatFxRate = (rate: number): string => rate.toFixed(6);
const formatBaseAmount = (amount: number): string => amount.toFixed(2);

export const buildExpensesCsv = ({
  expenses,
  categories = [],
  generatedAt = new Date(),
}: BuildCsvInput): BuildCsvOutput => {
  const categoryMap = new Map<number, string>();
  categories.forEach(category => {
    categoryMap.set(category.id, category.name);
  });

  const filename = `expenses_backup_${formatTimestamp(generatedAt)}.csv`;

  const lines: string[] = [];
  lines.push(HEADER_COLUMNS.join(','));

  expenses.forEach(expense => {
    const categoryName = expense.categoryId ? categoryMap.get(expense.categoryId) ?? '' : '';

    const row = [
      expense.id.toString(),
      expense.description,
      formatAmountNative(expense.amountNative),
      expense.currencyCode,
      formatFxRate(expense.fxRateToBase),
      formatBaseAmount(expense.baseAmount),
      expense.date,
      categoryName,
      expense.notes ?? '',
    ].map(escapeCell);

    lines.push(row.join(','));
  });

  const content = UTF8_BOM + lines.join(LINE_ENDING) + LINE_ENDING;

  return {
    filename,
    content,
  };
};

export type { BuildCsvInput, BuildCsvOutput };