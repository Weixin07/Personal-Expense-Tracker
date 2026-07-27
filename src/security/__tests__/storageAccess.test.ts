import {
  openDocument,
  openDocumentTree,
  readFile,
  writeFile,
  unlink,
} from 'react-native-saf-x';
import {
  requestDirectorySelection,
  createCsvFileInDirectory,
  readFileAsBase64,
  readFileAsString,
  pickCsvFile,
  deleteFileUri,
} from '../storageAccess';

jest.mock('react-native-saf-x', () => ({
  openDocument: jest.fn(),
  openDocumentTree: jest.fn(),
  readFile: jest.fn(),
  writeFile: jest.fn(),
  unlink: jest.fn(),
}));

const mockOpenDocument = openDocument as jest.MockedFunction<
  typeof openDocument
>;
const mockOpenDocumentTree = openDocumentTree as jest.MockedFunction<
  typeof openDocumentTree
>;
const mockReadFile = readFile as jest.MockedFunction<typeof readFile>;
const mockWriteFile = writeFile as jest.MockedFunction<typeof writeFile>;
const mockUnlink = unlink as jest.MockedFunction<typeof unlink>;

const documentDetail = (uri: string) => ({
  uri,
  name: uri.split('/').pop() ?? '',
  type: 'file' as const,
  lastModified: 0,
  mime: 'text/csv',
  size: 0,
});

beforeEach(() => {
  jest.clearAllMocks();
  mockOpenDocumentTree.mockResolvedValue(documentDetail('content://mock/tree'));
  mockReadFile.mockResolvedValue('base64-content');
  mockWriteFile.mockResolvedValue(undefined);
  mockUnlink.mockResolvedValue(true);
  mockOpenDocument.mockResolvedValue([
    documentDetail('content://mock/pick.csv'),
  ]);
});

describe('requestDirectorySelection', () => {
  it('returns the granted uri from the selected tree', async () => {
    const result = await requestDirectorySelection();

    expect(mockOpenDocumentTree).toHaveBeenCalledWith(true);
    expect(result).toEqual({ ok: true, uri: 'content://mock/tree' });
  });

  it('reports cancellation when nothing is selected', async () => {
    mockOpenDocumentTree.mockResolvedValue(null);

    const result = await requestDirectorySelection();

    expect(result).toEqual({ ok: false, cancelled: true });
  });

  it('surfaces the error message when the request throws an Error', async () => {
    mockOpenDocumentTree.mockRejectedValue(new Error('boom'));

    const result = await requestDirectorySelection();

    expect(result).toEqual({ ok: false, cancelled: false, message: 'boom' });
  });

  it('falls back to a default message for non-Error throws', async () => {
    mockOpenDocumentTree.mockRejectedValue('weird');

    const result = await requestDirectorySelection();

    expect(result).toEqual({
      ok: false,
      cancelled: false,
      message: 'Failed to request directory permissions.',
    });
  });
});

describe('createCsvFileInDirectory', () => {
  it('writes the CSV under the directory uri and returns the child uri', async () => {
    const fileUri = await createCsvFileInDirectory(
      'content://mock/tree',
      'expenses.csv',
      'a,b,c',
    );

    expect(mockWriteFile).toHaveBeenCalledWith(
      'content://mock/tree/expenses.csv',
      'a,b,c',
      { encoding: 'utf8', mimeType: 'text/csv' },
    );
    expect(fileUri).toBe('content://mock/tree/expenses.csv');
  });
});

describe('readFileAsBase64', () => {
  it('reads the uri with base64 encoding', async () => {
    const content = await readFileAsBase64('content://mock/file');

    expect(mockReadFile).toHaveBeenCalledWith('content://mock/file', {
      encoding: 'base64',
    });
    expect(content).toBe('base64-content');
  });
});

describe('readFileAsString', () => {
  it('reads the uri with utf8 encoding', async () => {
    mockReadFile.mockResolvedValue('a,b,c');
    const content = await readFileAsString('content://mock/file');

    expect(mockReadFile).toHaveBeenCalledWith('content://mock/file', {
      encoding: 'utf8',
    });
    expect(content).toBe('a,b,c');
  });
});

describe('pickCsvFile', () => {
  it('returns the picked document uri from the array selection', async () => {
    const result = await pickCsvFile();

    expect(mockOpenDocument).toHaveBeenCalledWith({
      persist: false,
      multiple: false,
    });
    expect(result).toEqual({ ok: true, uri: 'content://mock/pick.csv' });
  });

  it('unwraps the first entry of a multi-item selection', async () => {
    mockOpenDocument.mockResolvedValue([
      documentDetail('content://mock/first.csv'),
      documentDetail('content://mock/second.csv'),
    ]);

    const result = await pickCsvFile();

    expect(result).toEqual({ ok: true, uri: 'content://mock/first.csv' });
  });

  it('reports cancellation when nothing is selected', async () => {
    mockOpenDocument.mockResolvedValue(null);

    const result = await pickCsvFile();

    expect(result).toEqual({ ok: false, cancelled: true });
  });

  it('surfaces errors as a non-cancelled failure', async () => {
    mockOpenDocument.mockRejectedValue(new Error('picker crashed'));

    const result = await pickCsvFile();

    expect(result).toEqual({
      ok: false,
      cancelled: false,
      message: 'picker crashed',
    });
  });
});

describe('deleteFileUri', () => {
  it('does nothing when the uri is falsy', async () => {
    await deleteFileUri(null);
    await deleteFileUri(undefined);
    await deleteFileUri('');

    expect(mockUnlink).not.toHaveBeenCalled();
  });

  it('unlinks the file for a valid uri', async () => {
    await deleteFileUri('content://mock/file');

    expect(mockUnlink).toHaveBeenCalledWith('content://mock/file');
  });

  it('swallows deletion failures', async () => {
    mockUnlink.mockRejectedValue(new Error('gone'));

    await expect(deleteFileUri('content://mock/file')).resolves.toBeUndefined();
  });
});
