import type {
  CategoryRecord,
  FundRecord,
  TransactionRecord,
} from '../database';
import { TRANSACTION_CSV_COLUMNS } from './csvColumns';

type BuildCsvInput = {
  transactions: readonly TransactionRecord[];
  categories?: readonly CategoryRecord[];
  funds?: readonly FundRecord[];
  generatedAt?: Date;
};

type BuildCsvOutput = {
  filename: string;
  content: string;
};

const HEADER_COLUMNS = TRANSACTION_CSV_COLUMNS;

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

export const buildTransactionsCsv = ({
  transactions,
  categories = [],
  funds = [],
  generatedAt = new Date(),
}: BuildCsvInput): BuildCsvOutput => {
  const categoryMap = new Map<number, string>();
  categories.forEach(category => {
    categoryMap.set(category.id, category.name);
  });

  const fundMap = new Map<number, string>();
  funds.forEach(fund => {
    fundMap.set(fund.id, fund.name);
  });

  const filename = `transactions_backup_${formatTimestamp(generatedAt)}.csv`;

  const lines: string[] = [];
  lines.push(HEADER_COLUMNS.join(','));

  transactions.forEach(transaction => {
    const categoryName = transaction.categoryId
      ? (categoryMap.get(transaction.categoryId) ?? '')
      : '';

    const row = [
      transaction.id.toString(),
      transaction.description,
      formatAmountNative(transaction.amountNative),
      transaction.currencyCode,
      formatFxRate(transaction.fxRateToBase),
      formatBaseAmount(transaction.baseAmount),
      transaction.date,
      categoryName,
      transaction.notes ?? '',
      transaction.baseCurrencyCode ?? '',
      transaction.payee,
      transaction.type,
      transaction.time ?? '',
      fundMap.get(transaction.fundId) ?? '',
      transaction.counterpartFundId
        ? (fundMap.get(transaction.counterpartFundId) ?? '')
        : '',
      transaction.counterpartAmount != null
        ? formatAmountNative(transaction.counterpartAmount)
        : '',
      transaction.counterpartCurrencyCode ?? '',
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
