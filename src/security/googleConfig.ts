import Config from 'react-native-config';

export const GOOGLE_DRIVE_SCOPE = 'https://www.googleapis.com/auth/drive.file';
export const GOOGLE_DRIVE_FOLDER_NAME = 'Expense Tracker Backups';

export type GoogleSignInConfig = {
  webClientId: string;
};

export const getGoogleSignInConfig = (): GoogleSignInConfig => {
  const webClientId = Config.GOOGLE_WEB_CLIENT_ID;

  if (!webClientId) {
    throw new Error('Google OAuth environment variables are not configured.');
  }

  return { webClientId };
};
