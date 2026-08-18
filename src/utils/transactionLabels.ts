export const formatExpenseCount = (count: number): string =>
  `${count} expense${count === 1 ? '' : 's'}`;

/** "Income" is a mass noun, so a counted noun carries the number instead. */
export const formatIncomeCount = (count: number): string =>
  `${count} income ${count === 1 ? 'entry' : 'entries'}`;

export const formatTransferCount = (count: number): string =>
  `${count} transfer${count === 1 ? '' : 's'}`;
