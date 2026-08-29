import {
  findDefaultFund,
  fundCurrency,
  isDefaultFund,
  resolveTransferCurrency,
} from '../funds';
import type { FundRecord } from '../../database';

const fund = (overrides: Partial<FundRecord> = {}): FundRecord => ({
  id: 1,
  name: 'General',
  currencyCode: null,
  openingBalance: 0,
  notes: null,
  createdAt: '2026-01-01T00:00:00.000Z',
  updatedAt: '2026-01-01T00:00:00.000Z',
  ...overrides,
});

describe('findDefaultFund', () => {
  it('picks the lowest id rather than the first listed', () => {
    const funds = [
      fund({ id: 7, name: 'Travel' }),
      fund({ id: 2, name: 'Seeded' }),
      fund({ id: 9, name: 'Savings' }),
    ];

    expect(findDefaultFund(funds)?.id).toBe(2);
  });

  it('holds the same answer after the seeded fund is renamed', () => {
    const renamed = [fund({ id: 1, name: 'Everyday' }), fund({ id: 4 })];

    expect(findDefaultFund(renamed)?.id).toBe(1);
  });

  it('answers null for an empty list', () => {
    expect(findDefaultFund([])).toBeNull();
  });
});

describe('isDefaultFund', () => {
  const funds = [fund({ id: 3 }), fund({ id: 8, name: 'Travel' })];

  it('recognises the fallback fund', () => {
    expect(isDefaultFund(funds, 3)).toBe(true);
  });

  it('rejects every other fund', () => {
    expect(isDefaultFund(funds, 8)).toBe(false);
  });

  it('rejects a fund that is not in the list', () => {
    expect(isDefaultFund(funds, 99)).toBe(false);
  });

  it('rejects anything when there are no funds at all', () => {
    expect(isDefaultFund([], 1)).toBe(false);
  });
});

describe('fundCurrency', () => {
  it('prefers the fund’s own currency', () => {
    expect(fundCurrency(fund({ currencyCode: 'EUR' }), 'USD')).toBe('EUR');
  });

  it('follows the base currency when the fund names none', () => {
    expect(fundCurrency(fund({ currencyCode: null }), 'USD')).toBe('USD');
  });

  it('resolves to nothing while no base currency has been chosen', () => {
    expect(fundCurrency(fund({ currencyCode: null }), null)).toBeNull();
  });
});

describe('resolveTransferCurrency', () => {
  it('trusts the currency the row already recorded', () => {
    expect(
      resolveTransferCurrency(
        'EUR',
        fund({ currencyCode: 'MYR' }),
        'USD',
        'GBP',
      ),
    ).toBe('EUR');
  });

  it('falls back to the destination fund’s own currency', () => {
    expect(
      resolveTransferCurrency(
        null,
        fund({ currencyCode: 'MYR' }),
        'USD',
        'GBP',
      ),
    ).toBe('MYR');
  });

  it('falls back to the base currency the destination fund follows', () => {
    expect(
      resolveTransferCurrency(null, fund({ currencyCode: null }), 'USD', 'GBP'),
    ).toBe('USD');
  });

  it('falls back to the base currency when no destination fund is known', () => {
    expect(resolveTransferCurrency(null, null, 'USD', 'GBP')).toBe('USD');
  });

  it('falls back to the source currency, asserting a same-currency transfer', () => {
    expect(resolveTransferCurrency(null, null, null, 'GBP')).toBe('GBP');
  });

  it('never answers null, whatever it is given', () => {
    expect(
      resolveTransferCurrency(null, fund({ currencyCode: null }), null, 'GBP'),
    ).toBe('GBP');
  });
});
