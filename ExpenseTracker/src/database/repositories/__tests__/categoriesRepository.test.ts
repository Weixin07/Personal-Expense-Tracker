import type { SQLiteDatabase, ResultSet } from 'react-native-sqlite-storage';
import {
  createCategory,
  updateCategory,
  deleteCategory,
  getCategoryById,
  getCategoryByName,
  listCategories,
} from '../categoriesRepository';
import type { NewCategoryRecord, UpdateCategoryRecord } from '../../types';

describe('categoriesRepository', () => {
  let mockDb: jest.Mocked<SQLiteDatabase>;

  beforeEach(() => {
    mockDb = {
      executeSql: jest.fn(),
    } as unknown as jest.Mocked<SQLiteDatabase>;
  });

  describe('createCategory', () => {
    it('should create a category and return the created record', async () => {
      const newCategory: NewCategoryRecord = {
        name: 'Food',
      };

      const mockInsertResult: ResultSet = {
        insertId: 1,
        rowsAffected: 1,
        rows: {
          length: 0,
          raw: () => [],
          item: () => null,
        },
      };

      const mockCategory = {
        id: 1,
        name: 'Food',
        created_at: '2025-01-15T10:00:00.000Z',
        updated_at: '2025-01-15T10:00:00.000Z',
      };

      const mockSelectResult: ResultSet = {
        insertId: undefined,
        rowsAffected: 0,
        rows: {
          length: 1,
          raw: () => [mockCategory],
          item: (index: number) => (index === 0 ? mockCategory : null),
        },
      };

      mockDb.executeSql
        .mockResolvedValueOnce([mockInsertResult])
        .mockResolvedValueOnce([mockSelectResult]);

      const result = await createCategory(mockDb, newCategory);

      expect(mockDb.executeSql).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO categories'),
        ['Food']
      );

      expect(result).toEqual({
        id: 1,
        name: 'Food',
        createdAt: '2025-01-15T10:00:00.000Z',
        updatedAt: '2025-01-15T10:00:00.000Z',
      });
    });

    it('should trim the category name', async () => {
      const newCategory: NewCategoryRecord = {
        name: '  Food  ',
      };

      const mockInsertResult: ResultSet = {
        insertId: 1,
        rowsAffected: 1,
        rows: {
          length: 0,
          raw: () => [],
          item: () => null,
        },
      };

      const mockCategory = {
        id: 1,
        name: 'Food',
        created_at: '2025-01-15T10:00:00.000Z',
        updated_at: '2025-01-15T10:00:00.000Z',
      };

      const mockSelectResult: ResultSet = {
        insertId: undefined,
        rowsAffected: 0,
        rows: {
          length: 1,
          raw: () => [mockCategory],
          item: (index: number) => (index === 0 ? mockCategory : null),
        },
      };

      mockDb.executeSql
        .mockResolvedValueOnce([mockInsertResult])
        .mockResolvedValueOnce([mockSelectResult]);

      await createCategory(mockDb, newCategory);

      expect(mockDb.executeSql).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO categories'),
        ['Food']
      );
    });

    it('should throw error if insertId is not returned', async () => {
      const newCategory: NewCategoryRecord = {
        name: 'Food',
      };

      const mockInsertResult: ResultSet = {
        insertId: undefined,
        rowsAffected: 1,
        rows: {
          length: 0,
          raw: () => [],
          item: () => null,
        },
      };

      mockDb.executeSql.mockResolvedValueOnce([mockInsertResult]);

      await expect(createCategory(mockDb, newCategory)).rejects.toThrow(
        'Failed to create category'
      );
    });

    it('should throw error if category cannot be loaded after insert', async () => {
      const newCategory: NewCategoryRecord = {
        name: 'Food',
      };

      const mockInsertResult: ResultSet = {
        insertId: 1,
        rowsAffected: 1,
        rows: {
          length: 0,
          raw: () => [],
          item: () => null,
        },
      };

      const mockSelectResult: ResultSet = {
        insertId: undefined,
        rowsAffected: 0,
        rows: {
          length: 0,
          raw: () => [],
          item: () => null,
        },
      };

      mockDb.executeSql
        .mockResolvedValueOnce([mockInsertResult])
        .mockResolvedValueOnce([mockSelectResult]);

      await expect(createCategory(mockDb, newCategory)).rejects.toThrow(
        'Failed to load created category'
      );
    });
  });

  describe('updateCategory', () => {
    it('should update a category and return the updated record', async () => {
      const updatePayload: UpdateCategoryRecord = {
        id: 1,
        name: 'Updated Food',
      };

      const mockUpdateResult: ResultSet = {
        insertId: undefined,
        rowsAffected: 1,
        rows: {
          length: 0,
          raw: () => [],
          item: () => null,
        },
      };

      const mockCategory = {
        id: 1,
        name: 'Updated Food',
        created_at: '2025-01-15T10:00:00.000Z',
        updated_at: '2025-01-16T10:00:00.000Z',
      };

      const mockSelectResult: ResultSet = {
        insertId: undefined,
        rowsAffected: 0,
        rows: {
          length: 1,
          raw: () => [mockCategory],
          item: (index: number) => (index === 0 ? mockCategory : null),
        },
      };

      mockDb.executeSql
        .mockResolvedValueOnce([mockUpdateResult])
        .mockResolvedValueOnce([mockSelectResult]);

      const result = await updateCategory(mockDb, updatePayload);

      expect(mockDb.executeSql).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE categories'),
        ['Updated Food', 1]
      );

      expect(result).toEqual({
        id: 1,
        name: 'Updated Food',
        createdAt: '2025-01-15T10:00:00.000Z',
        updatedAt: '2025-01-16T10:00:00.000Z',
      });
    });

    it('should trim the category name', async () => {
      const updatePayload: UpdateCategoryRecord = {
        id: 1,
        name: '  Updated Food  ',
      };

      const mockUpdateResult: ResultSet = {
        insertId: undefined,
        rowsAffected: 1,
        rows: {
          length: 0,
          raw: () => [],
          item: () => null,
        },
      };

      const mockCategory = {
        id: 1,
        name: 'Updated Food',
        created_at: '2025-01-15T10:00:00.000Z',
        updated_at: '2025-01-16T10:00:00.000Z',
      };

      const mockSelectResult: ResultSet = {
        insertId: undefined,
        rowsAffected: 0,
        rows: {
          length: 1,
          raw: () => [mockCategory],
          item: (index: number) => (index === 0 ? mockCategory : null),
        },
      };

      mockDb.executeSql
        .mockResolvedValueOnce([mockUpdateResult])
        .mockResolvedValueOnce([mockSelectResult]);

      await updateCategory(mockDb, updatePayload);

      expect(mockDb.executeSql).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE categories'),
        ['Updated Food', 1]
      );
    });

    it('should throw error if category not found', async () => {
      const updatePayload: UpdateCategoryRecord = {
        id: 999,
        name: 'Non-existent',
      };

      const mockUpdateResult: ResultSet = {
        insertId: undefined,
        rowsAffected: 0,
        rows: {
          length: 0,
          raw: () => [],
          item: () => null,
        },
      };

      mockDb.executeSql.mockResolvedValueOnce([mockUpdateResult]);

      await expect(updateCategory(mockDb, updatePayload)).rejects.toThrow(
        'Category 999 not found'
      );
    });

    it('should throw error if category cannot be loaded after update', async () => {
      const updatePayload: UpdateCategoryRecord = {
        id: 1,
        name: 'Updated Food',
      };

      const mockUpdateResult: ResultSet = {
        insertId: undefined,
        rowsAffected: 1,
        rows: {
          length: 0,
          raw: () => [],
          item: () => null,
        },
      };

      const mockSelectResult: ResultSet = {
        insertId: undefined,
        rowsAffected: 0,
        rows: {
          length: 0,
          raw: () => [],
          item: () => null,
        },
      };

      mockDb.executeSql
        .mockResolvedValueOnce([mockUpdateResult])
        .mockResolvedValueOnce([mockSelectResult]);

      await expect(updateCategory(mockDb, updatePayload)).rejects.toThrow(
        'Failed to load updated category'
      );
    });
  });

  describe('deleteCategory', () => {
    it('should delete a category', async () => {
      const mockDeleteResult: ResultSet = {
        insertId: undefined,
        rowsAffected: 1,
        rows: {
          length: 0,
          raw: () => [],
          item: () => null,
        },
      };

      mockDb.executeSql.mockResolvedValueOnce([mockDeleteResult]);

      await deleteCategory(mockDb, 1);

      expect(mockDb.executeSql).toHaveBeenCalledWith(
        expect.stringContaining('DELETE FROM categories WHERE id = ?'),
        [1]
      );
    });

    it('should not throw error even if category not found', async () => {
      const mockDeleteResult: ResultSet = {
        insertId: undefined,
        rowsAffected: 0,
        rows: {
          length: 0,
          raw: () => [],
          item: () => null,
        },
      };

      mockDb.executeSql.mockResolvedValueOnce([mockDeleteResult]);

      // Should not throw
      await expect(deleteCategory(mockDb, 999)).resolves.toBeUndefined();
    });
  });

  describe('getCategoryById', () => {
    it('should return a category by id', async () => {
      const mockCategory = {
        id: 1,
        name: 'Food',
        created_at: '2025-01-15T10:00:00.000Z',
        updated_at: '2025-01-15T10:00:00.000Z',
      };

      const mockSelectResult: ResultSet = {
        insertId: undefined,
        rowsAffected: 0,
        rows: {
          length: 1,
          raw: () => [mockCategory],
          item: (index: number) => (index === 0 ? mockCategory : null),
        },
      };

      mockDb.executeSql.mockResolvedValueOnce([mockSelectResult]);

      const result = await getCategoryById(mockDb, 1);

      expect(mockDb.executeSql).toHaveBeenCalledWith(
        expect.stringContaining('SELECT'),
        [1]
      );

      expect(result).toEqual({
        id: 1,
        name: 'Food',
        createdAt: '2025-01-15T10:00:00.000Z',
        updatedAt: '2025-01-15T10:00:00.000Z',
      });
    });

    it('should return null if category not found', async () => {
      const mockSelectResult: ResultSet = {
        insertId: undefined,
        rowsAffected: 0,
        rows: {
          length: 0,
          raw: () => [],
          item: () => null,
        },
      };

      mockDb.executeSql.mockResolvedValueOnce([mockSelectResult]);

      const result = await getCategoryById(mockDb, 999);

      expect(result).toBeNull();
    });
  });

  describe('getCategoryByName', () => {
    it('should return a category by name (case-insensitive)', async () => {
      const mockCategory = {
        id: 1,
        name: 'Food',
        created_at: '2025-01-15T10:00:00.000Z',
        updated_at: '2025-01-15T10:00:00.000Z',
      };

      const mockSelectResult: ResultSet = {
        insertId: undefined,
        rowsAffected: 0,
        rows: {
          length: 1,
          raw: () => [mockCategory],
          item: (index: number) => (index === 0 ? mockCategory : null),
        },
      };

      mockDb.executeSql.mockResolvedValueOnce([mockSelectResult]);

      const result = await getCategoryByName(mockDb, 'FOOD');

      expect(mockDb.executeSql).toHaveBeenCalledWith(
        expect.stringContaining('LOWER(name) = LOWER(?)'),
        ['FOOD']
      );

      expect(result).toEqual({
        id: 1,
        name: 'Food',
        createdAt: '2025-01-15T10:00:00.000Z',
        updatedAt: '2025-01-15T10:00:00.000Z',
      });
    });

    it('should trim the name before searching', async () => {
      const mockCategory = {
        id: 1,
        name: 'Food',
        created_at: '2025-01-15T10:00:00.000Z',
        updated_at: '2025-01-15T10:00:00.000Z',
      };

      const mockSelectResult: ResultSet = {
        insertId: undefined,
        rowsAffected: 0,
        rows: {
          length: 1,
          raw: () => [mockCategory],
          item: (index: number) => (index === 0 ? mockCategory : null),
        },
      };

      mockDb.executeSql.mockResolvedValueOnce([mockSelectResult]);

      await getCategoryByName(mockDb, '  Food  ');

      expect(mockDb.executeSql).toHaveBeenCalledWith(
        expect.stringContaining('LOWER(name) = LOWER(?)'),
        ['Food']
      );
    });

    it('should return null if category not found', async () => {
      const mockSelectResult: ResultSet = {
        insertId: undefined,
        rowsAffected: 0,
        rows: {
          length: 0,
          raw: () => [],
          item: () => null,
        },
      };

      mockDb.executeSql.mockResolvedValueOnce([mockSelectResult]);

      const result = await getCategoryByName(mockDb, 'Non-existent');

      expect(result).toBeNull();
    });
  });

  describe('listCategories', () => {
    it('should return all categories sorted by name', async () => {
      const mockCategories = [
        {
          id: 1,
          name: 'Food',
          created_at: '2025-01-15T10:00:00.000Z',
          updated_at: '2025-01-15T10:00:00.000Z',
        },
        {
          id: 2,
          name: 'Transport',
          created_at: '2025-01-15T10:00:00.000Z',
          updated_at: '2025-01-15T10:00:00.000Z',
        },
      ];

      const mockSelectResult: ResultSet = {
        insertId: undefined,
        rowsAffected: 0,
        rows: {
          length: 2,
          raw: () => mockCategories,
          item: (index: number) => mockCategories[index] ?? null,
        },
      };

      mockDb.executeSql.mockResolvedValueOnce([mockSelectResult]);

      const result = await listCategories(mockDb);

      expect(mockDb.executeSql).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY name COLLATE NOCASE ASC')
      );

      expect(result).toHaveLength(2);
      expect(result[0].name).toBe('Food');
      expect(result[1].name).toBe('Transport');
    });

    it('should return empty array when no categories exist', async () => {
      const mockSelectResult: ResultSet = {
        insertId: undefined,
        rowsAffected: 0,
        rows: {
          length: 0,
          raw: () => [],
          item: () => null,
        },
      };

      mockDb.executeSql.mockResolvedValueOnce([mockSelectResult]);

      const result = await listCategories(mockDb);

      expect(result).toEqual([]);
    });
  });
});
