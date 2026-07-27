import { listBackupFiles, downloadFileContent } from '../driveDownloader';
import * as database from '../../database';
import * as googleAuth from '../../security/googleAuth';
import { GoogleAuthError } from '../../security/googleAuth';
import type { SQLiteDatabase } from 'react-native-sqlite-storage';

jest.mock('../../database');
jest.mock('../../security/googleAuth', () => {
  const actual = jest.requireActual('../../security/googleAuth');
  return { ...actual, ensureValidAccessToken: jest.fn() };
});

global.fetch = jest.fn();

describe('driveDownloader', () => {
  const mockDb = {} as unknown as SQLiteDatabase;

  beforeEach(() => {
    jest.clearAllMocks();
    (database.withDatabase as jest.Mock).mockImplementation(cb => cb(mockDb));
  });

  describe('listBackupFiles', () => {
    it('requires auth when no access token is available', async () => {
      (googleAuth.ensureValidAccessToken as jest.Mock).mockResolvedValue(null);

      const result = await listBackupFiles();

      expect(result).toEqual({ ok: false, requiresAuth: true });
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('returns an empty list when no folder is configured', async () => {
      (googleAuth.ensureValidAccessToken as jest.Mock).mockResolvedValue('tok');
      (database.getSetting as jest.Mock).mockResolvedValue(null);

      const result = await listBackupFiles();

      expect(result).toEqual({ ok: true, files: [] });
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('lists CSV files in the backup folder', async () => {
      (googleAuth.ensureValidAccessToken as jest.Mock).mockResolvedValue('tok');
      (database.getSetting as jest.Mock).mockResolvedValue('folder-1');
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        status: 200,
        json: () =>
          Promise.resolve({
            files: [
              { id: 'f1', name: 'a.csv', modifiedTime: '2024-01-01T00:00:00Z' },
            ],
          }),
      });

      const result = await listBackupFiles({ interactive: true });

      expect(googleAuth.ensureValidAccessToken).toHaveBeenCalledWith({
        interactive: true,
      });
      const url = (global.fetch as jest.Mock).mock.calls[0][0] as string;
      const query = decodeURIComponent(url);
      expect(query).toContain("'folder-1' in parents");
      expect(query).toContain('trashed = false');
      expect(query).toContain("mimeType = 'text/csv'");
      expect(query).toContain("name contains '.csv'");
      expect(result).toEqual({
        ok: true,
        files: [
          { id: 'f1', name: 'a.csv', modifiedTime: '2024-01-01T00:00:00Z' },
        ],
      });
    });

    it('surfaces a hard auth error as a non-auth result carrying the error kind', async () => {
      (googleAuth.ensureValidAccessToken as jest.Mock).mockRejectedValue(
        new GoogleAuthError('developer-error', 'DEVELOPER_ERROR'),
      );

      const result = await listBackupFiles({ interactive: true });

      expect(result).toEqual({
        ok: false,
        requiresAuth: false,
        message: 'DEVELOPER_ERROR',
        errorKind: 'developer-error',
      });
      expect(global.fetch).not.toHaveBeenCalled();
    });

    it('maps auth failures to requiresAuth', async () => {
      (googleAuth.ensureValidAccessToken as jest.Mock).mockResolvedValue('tok');
      (database.getSetting as jest.Mock).mockResolvedValue('folder-1');
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 403,
        json: () => Promise.resolve({ error: { message: 'Forbidden' } }),
      });

      const result = await listBackupFiles();

      expect(result).toEqual({
        ok: false,
        requiresAuth: true,
        message: 'Forbidden',
      });
    });
  });

  describe('downloadFileContent', () => {
    it('throws when not signed in', async () => {
      (googleAuth.ensureValidAccessToken as jest.Mock).mockResolvedValue(null);

      await expect(downloadFileContent('f1')).rejects.toThrow(/sign-in/i);
    });

    it('returns the raw text via alt=media', async () => {
      (googleAuth.ensureValidAccessToken as jest.Mock).mockResolvedValue('tok');
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: true,
        status: 200,
        text: () => Promise.resolve('a,b\r\n1,2\r\n'),
      });

      const content = await downloadFileContent('f1');

      const url = (global.fetch as jest.Mock).mock.calls[0][0] as string;
      expect(url).toContain('f1?alt=media');
      expect(content).toBe('a,b\r\n1,2\r\n');
    });

    it('throws a Drive error on non-ok responses', async () => {
      (googleAuth.ensureValidAccessToken as jest.Mock).mockResolvedValue('tok');
      (global.fetch as jest.Mock).mockResolvedValue({
        ok: false,
        status: 404,
        json: () => Promise.resolve({ error: { message: 'Not Found' } }),
      });

      await expect(downloadFileContent('missing')).rejects.toThrow('Not Found');
    });
  });
});
