/**
 * Integration tests for Google OAuth authentication flow
 */

import {authorize, refresh} from 'react-native-app-auth';
import * as Keychain from 'react-native-keychain';
import {
  ensureValidAccessToken,
  ensureInteractiveAccessToken,
  clearAuthState,
  getStoredAuthState,
} from '../googleAuth';

// Mock implementations
const mockAuthorize = authorize as jest.MockedFunction<typeof authorize>;
const mockRefresh = refresh as jest.MockedFunction<typeof refresh>;
const mockGetGenericPassword = Keychain.getGenericPassword as jest.MockedFunction<
  typeof Keychain.getGenericPassword
>;
const mockSetGenericPassword = Keychain.setGenericPassword as jest.MockedFunction<
  typeof Keychain.setGenericPassword
>;
const mockResetGenericPassword = Keychain.resetGenericPassword as jest.MockedFunction<
  typeof Keychain.resetGenericPassword
>;

describe('Google OAuth Integration Tests', () => {
  beforeEach(() => {
    jest.clearAllMocks();
  });

  describe('ensureValidAccessToken', () => {
    it('should return null when no stored auth state and not interactive', async () => {
      mockGetGenericPassword.mockResolvedValue(false);

      const token = await ensureValidAccessToken({interactive: false});

      expect(token).toBeNull();
      expect(mockAuthorize).not.toHaveBeenCalled();
    });

    it('should trigger authorization flow when no stored auth state and interactive', async () => {
      mockGetGenericPassword.mockResolvedValue(false);
      mockAuthorize.mockResolvedValue({
        accessToken: 'new-access-token',
        accessTokenExpirationDate: new Date(Date.now() + 3600000).toISOString(),
        refreshToken: 'new-refresh-token',
        tokenType: 'Bearer',
        idToken: 'new-id-token',
        scopes: ['https://www.googleapis.com/auth/drive.file'],
      });
      mockSetGenericPassword.mockResolvedValue(true);

      const token = await ensureValidAccessToken({interactive: true});

      expect(token).toBe('new-access-token');
      expect(mockAuthorize).toHaveBeenCalledTimes(1);
      expect(mockSetGenericPassword).toHaveBeenCalledTimes(1);
    });

    it('should return valid token when stored auth state is not expired', async () => {
      const futureDate = new Date(Date.now() + 3600000).toISOString();
      mockGetGenericPassword.mockResolvedValue({
        service: 'google-drive-auth',
        username: 'google-drive',
        password: JSON.stringify({
          accessToken: 'valid-token',
          accessTokenExpirationDate: futureDate,
          refreshToken: 'refresh-token',
        }),
        storage: 'keychain',
      });

      const token = await ensureValidAccessToken({interactive: false});

      expect(token).toBe('valid-token');
      expect(mockRefresh).not.toHaveBeenCalled();
      expect(mockAuthorize).not.toHaveBeenCalled();
    });

    it('should refresh token when stored auth state is expired', async () => {
      const pastDate = new Date(Date.now() - 3600000).toISOString();
      mockGetGenericPassword.mockResolvedValue({
        service: 'google-drive-auth',
        username: 'google-drive',
        password: JSON.stringify({
          accessToken: 'expired-token',
          accessTokenExpirationDate: pastDate,
          refreshToken: 'refresh-token',
        }),
        storage: 'keychain',
      });
      mockRefresh.mockResolvedValue({
        accessToken: 'refreshed-token',
        accessTokenExpirationDate: new Date(Date.now() + 3600000).toISOString(),
        tokenType: 'Bearer',
        idToken: 'new-id-token',
      });
      mockSetGenericPassword.mockResolvedValue(true);

      const token = await ensureValidAccessToken({interactive: false});

      expect(token).toBe('refreshed-token');
      expect(mockRefresh).toHaveBeenCalledWith(
        expect.objectContaining({
          usePKCE: true,
        }),
        expect.objectContaining({
          refreshToken: 'refresh-token',
        }),
      );
      expect(mockSetGenericPassword).toHaveBeenCalledTimes(1);
    });

    it('should re-authorize when refresh fails and interactive', async () => {
      const pastDate = new Date(Date.now() - 3600000).toISOString();
      mockGetGenericPassword.mockResolvedValue({
        service: 'google-drive-auth',
        username: 'google-drive',
        password: JSON.stringify({
          accessToken: 'expired-token',
          accessTokenExpirationDate: pastDate,
          refreshToken: 'invalid-refresh-token',
        }),
        storage: 'keychain',
      });
      mockRefresh.mockRejectedValue(new Error('Invalid refresh token'));
      mockAuthorize.mockResolvedValue({
        accessToken: 'new-access-token',
        accessTokenExpirationDate: new Date(Date.now() + 3600000).toISOString(),
        refreshToken: 'new-refresh-token',
        tokenType: 'Bearer',
        idToken: 'new-id-token',
        scopes: ['https://www.googleapis.com/auth/drive.file'],
      });
      mockSetGenericPassword.mockResolvedValue(true);

      const token = await ensureValidAccessToken({interactive: true});

      expect(token).toBe('new-access-token');
      expect(mockRefresh).toHaveBeenCalledTimes(1);
      expect(mockAuthorize).toHaveBeenCalledTimes(1);
    });

    it('should return null when refresh fails and not interactive', async () => {
      const pastDate = new Date(Date.now() - 3600000).toISOString();
      mockGetGenericPassword.mockResolvedValue({
        service: 'google-drive-auth',
        username: 'google-drive',
        password: JSON.stringify({
          accessToken: 'expired-token',
          accessTokenExpirationDate: pastDate,
          refreshToken: 'invalid-refresh-token',
        }),
        storage: 'keychain',
      });
      mockRefresh.mockRejectedValue(new Error('Invalid refresh token'));

      const token = await ensureValidAccessToken({interactive: false});

      expect(token).toBeNull();
      expect(mockAuthorize).not.toHaveBeenCalled();
    });
  });

  describe('ensureInteractiveAccessToken', () => {
    it('should always trigger interactive flow when needed', async () => {
      mockGetGenericPassword.mockResolvedValue(false);
      mockAuthorize.mockResolvedValue({
        accessToken: 'interactive-token',
        accessTokenExpirationDate: new Date(Date.now() + 3600000).toISOString(),
        refreshToken: 'refresh-token',
        tokenType: 'Bearer',
        idToken: 'id-token',
        scopes: ['https://www.googleapis.com/auth/drive.file'],
      });
      mockSetGenericPassword.mockResolvedValue(true);

      const token = await ensureInteractiveAccessToken();

      expect(token).toBe('interactive-token');
      expect(mockAuthorize).toHaveBeenCalledTimes(1);
    });

    it('should throw error if interactive auth fails', async () => {
      mockGetGenericPassword.mockResolvedValue(false);
      mockAuthorize.mockRejectedValue(new Error('User cancelled'));

      await expect(ensureInteractiveAccessToken()).rejects.toThrow();
    });
  });

  describe('clearAuthState', () => {
    it('should clear stored credentials', async () => {
      mockResetGenericPassword.mockResolvedValue(true);

      await clearAuthState();

      expect(mockResetGenericPassword).toHaveBeenCalledWith({
        service: 'google-drive-auth',
      });
    });
  });

  describe('getStoredAuthState', () => {
    it('should return null when no credentials are stored', async () => {
      mockGetGenericPassword.mockResolvedValue(false);

      const state = await getStoredAuthState();

      expect(state).toBeNull();
    });

    it('should return parsed auth state when credentials exist', async () => {
      const authState = {
        accessToken: 'stored-token',
        accessTokenExpirationDate: new Date(Date.now() + 3600000).toISOString(),
        refreshToken: 'stored-refresh-token',
      };
      mockGetGenericPassword.mockResolvedValue({
        service: 'google-drive-auth',
        username: 'google-drive',
        password: JSON.stringify(authState),
        storage: 'keychain',
      });

      const state = await getStoredAuthState();

      expect(state).toEqual(authState);
    });

    it('should return null when stored data is corrupted', async () => {
      mockGetGenericPassword.mockResolvedValue({
        service: 'google-drive-auth',
        username: 'google-drive',
        password: 'invalid-json',
        storage: 'keychain',
      });

      const state = await getStoredAuthState();

      expect(state).toBeNull();
    });
  });

  describe('PKCE Configuration', () => {
    it('should include usePKCE in authorization config', async () => {
      mockGetGenericPassword.mockResolvedValue(false);
      mockAuthorize.mockResolvedValue({
        accessToken: 'pkce-token',
        accessTokenExpirationDate: new Date(Date.now() + 3600000).toISOString(),
        refreshToken: 'refresh-token',
        tokenType: 'Bearer',
        idToken: 'id-token',
        scopes: ['https://www.googleapis.com/auth/drive.file'],
      });
      mockSetGenericPassword.mockResolvedValue(true);

      await ensureValidAccessToken({interactive: true});

      expect(mockAuthorize).toHaveBeenCalledWith(
        expect.objectContaining({
          usePKCE: true,
          serviceConfiguration: expect.objectContaining({
            authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
            tokenEndpoint: 'https://oauth2.googleapis.com/token',
          }),
          scopes: expect.arrayContaining([
            'https://www.googleapis.com/auth/drive.file',
          ]),
          additionalParameters: expect.objectContaining({
            access_type: 'offline',
            prompt: 'consent',
          }),
        }),
      );
    });
  });
});
