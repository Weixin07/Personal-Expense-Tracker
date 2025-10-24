import { StorageAccessFramework, type DirectoryPermission } from 'react-native-saf-x';

const MIME_TYPE_CSV = 'text/csv';

export type DirectorySelectionResult =
  | { ok: true; uri: string }
  | { ok: false; cancelled: boolean; message?: string };

const isPermissionGranted = (permission: DirectoryPermission | null): permission is DirectoryPermission & { uri: string } =>
  Boolean(permission && permission.granted && permission.uri);

const persistDirectoryPermission = async (uri: string): Promise<void> => {
  if (typeof StorageAccessFramework.persistAccessPermissions === 'function') {
    await StorageAccessFramework.persistAccessPermissions(uri);
    return;
  }
  if (typeof StorageAccessFramework.persistPermissions === 'function') {
    await StorageAccessFramework.persistPermissions(uri);
    return;
  }
  if (typeof StorageAccessFramework.takePersistableUriPermission === 'function') {
    await StorageAccessFramework.takePersistableUriPermission(uri);
  }
};

export const requestDirectorySelection = async (): Promise<DirectorySelectionResult> => {
  try {
    const permission = await StorageAccessFramework.requestDirectoryPermissions();
    if (!isPermissionGranted(permission)) {
      return { ok: false, cancelled: true, message: permission?.error };
    }

    await persistDirectoryPermission(permission.uri);
    return { ok: true, uri: permission.uri };
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Failed to request directory permissions.';
    return { ok: false, cancelled: false, message };
  }
};

export const createCsvFileInDirectory = async (
  directoryUri: string,
  filename: string,
  content: string,
): Promise<string> => {
  const fileUri = await StorageAccessFramework.createFile(directoryUri, filename, MIME_TYPE_CSV);
  await StorageAccessFramework.writeFile(fileUri, content, 'utf8');
  return fileUri;
};

export const readFileAsBase64 = async (uri: string): Promise<string> => {
  return StorageAccessFramework.readFile(uri, 'base64');
};

export const deleteFileUri = async (uri: string | null | undefined): Promise<void> => {
  if (!uri) {
    return;
  }
  try {
    await StorageAccessFramework.deleteFile(uri);
  } catch {
    // Ignore failures; file may already be gone or permission revoked.
  }
};
