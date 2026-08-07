import {
  GoogleSignin,
  statusCodes,
} from '@react-native-google-signin/google-signin';
import {
  ensureValidAccessToken,
  ensureInteractiveAccessToken,
  clearAuthState,
  getStoredAuthState,
  GoogleAuthError,
} from '../googleAuth';

const mockConfigure = GoogleSignin.configure as jest.Mock;
const mockHasPlayServices = GoogleSignin.hasPlayServices as jest.Mock;
const mockSignIn = GoogleSignin.signIn as jest.Mock;
const mockSignInSilently = GoogleSignin.signInSilently as jest.Mock;
const mockGetTokens = GoogleSignin.getTokens as jest.Mock;
const mockGetCurrentUser = GoogleSignin.getCurrentUser as jest.Mock;
const mockSignOut = GoogleSignin.signOut as jest.Mock;

const silentSuccess = { type: 'success', data: { user: {} } };
const silentNone = { type: 'noSavedCredentialFound' };
const signInSuccess = {
  type: 'success',
  data: { scopes: ['https://www.googleapis.com/auth/drive.file'], user: {} },
};
const signInCancelled = { type: 'cancelled' };

beforeEach(() => {
  jest.clearAllMocks();
  mockHasPlayServices.mockResolvedValue(true);
  mockGetTokens.mockResolvedValue({
    accessToken: 'access-token',
    idToken: 'id-token',
  });
  mockSignInSilently.mockResolvedValue(silentNone);
  mockGetCurrentUser.mockReturnValue(null);
});

describe('ensureValidAccessToken', () => {
  it('returns null when there is no saved session and not interactive', async () => {
    const token = await ensureValidAccessToken({ interactive: false });

    expect(token).toBeNull();
    expect(mockSignIn).not.toHaveBeenCalled();
  });

  it('returns the token from a silent session without prompting', async () => {
    mockSignInSilently.mockResolvedValue(silentSuccess);

    const token = await ensureValidAccessToken({ interactive: false });

    expect(token).toBe('access-token');
    expect(mockSignIn).not.toHaveBeenCalled();
    expect(mockGetTokens).toHaveBeenCalledTimes(1);
  });

  it('prompts interactively when no silent session and interactive', async () => {
    mockSignIn.mockResolvedValue(signInSuccess);

    const token = await ensureValidAccessToken({ interactive: true });

    expect(token).toBe('access-token');
    expect(mockHasPlayServices).toHaveBeenCalledTimes(1);
    expect(mockSignIn).toHaveBeenCalledTimes(1);
  });

  it('falls through to interactive when the silent attempt throws', async () => {
    mockSignInSilently.mockRejectedValue(new Error('no network'));
    mockSignIn.mockResolvedValue(signInSuccess);

    const token = await ensureValidAccessToken({ interactive: true });

    expect(token).toBe('access-token');
    expect(mockSignIn).toHaveBeenCalledTimes(1);
  });

  it('returns null when the user cancels the interactive prompt', async () => {
    mockSignIn.mockResolvedValue(signInCancelled);

    const token = await ensureValidAccessToken({ interactive: true });

    expect(token).toBeNull();
    expect(mockGetTokens).not.toHaveBeenCalled();
  });

  it('throws a developer-error GoogleAuthError when sign-in reports code 10', async () => {
    mockSignIn.mockRejectedValue(
      Object.assign(new Error('DEVELOPER_ERROR'), { code: '10' }),
    );

    await expect(
      ensureValidAccessToken({ interactive: true }),
    ).rejects.toMatchObject({
      name: 'GoogleAuthError',
      kind: 'developer-error',
    });
  });

  it('throws a play-services GoogleAuthError when Play services are unavailable', async () => {
    mockHasPlayServices.mockRejectedValue(
      Object.assign(new Error('Play services'), {
        code: statusCodes.PLAY_SERVICES_NOT_AVAILABLE,
      }),
    );

    const error = await ensureValidAccessToken({ interactive: true }).catch(
      e => e,
    );

    expect(error).toBeInstanceOf(GoogleAuthError);
    expect(error.kind).toBe('play-services-unavailable');
    expect(mockSignIn).not.toHaveBeenCalled();
  });

  it('never throws on the non-interactive path when the silent attempt fails', async () => {
    mockSignInSilently.mockRejectedValue(new Error('no network'));

    await expect(
      ensureValidAccessToken({ interactive: false }),
    ).resolves.toBeNull();
    expect(mockSignIn).not.toHaveBeenCalled();
  });
});

describe('ensureInteractiveAccessToken', () => {
  it('returns the token on success', async () => {
    mockSignIn.mockResolvedValue(signInSuccess);

    await expect(ensureInteractiveAccessToken()).resolves.toBe('access-token');
  });

  it('throws when authentication does not complete', async () => {
    mockSignIn.mockResolvedValue(signInCancelled);

    await expect(ensureInteractiveAccessToken()).rejects.toThrow();
  });
});

describe('clearAuthState', () => {
  it('signs the user out', async () => {
    await clearAuthState();

    expect(mockSignOut).toHaveBeenCalledTimes(1);
  });
});

describe('getStoredAuthState', () => {
  it('returns null when no user is signed in', async () => {
    mockGetCurrentUser.mockReturnValue(null);

    await expect(getStoredAuthState()).resolves.toBeNull();
  });

  it('returns the access token when a user is signed in', async () => {
    mockGetCurrentUser.mockReturnValue({ user: { email: 'a@b.c' } });

    await expect(getStoredAuthState()).resolves.toEqual({
      accessToken: 'access-token',
    });
  });
});

describe('configuration', () => {
  it('configures the Drive scope and web client id before signing in', async () => {
    mockSignInSilently.mockResolvedValue(silentSuccess);

    await ensureValidAccessToken({ interactive: false });

    expect(mockConfigure).toHaveBeenCalledWith(
      expect.objectContaining({
        webClientId: 'test-web-client-id.apps.googleusercontent.com',
        offlineAccess: true,
        scopes: expect.arrayContaining([
          'https://www.googleapis.com/auth/drive.file',
        ]),
      }),
    );
  });
});
