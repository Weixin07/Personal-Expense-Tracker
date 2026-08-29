import type {
  CurrencyFxRateRecord,
  FundRecord,
  TransactionRecord,
} from '../database';
import { formatSignedMoney } from './formatting';
import { bankersRound } from './math';
import { fundCurrency } from './funds';
import { convertToCurrency } from './fxRates';

/**
 * Whether a fund's standing was expressed in its own currency, or left as the
 * base-currency subtotals it was built from because at least one of them could
 * not be converted.
 */
export type FundBalanceBasis = 'converted' | 'unconverted';

export type FundBalanceFigure = {
  /** Currency this figure is denominated in, and the only scope it sums over. */
  currencyCode: string | null;
  balance: number;
};

/**
 * A fund's standing, spanning its whole history rather than the filtered view:
 * a balance that moved with the date filter would describe a period, not a pot.
 *
 * `converted` carries exactly one figure, denominated in the fund's own
 * currency. `unconverted` carries one per base currency the fund's history was
 * recorded against, unsummed. Either way a figure in the fund's own currency is
 * always present — reported even when it nets to zero, so a pot whose
 * denomination and activity disagree says so — and leads, the rest following in
 * ascending order.
 */
export type FundBalance = {
  fundId: number;
  basis: FundBalanceBasis;
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
 * or minus what transfers moved, each measured by its recorded `baseAmount`.
 *
 * A transfer's destination receives the same `baseAmount` its source gives up,
 * so `counterpartAmount` — what the user observed arriving — never reaches a
 * balance, and a cross-currency transfer that lost a fee reports no loss.
 *
 * Subtotals convert into the fund's own currency at the currently cached rate,
 * so a fund denominated differently from the base currency restates itself
 * when a newer rate is saved. One subtotal the cache cannot cover leaves every
 * one of them unconverted rather than part of them.
 */
export const calculateFundBalances = ({
  funds,
  transactions,
  baseCurrency,
  cachedRates,
}: {
  funds: readonly FundRecord[];
  transactions: readonly TransactionRecord[];
  baseCurrency: string | null;
  cachedRates: readonly CurrencyFxRateRecord[];
}): FundBalance[] => {
  const perFund = new Map<number, Map<string | null, number>>();

  const contribute = (
    fundId: number,
    baseCurrencyCode: string | null,
    amount: number,
  ): void => {
    const byBase = perFund.get(fundId) ?? new Map<string | null, number>();
    byBase.set(baseCurrencyCode, (byBase.get(baseCurrencyCode) ?? 0) + amount);
    perFund.set(fundId, byBase);
  };

  transactions.forEach(transaction => {
    const baseKey = transaction.baseCurrencyCode ?? null;

    if (transaction.type === 'transfer') {
      contribute(transaction.fundId, baseKey, -transaction.baseAmount);
      if (transaction.counterpartFundId != null) {
        contribute(
          transaction.counterpartFundId,
          baseKey,
          transaction.baseAmount,
        );
      }
      return;
    }

    contribute(
      transaction.fundId,
      baseKey,
      transaction.type === 'income'
        ? transaction.baseAmount
        : -transaction.baseAmount,
    );
  });

  return funds.map(fund => {
    const ownCurrency = fundCurrency(fund, baseCurrency);
    const subtotals = Array.from(perFund.get(fund.id)?.entries() ?? []);

    // Null once any subtotal cannot be converted, so a fund is reported whole
    // in its own currency or not at all.
    const total = subtotals.reduce<number | null>(
      (running, [baseCurrencyCode, subtotal]) => {
        if (running === null || baseCurrencyCode === null) {
          return null;
        }
        const figure = convertToCurrency(
          subtotal,
          ownCurrency,
          baseCurrencyCode,
          cachedRates,
        );
        return figure === null ? null : running + figure;
      },
      fund.openingBalance,
    );

    if (total !== null) {
      return {
        fundId: fund.id,
        basis: 'converted' as const,
        byCurrency: [
          { currencyCode: ownCurrency, balance: bankersRound(total, 2) },
        ],
      };
    }

    const byCurrency = new Map(subtotals);
    byCurrency.set(
      ownCurrency,
      (byCurrency.get(ownCurrency) ?? 0) + fund.openingBalance,
    );

    return {
      fundId: fund.id,
      basis: 'unconverted' as const,
      byCurrency: Array.from(byCurrency.entries())
        .map(([currencyCode, balance]) => ({
          currencyCode,
          balance: bankersRound(balance, 2),
        }))
        .sort(compareFigures(ownCurrency)),
    };
  });
};

/** Whether the formatted line will be read by eye or spoken aloud. */
export type FundBalanceMarker = 'glyph' | 'text';

const MARKERS: Record<FundBalanceMarker, { separator: string; note: string }> =
  {
    glyph: { separator: ' · ', note: '  ⚠ unconverted' },
    text: { separator: ', ', note: ', unconverted' },
  };

/**
 * A fund's standing as one line. `text` is for a label a screen reader speaks,
 * where the glyph would be announced inconsistently or dropped; `glyph` is for
 * anything read by eye.
 */
export const formatFundBalance = (
  balance: FundBalance,
  { marker = 'glyph' }: { marker?: FundBalanceMarker } = {},
): string => {
  const { separator, note } = MARKERS[marker];
  const figures = balance.byCurrency
    .map(figure => formatSignedMoney(figure.balance, figure.currencyCode))
    .join(separator);

  return balance.basis === 'converted' ? figures : `${figures}${note}`;
};
