import type { SQLiteDatabase, ResultSet } from 'react-native-sqlite-storage';
import {
  upsertCurrencyFxRate,
  getCurrencyFxRate,
  listCurrencyFxRates,
} from '../currencyFxRatesRepository';

describe('currencyFxRatesRepository', () => {
  let mockDb: jest.Mocked<SQLiteDatabase>;

  beforeEach(() => {
    mockDb = {
      executeSql: jest.fn(),
    } as unknown as jest.Mocked<SQLiteDatabase>;
  });

  describe('upsertCurrencyFxRate', () => {
    it('upserts on the (base, currency) primary key', async () => {
      const mockResult: ResultSet = {
        insertId: undefined,
        rowsAffected: 1,
        rows: { length: 0, raw: () => [], item: () => null },
      };
      mockDb.executeSql.mockResolvedValueOnce([mockResult]);

      await upsertCurrencyFxRate(mockDb, 'USD', 'EUR', 1.1);

      expect(mockDb.executeSql).toHaveBeenCalledWith(
        expect.stringContaining(
          'ON CONFLICT(base_currency_code, currency_code) DO UPDATE SET',
        ),
        ['USD', 'EUR', 1.1],
      );
    });
  });

  describe('getCurrencyFxRate', () => {
    it('returns the cached rate when present', async () => {
      const row = {
        base_currency_code: 'USD',
        currency_code: 'EUR',
        fx_rate_to_base: 1.1,
        updated_at: '2025-01-15T10:00:00.000Z',
      };
      const mockResult: ResultSet = {
        insertId: undefined,
        rowsAffected: 0,
        rows: {
          length: 1,
          raw: () => [row],
          item: (index: number) => (index === 0 ? row : null),
        },
      };
      mockDb.executeSql.mockResolvedValueOnce([mockResult]);

      const result = await getCurrencyFxRate(mockDb, 'USD', 'EUR');

      expect(mockDb.executeSql).toHaveBeenCalledWith(
        expect.stringContaining('FROM currency_fx_rates'),
        ['USD', 'EUR'],
      );
      expect(result).toEqual({
        baseCurrencyCode: 'USD',
        currencyCode: 'EUR',
        fxRateToBase: 1.1,
        updatedAt: '2025-01-15T10:00:00.000Z',
      });
    });

    it('returns null when no cached rate exists', async () => {
      const mockResult: ResultSet = {
        insertId: undefined,
        rowsAffected: 0,
        rows: { length: 0, raw: () => [], item: () => null },
      };
      mockDb.executeSql.mockResolvedValueOnce([mockResult]);

      const result = await getCurrencyFxRate(mockDb, 'USD', 'JPY');

      expect(result).toBeNull();
    });
  });

  describe('listCurrencyFxRates', () => {
    it('maps every cached row to a record', async () => {
      const rows = [
        {
          base_currency_code: 'USD',
          currency_code: 'EUR',
          fx_rate_to_base: 1.1,
          updated_at: '2025-01-15T10:00:00.000Z',
        },
        {
          base_currency_code: 'USD',
          currency_code: 'GBP',
          fx_rate_to_base: 1.27,
          updated_at: '2025-01-16T10:00:00.000Z',
        },
      ];
      const mockResult: ResultSet = {
        insertId: undefined,
        rowsAffected: 0,
        rows: {
          length: 2,
          raw: () => rows,
          item: (index: number) => rows[index] ?? null,
        },
      };
      mockDb.executeSql.mockResolvedValueOnce([mockResult]);

      const result = await listCurrencyFxRates(mockDb);

      expect(result).toEqual([
        {
          baseCurrencyCode: 'USD',
          currencyCode: 'EUR',
          fxRateToBase: 1.1,
          updatedAt: '2025-01-15T10:00:00.000Z',
        },
        {
          baseCurrencyCode: 'USD',
          currencyCode: 'GBP',
          fxRateToBase: 1.27,
          updatedAt: '2025-01-16T10:00:00.000Z',
        },
      ]);
    });
  });
});
