import type { TransactionRecord, TransactionType } from '../database/types';
import { matchesQuery } from './textSearch';

export type TransactionFilters = {
  /**
   * Unlike `categoryId`, this has no null form: every transaction carries a
   * direction, so there is no "untyped" set to filter for.
   */
  type?: TransactionType;
  categoryId?: number | null;
  /**
   * Matches either side of a transfer, so money moved into the fund is part of
   * what the filter shows.
   */
  fundId?: number;
  /**
   * Narrows to transfers whose recorded amounts imply a rate their currencies
   * contradict. Has no false form: a filter that is not wanted is absent, which
   * is what every other member here means by omission.
   */
  needsReview?: true;
  startDate?: string;
  endDate?: string;
  /**
   * Free text matched anywhere in a transaction's description, payee or notes.
   * Stored trimmed, and never stored blank: a query that narrows nothing is
   * absent, which is what every other member here means by omission.
   */
  query?: string;
};

/**
 * The transactions matching every member of `filters` at once; an absent member
 * narrows nothing. `suspectTransferIds` supplies the review filter's membership,
 * since whether a transfer needs review is derived rather than stored.
 */
export const applyFilters = (
  transactions: TransactionRecord[],
  filters: TransactionFilters,
  suspectTransferIds: ReadonlySet<number>,
): TransactionRecord[] => {
  if (!transactions.length) {
    return transactions;
  }

  const hasCategoryFilter = Object.prototype.hasOwnProperty.call(
    filters,
    'categoryId',
  );
  const { type, categoryId, fundId, needsReview, startDate, endDate, query } =
    filters;

  return transactions.filter(transaction => {
    if (type !== undefined && transaction.type !== type) {
      return false;
    }

    if (needsReview && !suspectTransferIds.has(transaction.id)) {
      return false;
    }

    if (
      fundId !== undefined &&
      transaction.fundId !== fundId &&
      transaction.counterpartFundId !== fundId
    ) {
      return false;
    }

    if (hasCategoryFilter) {
      if (categoryId == null) {
        if (
          transaction.categoryId !== null &&
          transaction.categoryId !== undefined
        ) {
          return false;
        }
      } else if (transaction.categoryId !== categoryId) {
        return false;
      }
    }

    if (startDate && transaction.date < startDate) {
      return false;
    }

    if (endDate && transaction.date > endDate) {
      return false;
    }

    // Last, because scanning three strings costs more than any check above.
    if (
      query &&
      !matchesQuery(
        [transaction.description, transaction.payee, transaction.notes],
        query,
      )
    ) {
      return false;
    }

    return true;
  });
};
