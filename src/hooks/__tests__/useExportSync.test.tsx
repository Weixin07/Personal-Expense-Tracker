import { renderHook, act, waitFor } from '@testing-library/react-native';
import NetInfo from '@react-native-community/netinfo';
import RNFS from 'react-native-fs';
import { useExportSync, type UseExportSyncParams } from '../useExportSync';
import * as db from '../../database';
import * as exportModule from '../../export';
import * as storageAccess from '../../security/storageAccess';
import type { ExportQueueRecord } from '../../database';

jest.mock('../../database', () => ({
  withDatabase: jest.fn(),
  listExportQueue: jest.fn(),
  insertExportQueueItem: jest.fn(),
  updateExportQueueStatus: jest.fn(),
  removeExportQueueItem: jest.fn(),
  clearCompletedExportQueueItems: jest.fn(),
}));

jest.mock('../../export', () => ({
  writeExportFile: jest.fn(),
  uploadPendingExports: jest.fn(),
}));

jest.mock('../../security/storageAccess', () => ({
  deleteFileUri: jest.fn(),
}));

const mockDb = db as jest.Mocked<typeof db>;
const mockExport = exportModule as jest.Mocked<typeof exportModule>;
const mockStorage = storageAccess as jest.Mocked<typeof storageAccess>;

const queueRecord = (
  overrides: Partial<ExportQueueRecord> = {},
): ExportQueueRecord => ({
  id: 'e1',
  filename: 'export.csv',
  filePath: 'content://export.csv',
  fileUri: 'content://export.csv',
  status: 'failed',
  createdAt: '2025-01-10T00:00:00.000Z',
  updatedAt: '2025-01-10T00:00:00.000Z',
  uploadedAt: null,
  driveFileId: null,
  lastError: 'previous failure',
  ...overrides,
});

const makeParams = (
  overrides: Partial<UseExportSyncParams> = {},
): UseExportSyncParams => ({
  isInitialised: true,
  expenses: [],
  categories: [],
  initialQueueRecords: [],
  ensureExportDirectoryUri: jest.fn().mockResolvedValue('content://dir'),
  setDriveFolderId: jest.fn(),
  beginOperation: jest.fn(),
  endOperation: jest.fn(),
  failOperation: jest.fn(),
  ...overrides,
});

const writeResultWithoutUri = {
  filename: 'export.csv',
  filePath: 'content://export.csv',
  contentSize: 10,
} as unknown as Awaited<ReturnType<typeof exportModule.writeExportFile>>;

const netInfoListener = (): ((info: {
  isConnected: boolean;
  isInternetReachable: boolean | null;
}) => void) => (NetInfo.addEventListener as jest.Mock).mock.calls[0][0];

beforeEach(() => {
  jest.clearAllMocks();
  (mockDb.withDatabase as jest.Mock).mockImplementation(
    (cb: (database: unknown) => unknown) => Promise.resolve(cb({})),
  );
  mockDb.listExportQueue.mockResolvedValue([]);
  mockDb.insertExportQueueItem.mockResolvedValue(undefined as never);
  mockDb.updateExportQueueStatus.mockResolvedValue(undefined as never);
  mockDb.removeExportQueueItem.mockResolvedValue(undefined as never);
  mockDb.clearCompletedExportQueueItems.mockResolvedValue(undefined as never);
  mockExport.writeExportFile.mockResolvedValue({
    filename: 'export.csv',
    filePath: 'content://export.csv',
    fileUri: 'content://export.csv',
    contentSize: 10,
  });
  mockExport.uploadPendingExports.mockResolvedValue({
    requiresAuth: false,
    attempted: 0,
    uploaded: 0,
    failed: 0,
    skipped: 0,
    errors: [],
  });
  mockStorage.deleteFileUri.mockResolvedValue(undefined);
});

