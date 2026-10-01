import { Linking } from 'react-native';
import NativeAppPinCrypto from './NativeAppPinCrypto';

/** `null` is "could not tell", which callers must not read as either answer. */
export type SecureLockScreen = boolean | null;

/**
 * Whether the device has a PIN, pattern or password — the precondition Android
 * Keystore places on creating any authentication-bound key.
 *
 * @returns `true` or `false` when the platform answers, and `null` when the
 * probe rejects or the installed binary predates it. Never throws.
 */
export const secureLockScreenState = async (): Promise<SecureLockScreen> => {
  if (typeof NativeAppPinCrypto.isDeviceSecure !== 'function') {
    return null;
  }
  try {
    return await NativeAppPinCrypto.isDeviceSecure();
  } catch {
    return null;
  }
};

/**
 * Only `'authenticated'` may unlock. `'unavailable'` covers a prompt that could
 * not be shown, including on a binary that predates it, and must leave the app
 * locked rather than open.
 */
export type DeviceCredentialOutcome =
  | 'authenticated'
  | 'cancelled'
  | 'no-credential'
  | 'unavailable';

const NO_DEVICE_CREDENTIAL_CODE = 'no_device_credential';

/** Asks the user to confirm the device screen lock. Never throws. */
export const confirmDeviceCredential =
  async (): Promise<DeviceCredentialOutcome> => {
    if (typeof NativeAppPinCrypto.confirmDeviceCredential !== 'function') {
      return 'unavailable';
    }
    try {
      const confirmed = await NativeAppPinCrypto.confirmDeviceCredential(
        'Unlock Expense Tracker',
        'Confirm your screen lock to continue',
      );
      return confirmed ? 'authenticated' : 'cancelled';
    } catch (error) {
      return (error as { code?: unknown } | null)?.code ===
        NO_DEVICE_CREDENTIAL_CODE
        ? 'no-credential'
        : 'unavailable';
    }
  };

// eslint-disable-next-line no-secrets/no-secrets -- Android intent action, not a credential
export const SECURITY_SETTINGS_ACTION = 'android.settings.SECURITY_SETTINGS';

/** Opens the system screen-lock settings. Never throws. */
export const openScreenLockSettings = async (): Promise<void> => {
  try {
    await Linking.sendIntent(SECURITY_SETTINGS_ACTION);
  } catch {
    // Some OEM builds lack this screen; the app's details page is the fallback.
    try {
      await Linking.openSettings();
    } catch {
      // Nothing left to open; the screen still offers Check again.
    }
  }
};
