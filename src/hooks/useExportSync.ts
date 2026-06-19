import { useCallback, useEffect, useRef, useState } from 'react';
import NetInfo from '@react-native-community/netinfo';
import RNFS from 'react-native-fs';
import {
  withDatabase,
  listExportQueue as dbListExportQueue,
  insertExportQueueItem as dbInsertExportQueueItem,
  updateExportQueueStatus as dbUpdateExportQueueStatus,
  removeExportQueueItem as dbRemoveExportQueueItem,
  clearCompletedExportQueueItems as dbClearCompletedExportQueueItems,
} from '../database';
import type {
  ExportQueueRecord,
  ExpenseRecord,
  CategoryRecord,
} from '../database';
import { writeExportFile, uploadPendingExports } from '../export';
import type { UploadPendingExportsResult } from '../export';
import { deleteFileUri } from '../security/storageAccess';
import { toError, toErrorMessage } from '../utils/errors';

export type ExportQueueItem = {
  id: string;
  filename: string;
  filePath: string;
  fileUri?: string | null;
  status: 'pending' | 'uploading' | 'completed' | 'failed';
  createdAt: string;
  updatedAt: string;
  uploadedAt?: string;
  driveFileId?: string;
  lastError?: string | null;
};

export type UseExportSyncParams = {
  isInitialised: boolean;
  expenses: ExpenseRecord[];
  categories: CategoryRecord[];
  initialQueueRecords: readonly ExportQueueRecord[];
  ensureExportDirectoryUri: () => Promise<string>;
  setDriveFolderId: (folderId: string | null) => void;
  beginOperation: () => void;
  endOperation: () => void;
  failOperation: (message: string) => void;
};

export type UseExportSyncResult = {
  exportQueue: ExportQueueItem[];
  isOnline: boolean;
  queueExport: () => Promise<void>;
  retryExport: (id: string) => Promise<void>;
  removeExport: (id: string) => Promise<void>;
  clearCompletedExports: () => Promise<void>;
  uploadQueuedExports: (options?: {
    interactive?: boolean;
  }) => Promise<UploadPendingExportsResult | null>;
};

const mapExportQueueRecords = (
  records: readonly ExportQueueRecord[],
): ExportQueueItem[] =>
  records.map(record => ({
    id: record.id,
    filename: record.filename,
    filePath: record.filePath,
    fileUri: record.fileUri ?? undefined,
    status: record.status,
    createdAt: record.createdAt,
    updatedAt: record.updatedAt,
    uploadedAt: record.uploadedAt ?? undefined,
    driveFileId: record.driveFileId ?? undefined,
    lastError: record.lastError,
  }));

const generateExportQueueId = (): string => {
  const timestamp = new Date().toISOString().replace(/[^0-9]/g, '');
  const random = Math.random().toString(36).slice(2, 8);
  return `exp-${timestamp}-${random}`;
};

const removeQueueFileIfExists = async (location: {
  fileUri?: string | null;
  filePath?: string;
}): Promise<void> => {
  const { fileUri } = location;
  if (fileUri) {
    if (fileUri.startsWith('content://')) {
      await deleteFileUri(fileUri);
      return;
    }
    // If the stored URI is actually a file path from legacy entries, fall through.
    const legacyPath = fileUri;
    try {
      const exists = await RNFS.exists(legacyPath);
      if (exists) {
        await RNFS.unlink(legacyPath);
      }
    } catch {
      // File removal is best-effort; a missing file must not fail the operation.
    }
    return;
  }

  const filePath = location.filePath;
  if (!filePath) {
    return;
  }

  try {
    const exists = await RNFS.exists(filePath);
    if (exists) {
      await RNFS.unlink(filePath);
    }
  } catch {
    // File removal is best-effort; a missing file must not fail the operation.
  }
};

