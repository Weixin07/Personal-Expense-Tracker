import { withDatabase, getSetting as dbGetSetting } from '../database';
import {
  ensureValidAccessToken,
  GoogleAuthError,
  type GoogleAuthErrorKind,
} from '../security/googleAuth';

const DRIVE_FOLDER_ID_KEY = 'drive_folder_id';
const DRIVE_FILES_ENDPOINT = 'https://www.googleapis.com/drive/v3/files';

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

const isAuthError = (status: number | undefined): boolean =>
  status === 401 || status === 403;

export type DriveBackupFile = {
  id: string;
  name: string;
  modifiedTime: string;
};

export type ListBackupsResult =
  | { ok: true; files: DriveBackupFile[] }
  | {
      ok: false;
      requiresAuth: boolean;
      message?: string;
      errorKind?: GoogleAuthErrorKind;
    };

/**
 * List CSV backups the app previously wrote to its Drive folder. Scoped to the
 * app-created backup folder, so it works within the existing `drive.file`
 * OAuth scope — no broader consent is requested.
 *
 * `drive.file` only ever exposes files this app created, so CSVs the user placed
 * in Drive themselves are invisible here by design and are imported through the
 * system document picker instead.
 */
export const listBackupFiles = async (
  options: { interactive?: boolean } = {},
): Promise<ListBackupsResult> => {
  let accessToken: string | null;
  try {
    accessToken = await ensureValidAccessToken({
      interactive: options.interactive ?? false,
    });
  } catch (error) {
    if (error instanceof GoogleAuthError) {
      return {
        ok: false,
        requiresAuth: false,
        message: error.message,
        errorKind: error.kind,
      };
    }
    return {
      ok: false,
      requiresAuth: false,
      message:
        error instanceof Error ? error.message : 'Google sign-in failed.',
    };
  }
  if (!accessToken) {
    return { ok: false, requiresAuth: true };
  }

  const folderId = await withDatabase(db =>
    dbGetSetting(db, DRIVE_FOLDER_ID_KEY),
  );
  if (!folderId) {
    return { ok: true, files: [] };
  }

  // Drive does not always record an uploaded CSV as `text/csv`, so match the
  // filename as well or backups the app itself wrote can go missing from the list.
  const query =
    `'${folderId}' in parents and trashed = false` +
    ` and (mimeType = 'text/csv' or name contains '.csv')`;
  const url =
    `${DRIVE_FILES_ENDPOINT}?q=${encodeURIComponent(query)}` +
    `&fields=${encodeURIComponent('files(id,name,modifiedTime)')}` +
    `&orderBy=modifiedTime desc`;

  try {
    const response = await fetch(url, {
      method: 'GET',
      headers: {
        Authorization: `Bearer ${accessToken}`,
        Accept: 'application/json',
      },
    });
    if (!response.ok) {
      throw await buildDriveError(response);
    }
    const data: { files?: DriveBackupFile[] } = await response.json();
    return { ok: true, files: data.files ?? [] };
  } catch (error) {
    const driveError = error as DriveApiError;
    return {
      ok: false,
      requiresAuth: isAuthError(driveError.status),
      message: driveError.message,
    };
  }
};

/**
 * Download the raw text of a Drive file by id via `alt=media`.
 */
export const downloadFileContent = async (
  fileId: string,
  options: { interactive?: boolean } = {},
): Promise<string> => {
  const accessToken = await ensureValidAccessToken({
    interactive: options.interactive ?? false,
  });
  if (!accessToken) {
    const error = new Error(
      'Google Drive sign-in is required to download the file.',
    ) as DriveApiError;
    error.status = 401;
    throw error;
  }

  const response = await fetch(`${DRIVE_FILES_ENDPOINT}/${fileId}?alt=media`, {
    method: 'GET',
    headers: { Authorization: `Bearer ${accessToken}` },
  });
  if (!response.ok) {
    throw await buildDriveError(response);
  }
  return response.text();
};
