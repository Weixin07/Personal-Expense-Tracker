/**
 * @jest-environment node
 */
import { DatabaseSync } from 'node:sqlite';
import type { SQLiteDatabase } from 'react-native-sqlite-storage';
import { adaptNodeSqlite } from '../../__tests__/test-utils/sqliteAdapter';
import { runMigrations } from '../migrations';
import {
  createTransactionsBulk,
  listTransactions,
} from '../repositories/transactionsRepository';
import { matchesQuery } from '../../utils/textSearch';
import type { NewTransactionRecord, TransactionRecord } from '../types';

/**
 * What SQLite's `LIKE` does with a search term, against a real engine rather
 * than a mocked statement — and that the in-memory predicate Home actually runs
 * selects the same rows for the same term.
 */
describe('searching transactions by free text', () => {
  let raw: DatabaseSync;
  let db: SQLiteDatabase;

  const row = (
    overrides: Partial<NewTransactionRecord> = {},
  ): NewTransactionRecord => ({
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
    ...overrides,
  });

  const fixtures: NewTransactionRecord[] = [
    row({ description: 'Morning coffee', payee: 'Costa' }),
    row({ description: 'Lunch', payee: 'Coffee House' }),
    row({ description: 'Fuel', payee: 'Shell', notes: 'Coffee on the way' }),
    row({ description: 'Rent', payee: 'Landlord' }),
    row({ description: '50% off sale', payee: 'Outlet' }),
    row({ description: 'a_b reference', payee: 'Supplier' }),
    row({ description: 'CAFÉ visit', payee: 'Nord Outlet' }),
    row({ description: 'costa  coffee', payee: 'Double space' }),
  ];

  const idsFromSql = async (query: string): Promise<number[]> =>
    (await listTransactions(db, { query })).map(record => record.id).sort();

  const idsFromMemory = async (query: string): Promise<number[]> => {
    const all = await listTransactions(db);
    return all
      .filter((record: TransactionRecord) =>
        matchesQuery([record.description, record.payee, record.notes], query),
      )
      .map(record => record.id)
      .sort();
  };

  beforeEach(async () => {
    raw = new DatabaseSync(':memory:');
    raw.exec('PRAGMA foreign_keys = ON');
    db = adaptNodeSqlite(raw);
    await runMigrations(db);
    await createTransactionsBulk(db, fixtures);
  });

  afterEach(() => {
    raw.close();
  });

  it('matches description, payee and notes alike', async () => {
    const descriptions = (await listTransactions(db, { query: 'coffee' })).map(
      record => record.description,
    );

    expect(descriptions).toHaveLength(4);
    expect(descriptions).toEqual(
      expect.arrayContaining([
        'Morning coffee',
        'Lunch',
        'Fuel',
        'costa  coffee',
      ]),
    );
  });

  it('does not drop rows whose notes are null', async () => {
    const matched = await listTransactions(db, { query: 'rent' });

    expect(matched).toHaveLength(1);
    expect(matched[0].notes).toBeNull();
  });

  it('treats wildcards in the term as literal characters', async () => {
    await expect(idsFromSql('50%')).resolves.toHaveLength(1);
    await expect(idsFromSql('a_b')).resolves.toHaveLength(1);
    // Were `_` unescaped it would match any single character, so this term
    // would also catch "a b" style text.
    await expect(idsFromSql('%')).resolves.toHaveLength(1);
  });

  it('ignores case for ASCII letters but not beyond them', async () => {
    await expect(idsFromSql('COSTA')).resolves.toHaveLength(2);
    // "CAFÉ visit" is stored uppercase. The ASCII letters fold, so "caf" finds
    // it, but the accented letter does not, so "café" does not.
    await expect(idsFromSql('caf')).resolves.toHaveLength(1);
    await expect(idsFromSql('café')).resolves.toHaveLength(0);
    await expect(idsFromSql('CAFÉ')).resolves.toHaveLength(1);
  });

  it('composes with the other filters rather than replacing them', async () => {
    const matched = await listTransactions(db, {
      query: 'coffee',
      startDate: '2025-01-15',
      endDate: '2025-01-15',
      type: 'expense',
    });

    expect(matched).toHaveLength(4);

    const noneInRange = await listTransactions(db, {
      query: 'coffee',
      startDate: '2025-02-01',
    });

    expect(noneInRange).toHaveLength(0);
  });

  it.each([
    'coffee',
    'COSTA',
    'café',
    'CAFÉ',
    '50%',
    'a_b',
    'costa  coffee',
    'costa coffee',
    'nothing here',
  ])('selects the same rows as the in-memory predicate for %p', async query => {
    const [fromSql, fromMemory] = await Promise.all([
      idsFromSql(query),
      idsFromMemory(query),
    ]);

    expect(fromSql).toEqual(fromMemory);
  });
});