export const useExportSync = ({
  isInitialised,
  expenses,
  categories,
  initialQueueRecords,
  ensureExportDirectoryUri,
  setDriveFolderId,
  beginOperation,
  endOperation,
  failOperation,
}: UseExportSyncParams): UseExportSyncResult => {
  const [exportQueue, setExportQueue] = useState<ExportQueueItem[]>([]);
  const [isOnline, setIsOnline] = useState(false);
  const isUploadingExportsRef = useRef(false);
  const isOnlineRef = useRef(false);

  useEffect(() => {
    setExportQueue(mapExportQueueRecords(initialQueueRecords));
  }, [initialQueueRecords]);

  const syncExportQueue = useCallback(async () => {
    const records = await withDatabase(db => dbListExportQueue(db));
    setExportQueue(mapExportQueueRecords(records));
  }, []);

  const runDriveUpload = useCallback(
    async (
      options: { interactive?: boolean; silent?: boolean } = {},
    ): Promise<UploadPendingExportsResult | null> => {
      if (isUploadingExportsRef.current) {
        return null;
      }
      isUploadingExportsRef.current = true;
      try {
        const result = await uploadPendingExports({
          interactive: options.interactive ?? false,
        });
        if (result.updatedFolderId !== undefined) {
          setDriveFolderId(result.updatedFolderId);
        }
        await syncExportQueue();
        return result;
      } catch (error) {
        await syncExportQueue();
        if (options.silent) {
          console.error('Drive upload failed', error);
          return null;
        }
        throw toError(error);
      } finally {
        isUploadingExportsRef.current = false;
      }
    },
    [setDriveFolderId, syncExportQueue],
  );

  const uploadQueuedExports = useCallback<
    UseExportSyncResult['uploadQueuedExports']
  >(
    async options =>
      runDriveUpload({
        interactive: options?.interactive ?? false,
        silent: false,
      }),
    [runDriveUpload],
  );

  useEffect(() => {
    const unsubscribe = NetInfo.addEventListener(stateInfo => {
      const online = Boolean(
        stateInfo.isConnected && (stateInfo.isInternetReachable ?? true),
      );
      isOnlineRef.current = online;
      setIsOnline(online);
    });
    return unsubscribe;
  }, []);

  const queueExport = useCallback<
    UseExportSyncResult['queueExport']
  >(async () => {
    if (!isInitialised) {
      throw new Error('Data is not ready yet. Try again shortly.');
    }
    beginOperation();
    try {
      const directoryUri = await ensureExportDirectoryUri();
      const { filename, filePath, fileUri } = await writeExportFile({
        directoryUri,
        expenses,
        categories,
      });
      const storedFilePath = filePath ?? fileUri;
      if (!storedFilePath || !fileUri) {
        throw new Error('Failed to create export file.');
      }
      await withDatabase(db =>
        dbInsertExportQueueItem(db, {
          id: generateExportQueueId(),
          filename,
          filePath: storedFilePath,
          fileUri,
          status: 'pending',
          lastError: null,
        }),
      );
      await syncExportQueue();
      if (isOnlineRef.current) {
        void runDriveUpload({ interactive: false, silent: true });
      }
    } catch (error) {
      failOperation(toErrorMessage(error));
      throw toError(error);
    } finally {
      endOperation();
    }
  }, [
    beginOperation,
    categories,
    endOperation,
    ensureExportDirectoryUri,
    expenses,
    failOperation,
    isInitialised,
    runDriveUpload,
    syncExportQueue,
  ]);

  const retryExport = useCallback<UseExportSyncResult['retryExport']>(
    async id => {
      const existing = exportQueue.find(item => item.id === id);
      if (!existing) {
        throw new Error('Export item not found.');
      }
      beginOperation();
      try {
        const directoryUri = await ensureExportDirectoryUri();
        const regenerated = await writeExportFile({
          directoryUri,
          expenses,
          categories,
        });
        const nextFilePath = regenerated.filePath ?? regenerated.fileUri;
        if (!regenerated.fileUri || !nextFilePath) {
          throw new Error('Failed to regenerate export.');
        }

        await withDatabase(db =>
          dbUpdateExportQueueStatus(db, id, 'pending', {
            lastError: null,
            uploadedAt: null,
            driveFileId: null,
            filePath: nextFilePath,
            fileUri: regenerated.fileUri,
            filename: regenerated.filename,
          }),
        );

        await removeQueueFileIfExists({
          fileUri: existing.fileUri,
          filePath: existing.filePath,
        });

        await syncExportQueue();
        if (isOnlineRef.current) {
          void runDriveUpload({ interactive: false, silent: true });
        }
      } catch (error) {
        failOperation(toErrorMessage(error));
        throw toError(error);
      } finally {
        endOperation();
      }
    },
    [
      beginOperation,
      categories,
      endOperation,
      ensureExportDirectoryUri,
      expenses,
      exportQueue,
      failOperation,
      runDriveUpload,
      syncExportQueue,
    ],
  );

  const removeExport = useCallback<UseExportSyncResult['removeExport']>(
    async id => {
      const existing = exportQueue.find(item => item.id === id);
      beginOperation();
      try {
        await withDatabase(db => dbRemoveExportQueueItem(db, id));
        if (existing) {
          await removeQueueFileIfExists({
            fileUri: existing.fileUri,
            filePath: existing.filePath,
          });
        }
        await syncExportQueue();
      } catch (error) {
        failOperation(toErrorMessage(error));
        throw toError(error);
      } finally {
        endOperation();
      }
    },
    [beginOperation, endOperation, exportQueue, failOperation, syncExportQueue],
  );

  const clearCompletedExports = useCallback<
    UseExportSyncResult['clearCompletedExports']
  >(async () => {
    const removable = exportQueue.filter(
      item => item.status === 'completed' || item.status === 'failed',
    );
    if (!removable.length) {
      return;
    }

    beginOperation();
    try {
      await withDatabase(db => dbClearCompletedExportQueueItems(db));
      await Promise.all(
        removable.map(item =>
          removeQueueFileIfExists({
            fileUri: item.fileUri,
            filePath: item.filePath,
          }),
        ),
      );
      await syncExportQueue();
    } catch (error) {
      failOperation(toErrorMessage(error));
      throw toError(error);
    } finally {
      endOperation();
    }
  }, [
    beginOperation,
    endOperation,
    exportQueue,
    failOperation,
    syncExportQueue,
  ]);

  useEffect(() => {
    if (!isOnline) {
      return;
    }
    if (!exportQueue.some(item => item.status === 'pending')) {
      return;
    }
    void runDriveUpload({ interactive: false, silent: true });
  }, [isOnline, runDriveUpload, exportQueue]);

  return {
    exportQueue,
    isOnline,
    queueExport,
    retryExport,
    removeExport,
    clearCompletedExports,
    uploadQueuedExports,
  };
};
