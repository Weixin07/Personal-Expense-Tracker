import Config from 'react-native-config';

export const GOOGLE_DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
export const GOOGLE_DRIVE_FOLDER_NAME = 'Expense Tracker Backups';

export type GoogleOAuthConfig = {
  clientId: string;
  redirectUri: string;
};

export const getGoogleOAuthConfig = (): GoogleOAuthConfig => {
  const clientId = Config.GOOGLE_OAUTH_CLIENT_ID;
  const redirectUri = Config.GOOGLE_OAUTH_REDIRECT_URI;

  if (!clientId || !redirectUri) {
    throw new Error('Google OAuth environment variables are not configured.');
  }

  return { clientId, redirectUri };
};