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
