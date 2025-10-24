import { authorize, refresh, type AuthorizeResult, type RefreshResult } from 'react-native-app-auth';
import * as Keychain from 'react-native-keychain';
import { getGoogleOAuthConfig, GOOGLE_DRIVE_SCOPE } from './googleConfig';

const AUTH_SERVICE = 'google-drive-auth';
const AUTH_USERNAME = 'google-drive';
const EXPIRY_BUFFER_MS = 60 * 1000; // 1 minute

export type GoogleAuthState = {
  accessToken: string;
  accessTokenExpirationDate: string;
  refreshToken?: string;
};

const buildAppAuthConfig = () => {
  const { clientId, redirectUri } = getGoogleOAuthConfig();
  return {
    serviceConfiguration: {
      authorizationEndpoint: 'https://accounts.google.com/o/oauth2/v2/auth',
      tokenEndpoint: 'https://oauth2.googleapis.com/token',
    },
    clientId,
    redirectUrl: redirectUri,
    scopes: [GOOGLE_DRIVE_SCOPE, 'openid', 'profile'],
    additionalParameters: {
      access_type: 'offline',
      prompt: 'consent',
    },
  } as const;
};

const readStoredAuthState = async (): Promise<GoogleAuthState | null> => {
  try {
    const result = await Keychain.getGenericPassword({ service: AUTH_SERVICE });
    if (!result) {
      return null;
    }
    return JSON.parse(result.password) as GoogleAuthState;
  } catch {
    return null;
  }
};

const storeAuthState = async (state: GoogleAuthState): Promise<void> => {
  await Keychain.setGenericPassword(AUTH_USERNAME, JSON.stringify(state), {
    service: AUTH_SERVICE,
    accessible: Keychain.ACCESSIBLE.WHEN_UNLOCKED_THIS_DEVICE_ONLY,
  });
};

export const clearAuthState = async (): Promise<void> => {
  await Keychain.resetGenericPassword({ service: AUTH_SERVICE });
};

const isTokenExpired = (state: GoogleAuthState): boolean => {
  const expiresAt = Date.parse(state.accessTokenExpirationDate);
  if (Number.isNaN(expiresAt)) {
    return true;
  }
  return Date.now() + EXPIRY_BUFFER_MS >= expiresAt;
};

const authorizeInteractive = async (): Promise<GoogleAuthState> => {
  const config = buildAppAuthConfig();
  const result: AuthorizeResult = await authorize(config);
  const nextState: GoogleAuthState = {
    accessToken: result.accessToken,
    accessTokenExpirationDate: result.accessTokenExpirationDate,
    refreshToken: result.refreshToken ?? undefined,
  };
  await storeAuthState(nextState);
  return nextState;
};

const refreshAccessToken = async (state: GoogleAuthState): Promise<GoogleAuthState | null> => {
  if (!state.refreshToken) {
    return null;
  }
  const config = buildAppAuthConfig();
  const result: RefreshResult = await refresh(config, {
    refreshToken: state.refreshToken,
  });
  const nextState: GoogleAuthState = {
    accessToken: result.accessToken,
    accessTokenExpirationDate: result.accessTokenExpirationDate,
    refreshToken: result.refreshToken ?? state.refreshToken,
  };
  await storeAuthState(nextState);
  return nextState;
};

export const ensureValidAccessToken = async (
  options: { interactive?: boolean } = {},
): Promise<string | null> => {
  const { interactive = false } = options;
  let authState = await readStoredAuthState();

  if (!authState) {
    if (!interactive) {
      return null;
    }
    authState = await authorizeInteractive();
  }

  if (isTokenExpired(authState)) {
    try {
      const refreshed = await refreshAccessToken(authState);
      authState = refreshed ?? authState;
    } catch (error) {
      if (!interactive) {
        return null;
      }
      authState = await authorizeInteractive();
    }
  }

  return authState.accessToken;
};

export const ensureInteractiveAccessToken = async (): Promise<string> => {
  const token = await ensureValidAccessToken({ interactive: true });
  if (!token) {
    throw new Error('Authentication is required.');
  }
  return token;
};

export const getStoredAuthState = async (): Promise<GoogleAuthState | null> => {
  return readStoredAuthState();
};