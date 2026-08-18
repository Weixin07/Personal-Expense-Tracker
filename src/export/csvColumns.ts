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
  'time',
  'fund',
  'counterpart_fund',
  'counterpart_amount',
  'counterpart_currency',
] as const;

export type TransactionCsvColumn = (typeof TRANSACTION_CSV_COLUMNS)[number];