describe('useExportSync', () => {
  it('seeds the queue from the initial records', async () => {
    const params = makeParams({ initialQueueRecords: [queueRecord()] });
    const { result } = renderHook(() => useExportSync(params));
    await waitFor(() => expect(result.current.exportQueue).toHaveLength(1));
    expect(result.current.exportQueue[0].id).toBe('e1');
  });

  it('queues an export and writes a file', async () => {
    const params = makeParams();
    const { result } = renderHook(() => useExportSync(params));
    await act(async () => {
      await result.current.queueExport();
    });
    expect(mockExport.writeExportFile).toHaveBeenCalled();
    expect(mockDb.insertExportQueueItem).toHaveBeenCalled();
    expect(params.beginOperation).toHaveBeenCalled();
    expect(params.endOperation).toHaveBeenCalled();
  });

  it('throws when queueing before initialisation', async () => {
    const params = makeParams({ isInitialised: false });
    const { result } = renderHook(() => useExportSync(params));
    await act(async () => {
      await expect(result.current.queueExport()).rejects.toThrow();
    });
  });

  it('surfaces a failure through failOperation', async () => {
    mockExport.writeExportFile.mockRejectedValueOnce(new Error('write failed'));
    const params = makeParams();
    const { result } = renderHook(() => useExportSync(params));
    await act(async () => {
      await expect(result.current.queueExport()).rejects.toThrow(
        'write failed',
      );
    });
    expect(params.failOperation).toHaveBeenCalledWith('write failed');
  });

  it('retries a queued export', async () => {
    const params = makeParams({ initialQueueRecords: [queueRecord()] });
    const { result } = renderHook(() => useExportSync(params));
    await waitFor(() => expect(result.current.exportQueue).toHaveLength(1));
    await act(async () => {
      await result.current.retryExport('e1');
    });
    expect(mockDb.updateExportQueueStatus).toHaveBeenCalled();
  });

  it('removes a queued export', async () => {
    const params = makeParams({ initialQueueRecords: [queueRecord()] });
    const { result } = renderHook(() => useExportSync(params));
    await waitFor(() => expect(result.current.exportQueue).toHaveLength(1));
    await act(async () => {
      await result.current.removeExport('e1');
    });
    expect(mockDb.removeExportQueueItem).toHaveBeenCalledWith(
      expect.anything(),
      'e1',
    );
  });

  it('clears completed exports', async () => {
    const params = makeParams({
      initialQueueRecords: [queueRecord({ status: 'completed' })],
    });
    const { result } = renderHook(() => useExportSync(params));
    await waitFor(() => expect(result.current.exportQueue).toHaveLength(1));
    await act(async () => {
      await result.current.clearCompletedExports();
    });
    expect(mockDb.clearCompletedExportQueueItems).toHaveBeenCalled();
  });

  it('uploads queued exports and writes back the drive folder id', async () => {
    mockExport.uploadPendingExports.mockResolvedValue({
      requiresAuth: false,
      attempted: 1,
      uploaded: 1,
      failed: 0,
      skipped: 0,
      errors: [],
      updatedFolderId: 'folder-x',
    });
    const params = makeParams();
    const { result } = renderHook(() => useExportSync(params));
    await act(async () => {
      await result.current.uploadQueuedExports({ interactive: true });
    });
    expect(mockExport.uploadPendingExports).toHaveBeenCalled();
    expect(params.setDriveFolderId).toHaveBeenCalledWith('folder-x');
  });

  it('skips clearing when no completed or failed exports exist', async () => {
    const params = makeParams({
      initialQueueRecords: [queueRecord({ status: 'pending' })],
    });
    const { result } = renderHook(() => useExportSync(params));
    await waitFor(() => expect(result.current.exportQueue).toHaveLength(1));
    await act(async () => {
      await result.current.clearCompletedExports();
    });
    expect(mockDb.clearCompletedExportQueueItems).not.toHaveBeenCalled();
    expect(params.beginOperation).not.toHaveBeenCalled();
  });

  it('removes an export absent from the queue without touching files', async () => {
    const params = makeParams();
    const { result } = renderHook(() => useExportSync(params));
    await act(async () => {
      await result.current.removeExport('ghost');
    });
    expect(mockDb.removeExportQueueItem).toHaveBeenCalledWith(
      expect.anything(),
      'ghost',
    );
    expect(mockStorage.deleteFileUri).not.toHaveBeenCalled();
  });

  it('throws when retrying an unknown export id', async () => {
    const params = makeParams();
    const { result } = renderHook(() => useExportSync(params));
    await act(async () => {
      await expect(result.current.retryExport('ghost')).rejects.toThrow(
        'Export item not found.',
      );
    });
  });

  it('throws when the export file cannot be created', async () => {
    mockExport.writeExportFile.mockResolvedValueOnce(writeResultWithoutUri);
    const params = makeParams();
    const { result } = renderHook(() => useExportSync(params));
    await act(async () => {
      await expect(result.current.queueExport()).rejects.toThrow(
        'Failed to create export file.',
      );
    });
    expect(params.failOperation).toHaveBeenCalledWith(
      'Failed to create export file.',
    );
  });

  it('throws when the export cannot be regenerated on retry', async () => {
    const params = makeParams({ initialQueueRecords: [queueRecord()] });
    const { result } = renderHook(() => useExportSync(params));
    await waitFor(() => expect(result.current.exportQueue).toHaveLength(1));
    mockExport.writeExportFile.mockResolvedValueOnce(writeResultWithoutUri);
    await act(async () => {
      await expect(result.current.retryExport('e1')).rejects.toThrow(
        'Failed to regenerate export.',
      );
    });
    expect(params.failOperation).toHaveBeenCalledWith(
      'Failed to regenerate export.',
    );
  });

  it('surfaces a retry failure through failOperation', async () => {
    mockExport.writeExportFile.mockRejectedValueOnce(new Error('regen failed'));
    const params = makeParams({ initialQueueRecords: [queueRecord()] });
    const { result } = renderHook(() => useExportSync(params));
    await waitFor(() => expect(result.current.exportQueue).toHaveLength(1));
    await act(async () => {
      await expect(result.current.retryExport('e1')).rejects.toThrow(
        'regen failed',
      );
    });
    expect(params.failOperation).toHaveBeenCalledWith('regen failed');
  });

  it('surfaces a remove failure through failOperation', async () => {
    mockDb.removeExportQueueItem.mockRejectedValueOnce(
      new Error('remove failed'),
    );
    const params = makeParams({ initialQueueRecords: [queueRecord()] });
    const { result } = renderHook(() => useExportSync(params));
    await waitFor(() => expect(result.current.exportQueue).toHaveLength(1));
    await act(async () => {
      await expect(result.current.removeExport('e1')).rejects.toThrow(
        'remove failed',
      );
    });
    expect(params.failOperation).toHaveBeenCalledWith('remove failed');
  });

  it('surfaces a clear-completed failure through failOperation', async () => {
    mockDb.clearCompletedExportQueueItems.mockRejectedValueOnce(
      new Error('clear failed'),
    );
    const params = makeParams({
      initialQueueRecords: [queueRecord({ status: 'completed' })],
    });
    const { result } = renderHook(() => useExportSync(params));
    await waitFor(() => expect(result.current.exportQueue).toHaveLength(1));
    await act(async () => {
      await expect(result.current.clearCompletedExports()).rejects.toThrow(
        'clear failed',
      );
    });
    expect(params.failOperation).toHaveBeenCalledWith('clear failed');
  });

  it('unlinks a legacy file path when removing an export', async () => {
    const params = makeParams({
      initialQueueRecords: [
        queueRecord({
          fileUri: '/legacy/export.csv',
          filePath: '/legacy/export.csv',
        }),
      ],
    });
    const { result } = renderHook(() => useExportSync(params));
    await waitFor(() => expect(result.current.exportQueue).toHaveLength(1));
    await act(async () => {
      await result.current.removeExport('e1');
    });
    expect(RNFS.unlink).toHaveBeenCalledWith('/legacy/export.csv');
    expect(mockStorage.deleteFileUri).not.toHaveBeenCalled();
  });

  it('still resolves removal when unlinking a legacy file fails', async () => {
    (RNFS.unlink as jest.Mock).mockRejectedValueOnce(new Error('io'));
    const params = makeParams({
      initialQueueRecords: [
        queueRecord({
          fileUri: '/legacy/export.csv',
          filePath: '/legacy/export.csv',
        }),
      ],
    });
    const { result } = renderHook(() => useExportSync(params));
    await waitFor(() => expect(result.current.exportQueue).toHaveLength(1));
    await act(async () => {
      await expect(result.current.removeExport('e1')).resolves.toBeUndefined();
    });
    expect(mockDb.removeExportQueueItem).toHaveBeenCalled();
  });

  it('unlinks a stored file path when no fileUri is present', async () => {
    const params = makeParams({
      initialQueueRecords: [
        queueRecord({ fileUri: null, filePath: '/legacy/only.csv' }),
      ],
    });
    const { result } = renderHook(() => useExportSync(params));
    await waitFor(() => expect(result.current.exportQueue).toHaveLength(1));
    await act(async () => {
      await result.current.removeExport('e1');
    });
    expect(RNFS.unlink).toHaveBeenCalledWith('/legacy/only.csv');
    expect(mockStorage.deleteFileUri).not.toHaveBeenCalled();
  });

  it('skips file cleanup when an export has no stored location', async () => {
    const params = makeParams({
      initialQueueRecords: [queueRecord({ fileUri: null, filePath: '' })],
    });
    const { result } = renderHook(() => useExportSync(params));
    await waitFor(() => expect(result.current.exportQueue).toHaveLength(1));
    await act(async () => {
      await result.current.removeExport('e1');
    });
    expect(RNFS.unlink).not.toHaveBeenCalled();
    expect(mockStorage.deleteFileUri).not.toHaveBeenCalled();
  });

  it('tracks connectivity changes from the NetInfo listener', async () => {
    const params = makeParams();
    const { result } = renderHook(() => useExportSync(params));
    const listener = netInfoListener();
    act(() => listener({ isConnected: true, isInternetReachable: null }));
    expect(result.current.isOnline).toBe(true);
    act(() => listener({ isConnected: true, isInternetReachable: false }));
    expect(result.current.isOnline).toBe(false);
  });

  it('rethrows and refreshes the queue when an interactive upload fails', async () => {
    mockExport.uploadPendingExports.mockRejectedValueOnce(
      new Error('drive down'),
    );
    const params = makeParams();
    const { result } = renderHook(() => useExportSync(params));
    mockDb.listExportQueue.mockClear();
    await act(async () => {
      await expect(
        result.current.uploadQueuedExports({ interactive: true }),
      ).rejects.toThrow('drive down');
    });
    expect(mockDb.listExportQueue).toHaveBeenCalled();
  });

  it('swallows a failed auto-upload after queueing while online', async () => {
    mockExport.uploadPendingExports.mockRejectedValueOnce(
      new Error('drive down'),
    );
    const params = makeParams();
    const { result } = renderHook(() => useExportSync(params));
    act(() =>
      netInfoListener()({ isConnected: true, isInternetReachable: true }),
    );
    await act(async () => {
      await result.current.queueExport();
    });
    await waitFor(() =>
      expect(mockExport.uploadPendingExports).toHaveBeenCalled(),
    );
    expect(params.failOperation).not.toHaveBeenCalled();
  });

  it('triggers an upload after a retry while online', async () => {
    const params = makeParams({ initialQueueRecords: [queueRecord()] });
    const { result } = renderHook(() => useExportSync(params));
    await waitFor(() => expect(result.current.exportQueue).toHaveLength(1));
    act(() =>
      netInfoListener()({ isConnected: true, isInternetReachable: true }),
    );
    await act(async () => {
      await result.current.retryExport('e1');
    });
    await waitFor(() =>
      expect(mockExport.uploadPendingExports).toHaveBeenCalled(),
    );
  });

  it('uploads pending exports automatically when connectivity returns', async () => {
    const params = makeParams({
      initialQueueRecords: [queueRecord({ status: 'pending' })],
    });
    const { result } = renderHook(() => useExportSync(params));
    await waitFor(() => expect(result.current.exportQueue).toHaveLength(1));
    act(() =>
      netInfoListener()({ isConnected: true, isInternetReachable: true }),
    );
    await waitFor(() =>
      expect(mockExport.uploadPendingExports).toHaveBeenCalled(),
    );
  });
});
