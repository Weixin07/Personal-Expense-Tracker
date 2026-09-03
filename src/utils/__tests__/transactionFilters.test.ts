import { applyFilters } from '../transactionFilters';
import type { TransactionFilters } from '../transactionFilters';
import type { TransactionRecord } from '../../database/types';

const record = (overrides: Partial<TransactionRecord>): TransactionRecord => ({
  id: 1,
  type: 'expense',
  description: '',
  payee: '',
  amountNative: 10,
  currencyCode: 'USD',
  fxRateToBase: 1,
  baseAmount: 10,
  baseCurrencyCode: 'USD',
  date: '2025-01-15',
  time: null,
  categoryId: null,
  fundId: 1,
  counterpartFundId: null,
  counterpartAmount: null,
  counterpartCurrencyCode: null,
  notes: null,
  createdAt: '2025-01-15T00:00:00.000Z',
  updatedAt: '2025-01-15T00:00:00.000Z',
  ...overrides,
});

const coffee = record({
  id: 1,
  description: 'Morning coffee',
  payee: 'Costa',
  categoryId: 3,
  fundId: 1,
});
const fuel = record({
  id: 2,
  type: 'income',
  description: 'Fuel refund',
  payee: 'Shell',
  notes: 'Coffee on the way',
  categoryId: 5,
  fundId: 2,
  date: '2025-03-10',
});
const rent = record({
  id: 3,
  description: 'Rent',
  payee: 'Landlord',
  categoryId: null,
  fundId: 1,
  date: '2025-02-01',
});
const topUp = record({
  id: 4,
  type: 'transfer',
  description: 'Coffee pot top-up',
  fundId: 1,
  counterpartFundId: 2,
  counterpartAmount: 5,
  counterpartCurrencyCode: 'USD',
});

const ledger = [coffee, fuel, rent, topUp];
const NO_SUSPECTS: ReadonlySet<number> = new Set();

const idsFor = (
  filters: TransactionFilters,
  suspects: ReadonlySet<number> = NO_SUSPECTS,
): number[] => applyFilters(ledger, filters, suspects).map(entry => entry.id);

describe('applyFilters', () => {
  it('returns everything when no filter is set', () => {
    expect(idsFor({})).toEqual([1, 2, 3, 4]);
  });

  it('returns the same array when there is nothing to filter', () => {
    const empty: TransactionRecord[] = [];

    expect(applyFilters(empty, { query: 'coffee' }, NO_SUSPECTS)).toBe(empty);
  });

  it('narrows by type', () => {
    expect(idsFor({ type: 'income' })).toEqual([2]);
  });

  it('narrows by category, and by the absence of one', () => {
    expect(idsFor({ categoryId: 5 })).toEqual([2]);
    expect(idsFor({ categoryId: null })).toEqual([3, 4]);
  });

  it('narrows by fund, counting either side of a transfer', () => {
    expect(idsFor({ fundId: 2 })).toEqual([2, 4]);
  });

  it('narrows by date bounds', () => {
    expect(idsFor({ startDate: '2025-02-01' })).toEqual([2, 3]);
    expect(idsFor({ endDate: '2025-01-31' })).toEqual([1, 4]);
  });

  it('narrows to the transfers a caller reports as needing review', () => {
    expect(idsFor({ needsReview: true }, new Set([4]))).toEqual([4]);
    expect(idsFor({ needsReview: true })).toEqual([]);
  });

  it('matches a query against description, payee and notes alike', () => {
    expect(idsFor({ query: 'coffee' })).toEqual([1, 2, 4]);
    expect(idsFor({ query: 'costa' })).toEqual([1]);
    expect(idsFor({ query: 'on the way' })).toEqual([2]);
  });

  it('ignores case for ASCII letters but not beyond them', () => {
    expect(idsFor({ query: 'COFFEE' })).toEqual([1, 2, 4]);
    expect(
      applyFilters(
        [record({ description: 'CAFÉ' })],
        { query: 'café' },
        NO_SUSPECTS,
      ),
    ).toEqual([]);
  });

  it('matches a query literally rather than word by word', () => {
    expect(idsFor({ query: 'morning coffee' })).toEqual([1]);
    expect(idsFor({ query: 'coffee morning' })).toEqual([]);
  });

  it('keeps rows whose notes are null', () => {
    expect(idsFor({ query: 'rent' })).toEqual([3]);
  });

  it('composes a query with every other filter rather than replacing them', () => {
    expect(idsFor({ query: 'coffee', type: 'income' })).toEqual([2]);
    expect(idsFor({ query: 'coffee', categoryId: null })).toEqual([4]);
    expect(idsFor({ query: 'coffee', fundId: 2 })).toEqual([2, 4]);
    expect(idsFor({ query: 'coffee', endDate: '2025-01-31' })).toEqual([1, 4]);
    expect(
      idsFor({ query: 'coffee', needsReview: true }, new Set([4])),
    ).toEqual([4]);
  });
});
