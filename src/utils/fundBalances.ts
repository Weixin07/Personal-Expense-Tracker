import type { FundRecord, TransactionRecord } from '../database';
import { bankersRound } from './math';
import { fundCurrency, resolveTransferCurrency } from './funds';

export type FundBalanceFigure = {
  /** Currency this figure is denominated in, and the only scope it sums over. */
  currencyCode: string | null;
  balance: number;
};

/**
 * A fund's standing, spanning its whole history rather than the filtered view:
 * a balance that moved with the date filter would describe a period, not a pot.
 *
 * Figures are grouped by the currency each amount was recorded in, since
 * amounts in different currencies cannot be added. Every fund carries at least
 * one figure — its opening balance, under the fund's own currency — and a
 * figure that nets to zero is reported rather than dropped, so a pot whose
 * denomination and activity disagree says so. The fund's own currency leads and
 * the rest follow in ascending order.
 */
export type FundBalance = {
  fundId: number;
  byCurrency: FundBalanceFigure[];
};

const compareFigures =
  (ownCurrency: string | null) =>
  (a: FundBalanceFigure, b: FundBalanceFigure): number => {
    const rank = (currencyCode: string | null) =>
      currencyCode === ownCurrency ? 0 : 1;

    return (
      rank(a.currencyCode) - rank(b.currencyCode) ||
      (a.currencyCode ?? '').localeCompare(b.currencyCode ?? '')
    );
  };

/**
 * Running balance per fund: opening balance, plus income, less spending, plus
 * or minus what transfers moved, each in the currency it was recorded in.
 *
 * A transfer's destination receives `counterpartAmount` — the figure that
 * arrived — rather than what left, so the two legs are never added together and
 * no exchange rate is applied here.
 *
 * The shape and ordering of the result are described on `FundBalance`.
 */
export const calculateFundBalances = (
  funds: readonly FundRecord[],
  transactions: readonly TransactionRecord[],
  baseCurrency: string | null,
): FundBalance[] => {
  const fundsById = new Map<number, FundRecord>();
  funds.forEach(fund => {
    fundsById.set(fund.id, fund);
  });

  const perFund = new Map<number, Map<string | null, number>>();

  const contribute = (
    fundId: number,
    currencyCode: string | null,
    amount: number,
  ): void => {
    const byCurrency = perFund.get(fundId) ?? new Map<string | null, number>();
    byCurrency.set(currencyCode, (byCurrency.get(currencyCode) ?? 0) + amount);
    perFund.set(fundId, byCurrency);
  };

  funds.forEach(fund => {
    contribute(fund.id, fundCurrency(fund, baseCurrency), fund.openingBalance);
  });

  transactions.forEach(transaction => {
    if (transaction.type === 'transfer') {
      contribute(
        transaction.fundId,
        transaction.currencyCode,
        -transaction.amountNative,
      );
      // Resolved rather than read from the destination fund, under the rule on
      // `TransactionRecord.counterpartCurrencyCode`.
      if (
        transaction.counterpartFundId != null &&
        transaction.counterpartAmount != null
      ) {
        contribute(
          transaction.counterpartFundId,
          resolveTransferCurrency(
            transaction.counterpartCurrencyCode,
            fundsById.get(transaction.counterpartFundId) ?? null,
            baseCurrency,
            transaction.currencyCode,
          ),
          transaction.counterpartAmount,
        );
      }
      return;
    }
    contribute(
      transaction.fundId,
      transaction.currencyCode,
      transaction.type === 'income'
        ? transaction.amountNative
        : -transaction.amountNative,
    );
  });

  return funds.map(fund => {
    const ownCurrency = fundCurrency(fund, baseCurrency);
    return {
      fundId: fund.id,
      byCurrency: Array.from(perFund.get(fund.id)?.entries() ?? [])
        .map(([currencyCode, balance]) => ({
          currencyCode,
          balance: bankersRound(balance, 2),
        }))
        .sort(compareFigures(ownCurrency)),
    };
  });
};
