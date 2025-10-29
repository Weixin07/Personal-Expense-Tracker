import { uploadPendingExports } from '../driveUploader';
import type { ExportQueueRecord } from '../../database';
import * as database from '../../database';
import * as googleAuth from '../../security/googleAuth';
import * as storageAccess from '../../security/storageAccess';
import RNFS from 'react-native-fs';

jest.mock('../../database');
jest.mock('../../security/googleAuth');
jest.mock('../../security/storageAccess');

// Mock fetch globally
global.fetch = jest.fn();

describe('driveUploader', () => {
  const mockDb = {} as any;

  beforeEach(() => {
    jest.clearAllMocks();

    // Default mock for withDatabase
    (database.withDatabase as jest.Mock).mockImplementation(async (callback) => {
      return callback(mockDb);
    });
  });

  describe('uploadPendingExports', () => {
    it('should return early if no pending items exist', async () => {
      (database.listExportQueue as jest.Mock).mockResolvedValue([]);

      const result = await uploadPendingExports();

      expect(result).toEqual({
        attempted: 0,
        uploaded: 0,
        failed: 0,
        skipped: 0,
        errors: [],
        requiresAuth: false,
      });

      expect(googleAuth.ensureValidAccessToken).not.toHaveBeenCalled();
    });

    it('should skip all items if access token is not available', async () => {
      const pendingItems: ExportQueueRecord[] = [
        {
          id: 'exp-1',
          filename: 'export1.csv',
          filePath: '/path/export1.csv',
          fileUri: 'content://mock/export1.csv',
          status: 'pending',
          createdAt: '2025-01-15T10:00:00.000Z',
          updatedAt: '2025-01-15T10:00:00.000Z',
          uploadedAt: null,
          driveFileId: null,
          lastError: null,
        },
      ];

      (database.listExportQueue as jest.Mock).mockResolvedValue(pendingItems);
      (googleAuth.ensureValidAccessToken as jest.Mock).mockResolvedValue(null);

      const result = await uploadPendingExports({ interactive: false });

      expect(result).toEqual({
        attempted: 1,
        uploaded: 0,
        failed: 0,
        skipped: 1,
        errors: [],
        requiresAuth: true,
      });
    });

    it('should successfully upload a pending export', async () => {
      const pendingItems: ExportQueueRecord[] = [
        {
          id: 'exp-1',
          filename: 'export1.csv',
          filePath: '/path/export1.csv',
          fileUri: 'content://mock/export1.csv',
          status: 'pending',
          createdAt: '2025-01-15T10:00:00.000Z',
          updatedAt: '2025-01-15T10:00:00.000Z',
          uploadedAt: null,
          driveFileId: null,
          lastError: null,
        },
      ];

      (database.listExportQueue as jest.Mock).mockResolvedValue(pendingItems);
      (googleAuth.ensureValidAccessToken as jest.Mock).mockResolvedValue('mock-access-token');
      (database.getSetting as jest.Mock).mockResolvedValue('mock-folder-id');
      (storageAccess.readFileAsBase64 as jest.Mock).mockResolvedValue('base64-content');

      // Mock folder exists check
      (global.fetch as jest.Mock).mockImplementation((url: string) => {
        if (url.includes('mock-folder-id')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ id: 'mock-folder-id', trashed: false }),
          });
        }
        // Mock upload
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ id: 'uploaded-file-id' }),
        });
      });

      const result = await uploadPendingExports({ interactive: false });

      expect(database.updateExportQueueStatus).toHaveBeenCalledWith(
        mockDb,
        'exp-1',
        'uploading',
        { lastError: null }
      );

      expect(database.updateExportQueueStatus).toHaveBeenCalledWith(
        mockDb,
        'exp-1',
        'completed',
        expect.objectContaining({
          driveFileId: 'uploaded-file-id',
          lastError: null,
        })
      );

      expect(result).toEqual({
        attempted: 1,
        uploaded: 1,
        failed: 0,
        skipped: 0,
        errors: [],
        requiresAuth: false,
      });
    });

    it('should create new folder if current folder does not exist', async () => {
      const pendingItems: ExportQueueRecord[] = [
        {
          id: 'exp-1',
          filename: 'export1.csv',
          filePath: '/path/export1.csv',
          fileUri: 'content://mock/export1.csv',
          status: 'pending',
          createdAt: '2025-01-15T10:00:00.000Z',
          updatedAt: '2025-01-15T10:00:00.000Z',
          uploadedAt: null,
          driveFileId: null,
          lastError: null,
        },
      ];

      (database.listExportQueue as jest.Mock).mockResolvedValue(pendingItems);
      (googleAuth.ensureValidAccessToken as jest.Mock).mockResolvedValue('mock-access-token');
      (database.getSetting as jest.Mock).mockResolvedValue('old-folder-id');
      (storageAccess.readFileAsBase64 as jest.Mock).mockResolvedValue('base64-content');

      let callCount = 0;
      (global.fetch as jest.Mock).mockImplementation((url: string) => {
        callCount++;
        // First call: folder check returns 404
        if (callCount === 1 && url.includes('old-folder-id')) {
          return Promise.resolve({
            ok: false,
            status: 404,
          });
        }
        // Second call: create folder
        if (callCount === 2 && url.includes('fields=id')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ id: 'new-folder-id' }),
          });
        }
        // Third call: upload file
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ id: 'uploaded-file-id' }),
        });
      });

      const result = await uploadPendingExports({ interactive: false });

      expect(database.setSetting).toHaveBeenCalledWith(mockDb, 'drive_folder_id', 'new-folder-id');

      expect(result).toMatchObject({
        attempted: 1,
        uploaded: 1,
        updatedFolderId: 'new-folder-id',
      });
    });

    it('should handle upload failure with network error', async () => {
      const pendingItems: ExportQueueRecord[] = [
        {
          id: 'exp-1',
          filename: 'export1.csv',
          filePath: '/path/export1.csv',
          fileUri: 'content://mock/export1.csv',
          status: 'pending',
          createdAt: '2025-01-15T10:00:00.000Z',
          updatedAt: '2025-01-15T10:00:00.000Z',
          uploadedAt: null,
          driveFileId: null,
          lastError: null,
        },
      ];

      (database.listExportQueue as jest.Mock).mockResolvedValue(pendingItems);
      (googleAuth.ensureValidAccessToken as jest.Mock).mockResolvedValue('mock-access-token');
      (database.getSetting as jest.Mock).mockResolvedValue('mock-folder-id');
      (storageAccess.readFileAsBase64 as jest.Mock).mockResolvedValue('base64-content');

      let callCount = 0;
      (global.fetch as jest.Mock).mockImplementation((url: string) => {
        callCount++;
        // First call: folder check
        if (callCount === 1) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ id: 'mock-folder-id', trashed: false }),
          });
        }
        // Second call: upload fails
        return Promise.resolve({
          ok: false,
          status: 500,
          json: () => Promise.resolve({
            error: { message: 'Internal Server Error' },
          }),
        });
      });

      const result = await uploadPendingExports({ interactive: false });

      expect(database.updateExportQueueStatus).toHaveBeenCalledWith(
        mockDb,
        'exp-1',
        'failed',
        expect.objectContaining({
          lastError: 'Internal Server Error',
        })
      );

      expect(result).toEqual({
        attempted: 1,
        uploaded: 0,
        failed: 1,
        skipped: 0,
        errors: ['export1.csv: Internal Server Error'],
        requiresAuth: false,
      });
    });

    it('should handle 401 authentication error and set requiresAuth', async () => {
      const pendingItems: ExportQueueRecord[] = [
        {
          id: 'exp-1',
          filename: 'export1.csv',
          filePath: '/path/export1.csv',
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
          filePath: '/path/export2.csv',
          fileUri: 'content://mock/export2.csv',
          status: 'pending',
          createdAt: '2025-01-15T11:00:00.000Z',
          updatedAt: '2025-01-15T11:00:00.000Z',
          uploadedAt: null,
          driveFileId: null,
          lastError: null,
        },
      ];

      (database.listExportQueue as jest.Mock).mockResolvedValue(pendingItems);
      (googleAuth.ensureValidAccessToken as jest.Mock).mockResolvedValue('mock-access-token');
      (database.getSetting as jest.Mock).mockResolvedValue('mock-folder-id');
      (storageAccess.readFileAsBase64 as jest.Mock).mockResolvedValue('base64-content');

      let callCount = 0;
      (global.fetch as jest.Mock).mockImplementation((url: string) => {
        callCount++;
        // First call: folder check
        if (callCount === 1) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ id: 'mock-folder-id', trashed: false }),
          });
        }
        // Second call: upload fails with 401
        return Promise.resolve({
          ok: false,
          status: 401,
          json: () => Promise.resolve({
            error: { message: 'Unauthorized' },
          }),
        });
      });

      const result = await uploadPendingExports({ interactive: false });

      expect(result).toEqual({
        attempted: 2,
        uploaded: 0,
        failed: 1,
        skipped: 1,
        errors: ['export1.csv: Unauthorized'],
        requiresAuth: true,
      });
    });

    it('should handle 403 authorization error and set requiresAuth', async () => {
      const pendingItems: ExportQueueRecord[] = [
        {
          id: 'exp-1',
          filename: 'export1.csv',
          filePath: '/path/export1.csv',
          fileUri: 'content://mock/export1.csv',
          status: 'pending',
          createdAt: '2025-01-15T10:00:00.000Z',
          updatedAt: '2025-01-15T10:00:00.000Z',
          uploadedAt: null,
          driveFileId: null,
          lastError: null,
        },
      ];

      (database.listExportQueue as jest.Mock).mockResolvedValue(pendingItems);
      (googleAuth.ensureValidAccessToken as jest.Mock).mockResolvedValue('mock-access-token');
      (database.getSetting as jest.Mock).mockResolvedValue('mock-folder-id');
      (storageAccess.readFileAsBase64 as jest.Mock).mockResolvedValue('base64-content');

      let callCount = 0;
      (global.fetch as jest.Mock).mockImplementation((url: string) => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ id: 'mock-folder-id', trashed: false }),
          });
        }
        return Promise.resolve({
          ok: false,
          status: 403,
          json: () => Promise.resolve({
            error: { message: 'Forbidden' },
          }),
        });
      });

      const result = await uploadPendingExports({ interactive: false });

      expect(result.requiresAuth).toBe(true);
    });

    it('should use filePath when fileUri is not available', async () => {
      const pendingItems: ExportQueueRecord[] = [
        {
          id: 'exp-1',
          filename: 'export1.csv',
          filePath: '/path/export1.csv',
          fileUri: null,
          status: 'pending',
          createdAt: '2025-01-15T10:00:00.000Z',
          updatedAt: '2025-01-15T10:00:00.000Z',
          uploadedAt: null,
          driveFileId: null,
          lastError: null,
        },
      ];

      (database.listExportQueue as jest.Mock).mockResolvedValue(pendingItems);
      (googleAuth.ensureValidAccessToken as jest.Mock).mockResolvedValue('mock-access-token');
      (database.getSetting as jest.Mock).mockResolvedValue('mock-folder-id');
      (RNFS.readFile as jest.Mock).mockResolvedValue('base64-content');

      (global.fetch as jest.Mock).mockImplementation((url: string) => {
        if (url.includes('mock-folder-id')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ id: 'mock-folder-id', trashed: false }),
          });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({ id: 'uploaded-file-id' }),
        });
      });

      await uploadPendingExports({ interactive: false });

      expect(RNFS.readFile).toHaveBeenCalledWith('/path/export1.csv', 'base64');
      expect(storageAccess.readFileAsBase64).not.toHaveBeenCalled();
    });

    it('should handle multiple uploads with mixed success/failure', async () => {
      const pendingItems: ExportQueueRecord[] = [
        {
          id: 'exp-1',
          filename: 'export1.csv',
          filePath: '/path/export1.csv',
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
          filePath: '/path/export2.csv',
          fileUri: 'content://mock/export2.csv',
          status: 'pending',
          createdAt: '2025-01-15T11:00:00.000Z',
          updatedAt: '2025-01-15T11:00:00.000Z',
          uploadedAt: null,
          driveFileId: null,
          lastError: null,
        },
      ];

      (database.listExportQueue as jest.Mock).mockResolvedValue(pendingItems);
      (googleAuth.ensureValidAccessToken as jest.Mock).mockResolvedValue('mock-access-token');
      (database.getSetting as jest.Mock).mockResolvedValue('mock-folder-id');
      (storageAccess.readFileAsBase64 as jest.Mock).mockResolvedValue('base64-content');

      let uploadCount = 0;
      (global.fetch as jest.Mock).mockImplementation((url: string) => {
        if (url.includes('mock-folder-id')) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ id: 'mock-folder-id', trashed: false }),
          });
        }
        uploadCount++;
        if (uploadCount === 1) {
          // First upload succeeds
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ id: 'uploaded-file-1' }),
          });
        }
        // Second upload fails
        return Promise.resolve({
          ok: false,
          status: 500,
          json: () => Promise.resolve({
            error: { message: 'Server Error' },
          }),
        });
      });

      const result = await uploadPendingExports({ interactive: false });

      expect(result).toEqual({
        attempted: 2,
        uploaded: 1,
        failed: 1,
        skipped: 0,
        errors: ['export2.csv: Server Error'],
        requiresAuth: false,
      });
    });

    it('should pass interactive flag to ensureValidAccessToken', async () => {
      const pendingItems: ExportQueueRecord[] = [
        {
          id: 'exp-1',
          filename: 'export1.csv',
          filePath: '/path/export1.csv',
          fileUri: 'content://mock/export1.csv',
          status: 'pending',
          createdAt: '2025-01-15T10:00:00.000Z',
          updatedAt: '2025-01-15T10:00:00.000Z',
          uploadedAt: null,
          driveFileId: null,
          lastError: null,
        },
      ];

      (database.listExportQueue as jest.Mock).mockResolvedValue(pendingItems);
      (googleAuth.ensureValidAccessToken as jest.Mock).mockResolvedValue(null);

      await uploadPendingExports({ interactive: true });

      expect(googleAuth.ensureValidAccessToken).toHaveBeenCalledWith({ interactive: true });
    });

    it('should default interactive to false when not specified', async () => {
      const pendingItems: ExportQueueRecord[] = [
        {
          id: 'exp-1',
          filename: 'export1.csv',
          filePath: '/path/export1.csv',
          fileUri: 'content://mock/export1.csv',
          status: 'pending',
          createdAt: '2025-01-15T10:00:00.000Z',
          updatedAt: '2025-01-15T10:00:00.000Z',
          uploadedAt: null,
          driveFileId: null,
          lastError: null,
        },
      ];

      (database.listExportQueue as jest.Mock).mockResolvedValue(pendingItems);
      (googleAuth.ensureValidAccessToken as jest.Mock).mockResolvedValue(null);

      await uploadPendingExports();

      expect(googleAuth.ensureValidAccessToken).toHaveBeenCalledWith({ interactive: false });
    });

    it('should handle upload response missing file ID', async () => {
      const pendingItems: ExportQueueRecord[] = [
        {
          id: 'exp-1',
          filename: 'export1.csv',
          filePath: '/path/export1.csv',
          fileUri: 'content://mock/export1.csv',
          status: 'pending',
          createdAt: '2025-01-15T10:00:00.000Z',
          updatedAt: '2025-01-15T10:00:00.000Z',
          uploadedAt: null,
          driveFileId: null,
          lastError: null,
        },
      ];

      (database.listExportQueue as jest.Mock).mockResolvedValue(pendingItems);
      (googleAuth.ensureValidAccessToken as jest.Mock).mockResolvedValue('mock-access-token');
      (database.getSetting as jest.Mock).mockResolvedValue('mock-folder-id');
      (storageAccess.readFileAsBase64 as jest.Mock).mockResolvedValue('base64-content');

      let callCount = 0;
      (global.fetch as jest.Mock).mockImplementation((url: string) => {
        callCount++;
        if (callCount === 1) {
          return Promise.resolve({
            ok: true,
            status: 200,
            json: () => Promise.resolve({ id: 'mock-folder-id', trashed: false }),
          });
        }
        return Promise.resolve({
          ok: true,
          status: 200,
          json: () => Promise.resolve({}), // Missing id
        });
      });

      const result = await uploadPendingExports({ interactive: false });

      expect(result.failed).toBe(1);
      expect(result.errors).toEqual([
        'export1.csv: Google Drive upload response missing file ID for export1.csv.',
      ]);
    });
  });
});
