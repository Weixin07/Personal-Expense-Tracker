import { GoogleAuthError, type GoogleAuthErrorKind } from './googleAuth';

export type AuthAlert = { title: string; body: string };

const MESSAGES: Record<GoogleAuthErrorKind, AuthAlert> = {
  'developer-error': {
    title: 'Google sign-in not configured',
    body: "This build isn't registered for Google sign-in. Its signing certificate (SHA-1) must be added to the Google OAuth client in the Google Cloud console.",
  },
  'play-services-unavailable': {
    title: 'Google Play services required',
    body: 'Update or enable Google Play services on this device and try again.',
  },
  network: {
    title: 'No connection',
    body: 'Check your internet connection and try again.',
  },
  unknown: {
    title: 'Google sign-in failed',
    body: 'Something went wrong while signing in. Please try again.',
  },
};

export const authAlertForKind = (
  kind: GoogleAuthErrorKind | undefined,
  fallbackMessage?: string,
): AuthAlert => {
  if (kind && kind !== 'unknown') {
    return MESSAGES[kind];
  }
  return {
    title: MESSAGES.unknown.title,
    body: fallbackMessage?.trim() ? fallbackMessage : MESSAGES.unknown.body,
  };
};

export const describeAuthError = (error: unknown): AuthAlert => {
  if (error instanceof GoogleAuthError) {
    return authAlertForKind(error.kind, error.message);
  }
  return authAlertForKind(
    undefined,
    error instanceof Error ? error.message : undefined,
  );
};
