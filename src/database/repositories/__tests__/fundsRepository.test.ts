import type { ResultSet, SQLiteDatabase } from 'react-native-sqlite-storage';
import {
  createFund,
  deleteFund,
  getFundByName,
  listFunds,
  updateFund,
} from '../fundsRepository';

const rawFund = (overrides: Record<string, unknown> = {}) => ({
  id: 1,
  name: 'General',
  currency_code: null,
  opening_balance: 0,
  notes: null,
  created_at: '2025-01-01T00:00:00.000Z',
  updated_at: '2025-01-01T00:00:00.000Z',
  ...overrides,
});

const resultOf = (rows: Record<string, unknown>[], insertId?: number) =>
  [
    {
      insertId,
      rowsAffected: rows.length,
      rows: {
        length: rows.length,
        raw: () => rows,
        item: (index: number) => rows[index] ?? null,
      },
    } as unknown as ResultSet,
  ] as [ResultSet];

describe('fundsRepository', () => {
  let db: jest.Mocked<SQLiteDatabase>;

  beforeEach(() => {
    db = { executeSql: jest.fn() } as unknown as jest.Mocked<SQLiteDatabase>;
  });

  it('creates a fund and returns the stored record', async () => {
    db.executeSql
      .mockResolvedValueOnce(resultOf([], 7))
      .mockResolvedValueOnce(resultOf([rawFund({ id: 7, name: 'Travel' })]));

    const fund = await createFund(db, {
      name: '  Travel  ',
      currencyCode: 'EUR',
      openingBalance: 250,
      notes: null,
    });

    expect(db.executeSql).toHaveBeenNthCalledWith(
      1,
      expect.stringContaining('INSERT INTO funds'),
      ['Travel', 'EUR', 250, null],
    );
    expect(fund.id).toBe(7);
  });

  it('updates a fund and reloads it', async () => {
    db.executeSql
      .mockResolvedValueOnce(resultOf([rawFund()]))
      .mockResolvedValueOnce(resultOf([rawFund({ name: 'Household' })]));

    const fund = await updateFund(db, {
      id: 1,
      name: 'Household',
      currencyCode: null,
      openingBalance: 10,
      notes: null,
    });

    expect(fund.name).toBe('Household');
  });

  it('rejects an update to a fund that is not there', async () => {
    db.executeSql.mockResolvedValueOnce(resultOf([]));

    await expect(
      updateFund(db, {
        id: 99,
        name: 'Ghost',
        currencyCode: null,
        openingBalance: 0,
        notes: null,
      }),
    ).rejects.toThrow('Fund 99 not found');
  });

  it('looks a fund up by name without folding either side', async () => {
    db.executeSql.mockResolvedValueOnce(
      resultOf([rawFund({ name: 'Travel' })]),
    );

    const fund = await getFundByName(db, ' travel ');

    // The column is declared COLLATE NOCASE, so the database does the folding
    // and the same comparison backs the UNIQUE constraint.
    expect(db.executeSql).toHaveBeenCalledWith(
      expect.stringContaining('WHERE name = ?'),
      ['travel'],
    );
    expect(fund?.name).toBe('Travel');
  });

  it('maps a null currency to a fund that follows the base currency', async () => {
    db.executeSql.mockResolvedValueOnce(
      resultOf([rawFund({ currency_code: null })]),
    );

    const funds = await listFunds(db);

    expect(funds[0].currencyCode).toBeNull();
  });

  it('deletes by id', async () => {
    db.executeSql.mockResolvedValueOnce(resultOf([]));

    await deleteFund(db, 3);

    expect(db.executeSql).toHaveBeenCalledWith(
      'DELETE FROM funds WHERE id = ?',
      [3],
    );
  });
});
