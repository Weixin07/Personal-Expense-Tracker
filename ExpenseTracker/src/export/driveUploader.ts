import RNFS from 'react-native-fs';
import {
  withDatabase,
  listExportQueue as dbListExportQueue,
  updateExportQueueStatus as dbUpdateExportQueueStatus,
  getSetting as dbGetSetting,
  setSetting as dbSetSetting,
} from '../database';
import type { ExportQueueRecord } from '../database';
import { ensureValidAccessToken } from '../security/googleAuth';
import { GOOGLE_DRIVE_FOLDER_NAME } from '../security/googleConfig';
import { readFileAsBase64 } from '../security/storageAccess';

const DRIVE_FOLDER_ID_KEY = 'drive_folder_id';
const DRIVE_FILES_ENDPOINT = 'https://www.googleapis.com/drive/v3/files';
const DRIVE_UPLOAD_ENDPOINT = 'https://www.googleapis.com/upload/drive/v3/files';

type DriveApiError = Error & { status?: number };

const buildDriveError = async (response: Response): Promise<DriveApiError> => {
  let message = `Google Drive request failed with status ${response.status}`;
  try {
    const data = await response.json();
    const detailedMessage =
      typeof data === 'object' && data && 'error' in data && data.error?.message
        ? data.error.message
        : null;
    if (detailedMessage) {
      message = detailedMessage;
    }
  } catch {
    // ignore JSON parse errors
  }
  const error = new Error(message) as DriveApiError;
  error.status = response.status;
  return error;
};

const folderExists = async (accessToken: string, folderId: string): Promise<boolean> => {
  const response = await fetch(`${DRIVE_FILES_ENDPOINT}/${folderId}?fields=id,trashed`, {
    method: 'GET',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      Accept: 'application/json',
    },
  });

  if (response.status === 404) {
    return false;
  }

  if (!response.ok) {
    throw await buildDriveError(response);
  }

  const data: { id?: string; trashed?: boolean } = await response.json();
  return Boolean(data.id && !data.trashed);
};

const createDriveFolder = async (accessToken: string): Promise<string> => {
  const response = await fetch(`${DRIVE_FILES_ENDPOINT}?fields=id`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': 'application/json',
      Accept: 'application/json',
    },
    body: JSON.stringify({
      name: GOOGLE_DRIVE_FOLDER_NAME,
      mimeType: 'application/vnd.google-apps.folder',
    }),
  });

  if (!response.ok) {
    throw await buildDriveError(response);
  }

  const data: { id?: string } = await response.json();
  if (!data.id) {
    throw new Error('Google Drive did not return a folder ID.');
  }
  return data.id;
};

const ensureDriveFolder = async (
  accessToken: string,
  currentFolderId: string | null,
): Promise<{ folderId: string; updated: boolean }> => {
  if (currentFolderId) {
    try {
      const exists = await folderExists(accessToken, currentFolderId);
      if (exists) {
        return { folderId: currentFolderId, updated: false };
      }
    } catch (error) {
      // If checking the folder fails, fall back to creating a new one.
      console.warn('Failed to verify Drive folder, creating a new one.', error);
    }
  }

  const folderId = await createDriveFolder(accessToken);
  return { folderId, updated: folderId !== currentFolderId };
};

const uploadFileToDrive = async (
  accessToken: string,
  folderId: string,
  item: ExportQueueRecord,
): Promise<{ id: string }> => {
  const base64Content = item.fileUri
    ? await readFileAsBase64(item.fileUri)
    : await RNFS.readFile(item.filePath, 'base64');
  const boundary = `boundary-${Date.now().toString(36)}`;
  const metadata = {
    name: item.filename,
    parents: [folderId],
    mimeType: 'text/csv',
  };

  const bodyParts = [
    `--${boundary}`,
    'Content-Type: application/json; charset=UTF-8',
    '',
    JSON.stringify(metadata),
    `--${boundary}`,
    'Content-Type: text/csv',
    'Content-Transfer-Encoding: base64',
    '',
    base64Content,
    `--${boundary}--`,
    '',
  ];

  const response = await fetch(`${DRIVE_UPLOAD_ENDPOINT}?uploadType=multipart&fields=id`, {
    method: 'POST',
    headers: {
      Authorization: `Bearer ${accessToken}`,
      'Content-Type': `multipart/related; boundary=${boundary}`,
      Accept: 'application/json',
    },
    body: bodyParts.join('\r\n'),
  });

  if (!response.ok) {
    throw await buildDriveError(response);
  }

  const data: { id?: string } = await response.json();
  if (!data.id) {
    throw new Error(`Google Drive upload response missing file ID for ${item.filename}.`);
  }
  return { id: data.id };
};

export type UploadPendingExportsResult = {
  attempted: number;
  uploaded: number;
  failed: number;
  skipped: number;
  errors: string[];
  requiresAuth: boolean;
  updatedFolderId?: string;
};

export const uploadPendingExports = async (
  options: { interactive?: boolean } = {},
): Promise<UploadPendingExportsResult> => {
  return withDatabase(async db => {
    const queue = await dbListExportQueue(db);
    const pending = queue.filter(item => item.status === 'pending');

    if (!pending.length) {
      return {
        attempted: 0,
        uploaded: 0,
        failed: 0,
        skipped: 0,
        errors: [],
        requiresAuth: false,
      };
    }

    const accessToken = await ensureValidAccessToken({ interactive: options.interactive ?? false });
    if (!accessToken) {
      return {
        attempted: pending.length,
        uploaded: 0,
        failed: 0,
        skipped: pending.length,
        errors: [],
        requiresAuth: true,
      };
    }

    const currentFolderId = await dbGetSetting(db, DRIVE_FOLDER_ID_KEY);
    const folderInfo = await ensureDriveFolder(accessToken, currentFolderId);
    if (folderInfo.updated) {
      await dbSetSetting(db, DRIVE_FOLDER_ID_KEY, folderInfo.folderId);
    }

    const result: UploadPendingExportsResult = {
      attempted: pending.length,
      uploaded: 0,
      failed: 0,
      skipped: 0,
      errors: [],
      requiresAuth: false,
      updatedFolderId: folderInfo.updated ? folderInfo.folderId : undefined,
    };

    let authFailure = false;

    for (const item of pending) {
      if (authFailure) {
        result.skipped += 1;
        continue;
      }

      await dbUpdateExportQueueStatus(db, item.id, 'uploading', { lastError: null });

      try {
        const uploadResult = await uploadFileToDrive(accessToken, folderInfo.folderId, item);
        await dbUpdateExportQueueStatus(db, item.id, 'completed', {
          driveFileId: uploadResult.id,
          uploadedAt: new Date().toISOString(),
          lastError: null,
        });
        result.uploaded += 1;
      } catch (error) {
        const driveError = error as DriveApiError;
        const message = driveError.message ?? 'Upload failed.';
        await dbUpdateExportQueueStatus(db, item.id, 'failed', { lastError: message });
        result.failed += 1;
        result.errors.push(`${item.filename}: ${message}`);

        if (driveError.status === 401 || driveError.status === 403) {
          result.requiresAuth = true;
          authFailure = true;
        }
      }
    }

    return result;
  });
};
