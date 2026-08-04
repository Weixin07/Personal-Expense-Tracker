export const TRANSACTION_CSV_COLUMNS = [
  'id',
  'description',
  'amount_native',
  'currency_code',
  'fx_rate_to_base',
  'base_amount',
  'date',
  'category',
  'notes',
  'base_currency_code',
  'payee',
  'type',
] as const;

export type TransactionCsvColumn = (typeof TRANSACTION_CSV_COLUMNS)[number];
