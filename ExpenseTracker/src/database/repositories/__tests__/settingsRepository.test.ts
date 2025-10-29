import type { SQLiteDatabase, ResultSet } from 'react-native-sqlite-storage';
import {
  setSetting,
  getSetting,
  deleteSetting,
  getAllSettings,
} from '../settingsRepository';

describe('settingsRepository', () => {
  let mockDb: jest.Mocked<SQLiteDatabase>;

  beforeEach(() => {
    mockDb = {
      executeSql: jest.fn(),
    } as unknown as jest.Mocked<SQLiteDatabase>;
  });

  describe('setSetting', () => {
    it('should insert a new setting', async () => {
      const mockResult: ResultSet = {
        insertId: undefined,
        rowsAffected: 1,
        rows: {
          length: 0,
          raw: () => [],
          item: () => null,
        },
      };

      mockDb.executeSql.mockResolvedValueOnce([mockResult]);

      await setSetting(mockDb, 'theme', 'dark');

      expect(mockDb.executeSql).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO app_settings'),
        ['theme', 'dark']
      );
    });

    it('should update an existing setting (UPSERT)', async () => {
      const mockResult: ResultSet = {
        insertId: undefined,
        rowsAffected: 1,
        rows: {
          length: 0,
          raw: () => [],
          item: () => null,
        },
      };

      mockDb.executeSql.mockResolvedValueOnce([mockResult]);

      await setSetting(mockDb, 'theme', 'light');

      expect(mockDb.executeSql).toHaveBeenCalledWith(
        expect.stringContaining('ON CONFLICT(key) DO UPDATE SET value = excluded.value'),
        ['theme', 'light']
      );
    });

    it('should handle null values', async () => {
      const mockResult: ResultSet = {
        insertId: undefined,
        rowsAffected: 1,
        rows: {
          length: 0,
          raw: () => [],
          item: () => null,
        },
      };

      mockDb.executeSql.mockResolvedValueOnce([mockResult]);

      await setSetting(mockDb, 'optional_key', null);

      expect(mockDb.executeSql).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO app_settings'),
        ['optional_key', null]
      );
    });
  });

  describe('getSetting', () => {
    it('should return a setting value', async () => {
      const mockResult: ResultSet = {
        insertId: undefined,
        rowsAffected: 0,
        rows: {
          length: 1,
          raw: () => [{ value: 'dark' }],
          item: (index: number) => (index === 0 ? { value: 'dark' } : null),
        },
      };

      mockDb.executeSql.mockResolvedValueOnce([mockResult]);

      const result = await getSetting(mockDb, 'theme');

      expect(mockDb.executeSql).toHaveBeenCalledWith(
        expect.stringContaining('SELECT value FROM app_settings WHERE key = ?'),
        ['theme']
      );

      expect(result).toBe('dark');
    });

    it('should return null if setting not found', async () => {
      const mockResult: ResultSet = {
        insertId: undefined,
        rowsAffected: 0,
        rows: {
          length: 0,
          raw: () => [],
          item: () => null,
        },
      };

      mockDb.executeSql.mockResolvedValueOnce([mockResult]);

      const result = await getSetting(mockDb, 'non_existent');

      expect(result).toBeNull();
    });

    it('should return null if value is null', async () => {
      const mockResult: ResultSet = {
        insertId: undefined,
        rowsAffected: 0,
        rows: {
          length: 1,
          raw: () => [{ value: null }],
          item: (index: number) => (index === 0 ? { value: null } : null),
        },
      };

      mockDb.executeSql.mockResolvedValueOnce([mockResult]);

      const result = await getSetting(mockDb, 'optional_key');

      expect(result).toBeNull();
    });
  });

  describe('deleteSetting', () => {
    it('should delete a setting', async () => {
      const mockResult: ResultSet = {
        insertId: undefined,
        rowsAffected: 1,
        rows: {
          length: 0,
          raw: () => [],
          item: () => null,
        },
      };

      mockDb.executeSql.mockResolvedValueOnce([mockResult]);

      await deleteSetting(mockDb, 'theme');

      expect(mockDb.executeSql).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM app_settings WHERE key = ?'),
        ['theme']
      );
    });

    it('should not throw if setting does not exist', async () => {
      const mockResult: ResultSet = {
        insertId: undefined,
        rowsAffected: 0,
        rows: {
          length: 0,
          raw: () => [],
          item: () => null,
        },
      };

      mockDb.executeSql.mockResolvedValueOnce([mockResult]);

      await expect(deleteSetting(mockDb, 'non_existent')).resolves.toBeUndefined();
    });
  });

  describe('getAllSettings', () => {
    it('should return all settings sorted by key', async () => {
      const mockSettings = [
        { key: 'base_currency', value: 'USD' },
        { key: 'theme', value: 'dark' },
      ];

      const mockResult: ResultSet = {
        insertId: undefined,
        rowsAffected: 0,
        rows: {
          length: 2,
          raw: () => mockSettings,
          item: (index: number) => mockSettings[index] ?? null,
        },
      };

      mockDb.executeSql.mockResolvedValueOnce([mockResult]);

      const result = await getAllSettings(mockDb);

      expect(mockDb.executeSql).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY key ASC')
      );

      expect(result).toEqual([
        { key: 'base_currency', value: 'USD' },
        { key: 'theme', value: 'dark' },
      ]);
    });

    it('should return empty array when no settings exist', async () => {
      const mockResult: ResultSet = {
        insertId: undefined,
        rowsAffected: 0,
        rows: {
          length: 0,
          raw: () => [],
          item: () => null,
        },
      };

      mockDb.executeSql.mockResolvedValueOnce([mockResult]);

      const result = await getAllSettings(mockDb);

      expect(result).toEqual([]);
    });

    it('should handle null values in settings', async () => {
      const mockSettings = [
        { key: 'base_currency', value: 'USD' },
        { key: 'optional_key', value: null },
      ];

      const mockResult: ResultSet = {
        insertId: undefined,
        rowsAffected: 0,
        rows: {
          length: 2,
          raw: () => mockSettings,
          item: (index: number) => mockSettings[index] ?? null,
        },
      };

      mockDb.executeSql.mockResolvedValueOnce([mockResult]);

      const result = await getAllSettings(mockDb);

      expect(result).toEqual([
        { key: 'base_currency', value: 'USD' },
        { key: 'optional_key', value: null },
      ]);
    });
  });
});
