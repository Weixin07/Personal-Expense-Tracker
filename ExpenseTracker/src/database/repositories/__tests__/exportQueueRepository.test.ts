import type { SQLiteDatabase, ResultSet } from 'react-native-sqlite-storage';
import {
  listExportQueue,
  insertExportQueueItem,
  updateExportQueueItem,
  updateExportQueueStatus,
  removeExportQueueItem,
  clearCompletedExportQueueItems,
} from '../exportQueueRepository';
import type { InsertExportQueueItem, UpdateExportQueueFields } from '../exportQueueRepository';

describe('exportQueueRepository', () => {
  let mockDb: jest.Mocked<SQLiteDatabase>;

  beforeEach(() => {
    mockDb = {
      executeSql: jest.fn(),
    } as unknown as jest.Mocked<SQLiteDatabase>;
  });

  describe('listExportQueue', () => {
    it('should return all export queue items ordered by creation date', async () => {
      const mockItems = [
        {
          id: 'exp-1',
          filename: 'export1.csv',
          filePath: '/path/to/export1.csv',
          fileUri: 'content://mock/export1.csv',
          status: 'pending',
          createdAt: '2025-01-15T10:00:00.000Z',
          updatedAt: '2025-01-15T10:00:00.000Z',
          uploadedAt: null,
          driveFileId: null,
          lastError: null,
        },
        {
          id: 'exp-2',
          filename: 'export2.csv',
          filePath: '/path/to/export2.csv',
          fileUri: 'content://mock/export2.csv',
          status: 'completed',
          createdAt: '2025-01-14T10:00:00.000Z',
          updatedAt: '2025-01-15T11:00:00.000Z',
          uploadedAt: '2025-01-15T11:00:00.000Z',
          driveFileId: 'drive-file-123',
          lastError: null,
        },
      ];

      const mockResult: ResultSet = {
        insertId: undefined,
        rowsAffected: 0,
        rows: {
          length: 2,
          raw: () => mockItems,
          item: (index: number) => mockItems[index] ?? null,
        },
      };

      mockDb.executeSql.mockResolvedValueOnce([mockResult]);

      const result = await listExportQueue(mockDb);

      expect(mockDb.executeSql).toHaveBeenCalledWith(
        expect.stringContaining('ORDER BY created_at ASC')
      );

      expect(result).toHaveLength(2);
      expect(result[0]).toEqual({
        id: 'exp-1',
        filename: 'export1.csv',
        filePath: '/path/to/export1.csv',
        fileUri: 'content://mock/export1.csv',
        status: 'pending',
        createdAt: '2025-01-15T10:00:00.000Z',
        updatedAt: '2025-01-15T10:00:00.000Z',
        uploadedAt: null,
        driveFileId: null,
        lastError: null,
      });
    });

    it('should return empty array when queue is empty', async () => {
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

      const result = await listExportQueue(mockDb);

      expect(result).toEqual([]);
    });
  });

  describe('insertExportQueueItem', () => {
    it('should insert a new export queue item', async () => {
      const newItem: InsertExportQueueItem = {
        id: 'exp-1',
        filename: 'export.csv',
        filePath: '/path/to/export.csv',
        fileUri: 'content://mock/export.csv',
        status: 'pending',
        lastError: null,
      };

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

      await insertExportQueueItem(mockDb, newItem);

      expect(mockDb.executeSql).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO export_queue'),
        [
          'exp-1',
          'export.csv',
          '/path/to/export.csv',
          'content://mock/export.csv',
          'pending',
          null,
        ]
      );
    });

    it('should handle null fileUri', async () => {
      const newItem: InsertExportQueueItem = {
        id: 'exp-2',
        filename: 'export.csv',
        filePath: '/path/to/export.csv',
        fileUri: null,
        status: 'pending',
      };

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

      await insertExportQueueItem(mockDb, newItem);

      expect(mockDb.executeSql).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO export_queue'),
        ['exp-2', 'export.csv', '/path/to/export.csv', null, 'pending', null]
      );
    });

    it('should include lastError if provided', async () => {
      const newItem: InsertExportQueueItem = {
        id: 'exp-3',
        filename: 'export.csv',
        filePath: '/path/to/export.csv',
        fileUri: 'content://mock/export.csv',
        status: 'failed',
        lastError: 'Upload failed',
      };

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

      await insertExportQueueItem(mockDb, newItem);

      expect(mockDb.executeSql).toHaveBeenCalledWith(
        expect.stringContaining('INSERT INTO export_queue'),
        [
          'exp-3',
          'export.csv',
          '/path/to/export.csv',
          'content://mock/export.csv',
          'failed',
          'Upload failed',
        ]
      );
    });
  });

  describe('updateExportQueueItem', () => {
    it('should update status', async () => {
      const updates: UpdateExportQueueFields = {
        status: 'uploading',
      };

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

      await updateExportQueueItem(mockDb, 'exp-1', updates);

      expect(mockDb.executeSql).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE export_queue SET status = ?'),
        ['uploading', 'exp-1']
      );
    });

    it('should update multiple fields', async () => {
      const updates: UpdateExportQueueFields = {
        status: 'completed',
        driveFileId: 'drive-123',
        uploadedAt: '2025-01-15T12:00:00.000Z',
        lastError: null,
      };

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

      await updateExportQueueItem(mockDb, 'exp-1', updates);

      expect(mockDb.executeSql).toHaveBeenCalledWith(
        expect.stringMatching(/status = \?.*last_error = \?.*drive_file_id = \?.*uploaded_at = \?/),
        ['completed', null, 'drive-123', '2025-01-15T12:00:00.000Z', 'exp-1']
      );
    });

    it('should handle null values in updates', async () => {
      const updates: UpdateExportQueueFields = {
        lastError: null,
        driveFileId: null,
        uploadedAt: null,
      };

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

      await updateExportQueueItem(mockDb, 'exp-1', updates);

      expect(mockDb.executeSql).toHaveBeenCalledWith(
        expect.stringMatching(/last_error = \?.*drive_file_id = \?.*uploaded_at = \?/),
        [null, null, null, 'exp-1']
      );
    });

    it('should do nothing if no fields provided', async () => {
      const updates: UpdateExportQueueFields = {};

      await updateExportQueueItem(mockDb, 'exp-1', updates);

      expect(mockDb.executeSql).not.toHaveBeenCalled();
    });

    it('should throw error if item not found', async () => {
      const updates: UpdateExportQueueFields = {
        status: 'uploading',
      };

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

      await expect(updateExportQueueItem(mockDb, 'non-existent', updates)).rejects.toThrow(
        'Export queue item non-existent not found'
      );
    });

    it('should update filePath and fileUri', async () => {
      const updates: UpdateExportQueueFields = {
        filePath: '/new/path/export.csv',
        fileUri: 'content://new/uri',
        filename: 'new-export.csv',
      };

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

      await updateExportQueueItem(mockDb, 'exp-1', updates);

      expect(mockDb.executeSql).toHaveBeenCalledWith(
        expect.stringMatching(/file_path = \?.*file_uri = \?.*filename = \?/),
        ['/new/path/export.csv', 'content://new/uri', 'new-export.csv', 'exp-1']
      );
    });
  });

  describe('updateExportQueueStatus', () => {
    it('should update status using updateExportQueueItem', async () => {
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

      await updateExportQueueStatus(mockDb, 'exp-1', 'uploading');

      expect(mockDb.executeSql).toHaveBeenCalledWith(
        expect.stringContaining('UPDATE export_queue SET status = ?'),
        ['uploading', 'exp-1']
      );
    });

    it('should update status with additional options', async () => {
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

      await updateExportQueueStatus(mockDb, 'exp-1', 'completed', {
        driveFileId: 'drive-123',
        uploadedAt: '2025-01-15T12:00:00.000Z',
        lastError: null,
      });

      expect(mockDb.executeSql).toHaveBeenCalledWith(
        expect.stringMatching(/status = \?.*last_error = \?.*drive_file_id = \?.*uploaded_at = \?/),
        ['completed', null, 'drive-123', '2025-01-15T12:00:00.000Z', 'exp-1']
      );
    });

    it('should update status to failed with error', async () => {
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

      await updateExportQueueStatus(mockDb, 'exp-1', 'failed', {
        lastError: 'Network error',
      });

      expect(mockDb.executeSql).toHaveBeenCalledWith(
        expect.stringMatching(/status = \?.*last_error = \?/),
        ['failed', 'Network error', 'exp-1']
      );
    });
  });

  describe('removeExportQueueItem', () => {
    it('should remove an export queue item', async () => {
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

      await removeExportQueueItem(mockDb, 'exp-1');

      expect(mockDb.executeSql).toHaveBeenCalledWith(
        'DELETE FROM export_queue WHERE id = ?',
        ['exp-1']
      );
    });

    it('should throw error if item not found', async () => {
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

      await expect(removeExportQueueItem(mockDb, 'non-existent')).rejects.toThrow(
        'Export queue item non-existent not found'
      );
    });
  });

  describe('clearCompletedExportQueueItems', () => {
    it('should remove all completed and failed items', async () => {
      const mockResult: ResultSet = {
        insertId: undefined,
        rowsAffected: 3,
        rows: {
          length: 0,
          raw: () => [],
          item: () => null,
        },
      };

      mockDb.executeSql.mockResolvedValueOnce([mockResult]);

      const result = await clearCompletedExportQueueItems(mockDb);

      expect(mockDb.executeSql).toHaveBeenCalledWith(
        expect.stringContaining("DELETE FROM export_queue WHERE status IN ('completed','failed')")
      );

      expect(result).toBe(3);
    });

    it('should return 0 when no items removed', async () => {
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

      const result = await clearCompletedExportQueueItems(mockDb);

      expect(result).toBe(0);
    });

    it('should handle undefined rowsAffected', async () => {
      const mockResult: ResultSet = {
        insertId: undefined,
        rowsAffected: undefined,
        rows: {
          length: 0,
          raw: () => [],
          item: () => null,
        },
      };

      mockDb.executeSql.mockResolvedValueOnce([mockResult]);

      const result = await clearCompletedExportQueueItems(mockDb);

      expect(result).toBe(0);
    });
  });
});
