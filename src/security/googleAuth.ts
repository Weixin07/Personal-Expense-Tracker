import {
  GoogleSignin,
  statusCodes,
} from '@react-native-google-signin/google-signin';
import { getGoogleSignInConfig, GOOGLE_DRIVE_SCOPE } from './googleConfig';

export type GoogleAuthState = {
  accessToken: string;
};

export type GoogleAuthErrorKind =
  | 'play-services-unavailable'
  | 'developer-error'
  | 'network'
  | 'unknown';

export class GoogleAuthError extends Error {
  readonly kind: GoogleAuthErrorKind;

  constructor(kind: GoogleAuthErrorKind, message: string) {
    super(message);
    this.name = 'GoogleAuthError';
    this.kind = kind;
  }
}

// Google Play services CommonStatusCodes surfaced by the native module as the
// numeric status code in string form. DEVELOPER_ERROR (10) means the running
// build's OAuth client / SHA-1 is misconfigured; NETWORK_ERROR (7) is transient.
// The library's `statusCodes` export does not include either of these.
const DEVELOPER_ERROR_CODE = '10';
const NETWORK_ERROR_CODE = '7';

const errorCode = (error: unknown): string | undefined =>
  typeof error === 'object' && error !== null && 'code' in error
    ? String((error as { code: unknown }).code)
    : undefined;

const classifyAuthError = (error: unknown): GoogleAuthError => {
  const message =
    error instanceof Error ? error.message : 'Google sign-in failed.';
  switch (errorCode(error)) {
    case statusCodes.PLAY_SERVICES_NOT_AVAILABLE:
      return new GoogleAuthError('play-services-unavailable', message);
    case DEVELOPER_ERROR_CODE:
      return new GoogleAuthError('developer-error', message);
    case NETWORK_ERROR_CODE:
      return new GoogleAuthError('network', message);
    default:
      return new GoogleAuthError('unknown', message);
  }
};

const ensureConfigured = (): void => {
  const { webClientId } = getGoogleSignInConfig();
  GoogleSignin.configure({
    webClientId,
    offlineAccess: true,
    scopes: [GOOGLE_DRIVE_SCOPE],
  });
};

const currentAccessToken = async (): Promise<string> => {
  const { accessToken } = await GoogleSignin.getTokens();
  return accessToken;
};

/**
 * Resolves a Google Drive access token. Returns null when the user cancels the
 * prompt or has no usable session and interactive sign-in was not requested.
 * Throws GoogleAuthError for hard failures (misconfigured OAuth client, Play
 * services unavailable, network); callers must surface these rather than treat
 * them as a plain "not signed in" result.
 */
export const ensureValidAccessToken = async (
  options: { interactive?: boolean } = {},
): Promise<string | null> => {
  const { interactive = false } = options;
  ensureConfigured();

  try {
    const silent = await GoogleSignin.signInSilently();
    if (silent.type === 'success') {
      return await currentAccessToken();
    }
  } catch {
    // No usable silent session; fall through to interactive sign-in or null.
  }

  if (!interactive) {
    return null;
  }

  try {
    await GoogleSignin.hasPlayServices({ showPlayServicesUpdateDialog: true });
    const result = await GoogleSignin.signIn();
    if (result.type !== 'success') {
      return null;
    }
    return await currentAccessToken();
  } catch (error) {
    throw classifyAuthError(error);
  }
};

export const ensureInteractiveAccessToken = async (): Promise<string> => {
  const token = await ensureValidAccessToken({ interactive: true });
  if (!token) {
    throw new Error('Authentication is required.');
  }
  return token;
};

export const clearAuthState = async (): Promise<void> => {
  ensureConfigured();
  await GoogleSignin.signOut();
};

export const getStoredAuthState = async (): Promise<GoogleAuthState | null> => {
  ensureConfigured();
  if (!GoogleSignin.getCurrentUser()) {
    return null;
  }
  try {
    return { accessToken: await currentAccessToken() };
  } catch {
    return null;
  }
};
