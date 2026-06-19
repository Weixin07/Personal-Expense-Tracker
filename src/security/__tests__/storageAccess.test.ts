import { StorageAccessFramework } from 'react-native-saf-x';
import {
  requestDirectorySelection,
  createCsvFileInDirectory,
  readFileAsBase64,
  deleteFileUri,
} from '../storageAccess';

jest.mock('react-native-saf-x', () => ({
  StorageAccessFramework: {},
}));

const saf = StorageAccessFramework as unknown as Record<string, jest.Mock>;

beforeEach(() => {
  saf.requestDirectoryPermissions = jest.fn(() =>
    Promise.resolve({ granted: true, uri: 'content://mock/tree' }),
  );
  saf.persistAccessPermissions = jest.fn(() => Promise.resolve());
  saf.persistPermissions = jest.fn(() => Promise.resolve());
  saf.takePersistableUriPermission = jest.fn(() => Promise.resolve());
  saf.createFile = jest.fn(() => Promise.resolve('content://mock/file'));
  saf.writeFile = jest.fn(() => Promise.resolve());
  saf.readFile = jest.fn(() => Promise.resolve('base64-content'));
  saf.deleteFile = jest.fn(() => Promise.resolve());
});

describe('requestDirectorySelection', () => {
  it('returns the granted uri and persists the permission', async () => {
    const result = await requestDirectorySelection();

    expect(result).toEqual({ ok: true, uri: 'content://mock/tree' });
    expect(saf.persistAccessPermissions).toHaveBeenCalledWith(
      'content://mock/tree',
    );
  });

  it('reports cancellation when permission is not granted', async () => {
    saf.requestDirectoryPermissions.mockResolvedValue({
      granted: false,
      error: 'user denied',
    });

    const result = await requestDirectorySelection();

    expect(result).toEqual({
      ok: false,
      cancelled: true,
      message: 'user denied',
    });
    expect(saf.persistAccessPermissions).not.toHaveBeenCalled();
  });

  it('reports cancellation when permission is null', async () => {
    saf.requestDirectoryPermissions.mockResolvedValue(null);

    const result = await requestDirectorySelection();

    expect(result).toEqual({
      ok: false,
      cancelled: true,
      message: undefined,
    });
  });

  it('surfaces the error message when the request throws an Error', async () => {
    saf.requestDirectoryPermissions.mockRejectedValue(new Error('boom'));

    const result = await requestDirectorySelection();

    expect(result).toEqual({ ok: false, cancelled: false, message: 'boom' });
  });

  it('falls back to a default message for non-Error throws', async () => {
    saf.requestDirectoryPermissions.mockRejectedValue('weird');

    const result = await requestDirectorySelection();

    expect(result).toEqual({
      ok: false,
      cancelled: false,
      message: 'Failed to request directory permissions.',
    });
  });

  describe('permission persistence fallback', () => {
    it('uses persistAccessPermissions when available', async () => {
      await requestDirectorySelection();

      expect(saf.persistAccessPermissions).toHaveBeenCalledWith(
        'content://mock/tree',
      );
      expect(saf.persistPermissions).not.toHaveBeenCalled();
      expect(saf.takePersistableUriPermission).not.toHaveBeenCalled();
    });

    it('falls back to persistPermissions', async () => {
      delete saf.persistAccessPermissions;

      await requestDirectorySelection();

      expect(saf.persistPermissions).toHaveBeenCalledWith(
        'content://mock/tree',
      );
      expect(saf.takePersistableUriPermission).not.toHaveBeenCalled();
    });

    it('falls back to takePersistableUriPermission', async () => {
      delete saf.persistAccessPermissions;
      delete saf.persistPermissions;

      await requestDirectorySelection();

      expect(saf.takePersistableUriPermission).toHaveBeenCalledWith(
        'content://mock/tree',
      );
    });

    it('persists nothing when no persistence method exists', async () => {
      delete saf.persistAccessPermissions;
      delete saf.persistPermissions;
      delete saf.takePersistableUriPermission;

      const result = await requestDirectorySelection();

      expect(result).toEqual({ ok: true, uri: 'content://mock/tree' });
    });
  });
});

describe('createCsvFileInDirectory', () => {
  it('creates then writes the file as CSV and returns its uri', async () => {
    const fileUri = await createCsvFileInDirectory(
      'content://mock/tree',
      'expenses.csv',
      'a,b,c',
    );

    expect(saf.createFile).toHaveBeenCalledWith(
      'content://mock/tree',
      'expenses.csv',
      'text/csv',
    );
    expect(saf.writeFile).toHaveBeenCalledWith(
      'content://mock/file',
      'a,b,c',
      'utf8',
    );
    expect(fileUri).toBe('content://mock/file');
  });
});

describe('readFileAsBase64', () => {
  it('reads the uri with base64 encoding', async () => {
    const content = await readFileAsBase64('content://mock/file');

    expect(saf.readFile).toHaveBeenCalledWith('content://mock/file', 'base64');
    expect(content).toBe('base64-content');
  });
});

describe('deleteFileUri', () => {
  it('does nothing when the uri is falsy', async () => {
    await deleteFileUri(null);
    await deleteFileUri(undefined);
    await deleteFileUri('');

    expect(saf.deleteFile).not.toHaveBeenCalled();
  });

  it('deletes the file for a valid uri', async () => {
    await deleteFileUri('content://mock/file');

    expect(saf.deleteFile).toHaveBeenCalledWith('content://mock/file');
  });

  it('swallows deletion failures', async () => {
    saf.deleteFile.mockRejectedValue(new Error('gone'));

    await expect(deleteFileUri('content://mock/file')).resolves.toBeUndefined();
  });
});
