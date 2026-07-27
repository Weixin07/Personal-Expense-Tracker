import {
  openDocument,
  openDocumentTree,
  readFile,
  writeFile,
  unlink,
} from 'react-native-saf-x';

const MIME_TYPE_CSV = 'text/csv';

export type DirectorySelectionResult =
  | { ok: true; uri: string }
  | { ok: false; cancelled: boolean; message?: string };

export const requestDirectorySelection =
  async (): Promise<DirectorySelectionResult> => {
    try {
      const directory = await openDocumentTree(true);
      if (!directory || !directory.uri) {
        return { ok: false, cancelled: true };
      }
      return { ok: true, uri: directory.uri };
    } catch (error) {
      const message =
        error instanceof Error
          ? error.message
          : 'Failed to request directory permissions.';
      return { ok: false, cancelled: false, message };
    }
  };

export const createCsvFileInDirectory = async (
  directoryUri: string,
  filename: string,
  content: string,
): Promise<string> => {
  const fileUri = `${directoryUri}/${filename}`;
  await writeFile(fileUri, content, {
    encoding: 'utf8',
    mimeType: MIME_TYPE_CSV,
  });
  return fileUri;
};

export const readFileAsBase64 = async (uri: string): Promise<string> => {
  return readFile(uri, { encoding: 'base64' });
};

export const readFileAsString = async (uri: string): Promise<string> => {
  return readFile(uri, { encoding: 'utf8' });
};

export type FileSelectionResult =
  | { ok: true; uri: string }
  | { ok: false; cancelled: boolean; message?: string };

export const pickCsvFile = async (): Promise<FileSelectionResult> => {
  try {
    const selection = await openDocument({ persist: false, multiple: false });
    const document = Array.isArray(selection) ? selection[0] : selection;
    if (!document || !document.uri) {
      return { ok: false, cancelled: true };
    }
    return { ok: true, uri: document.uri };
  } catch (error) {
    const message =
      error instanceof Error ? error.message : 'Failed to open document.';
    return { ok: false, cancelled: false, message };
  }
};

export const deleteFileUri = async (
  uri: string | null | undefined,
): Promise<void> => {
  if (!uri) {
    return;
  }
  try {
    await unlink(uri);
  } catch {
    // Ignore failures; file may already be gone or permission revoked.
  }
};
