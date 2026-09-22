import * as Keychain from 'react-native-keychain';
import {
  createRecord,
  decodeRecord,
  encodeRecord,
  verify,
  type PinRecord,
} from './pinHash';

const PIN_KEYCHAIN_SERVICE = 'expense-tracker-app-pin';
const PIN_KEYCHAIN_USERNAME = 'expense-tracker';

/**
 * Deliberately unlike the biometric gate's entry, which uses
 * BIOMETRY_CURRENT_SET_OR_DEVICE_PASSCODE with WHEN_PASSCODE_SET_THIS_DEVICE_ONLY.
 * Neither may be applied here: a PIN gated behind biometrics is useless when
 * biometrics fail, and an entry requiring a device passcode cannot be created on
 * a device that has none. Unifying the two option sets reopens both.
 *
 * `securityLevel` is omitted for the same reason: it is a precondition, not a
 * preference. Requesting SECURE_HARDWARE throws on a device with no TEE instead
 * of degrading, which would leave the lock unusable on the low-end hardware this
 * fallback serves. Omitting it still stores through AndroidKeyStore, still
 * hardware-backed wherever that exists.
 */
const pinStorageOptions = {
  service: PIN_KEYCHAIN_SERVICE,
  accessible: Keychain.ACCESSIBLE.AFTER_FIRST_UNLOCK,
  storage: Keychain.STORAGE_TYPE.AES_GCM_NO_AUTH,
};

export const setPin = async (
  pin: string,
  iterations: number,
): Promise<void> => {
  const record = await createRecord(pin, iterations);
  await Keychain.setGenericPassword(
    PIN_KEYCHAIN_USERNAME,
    encodeRecord(record),
    pinStorageOptions,
  );
};

/**
 * @returns the stored record, or `null` when no PIN has been set.
 * @throws PinRecordError when a record exists but cannot be decoded.
 */
export const readPinRecord = async (): Promise<PinRecord | null> => {
  const credentials = await Keychain.getGenericPassword({
    service: PIN_KEYCHAIN_SERVICE,
  });
  if (!credentials) {
    return null;
  }
  return decodeRecord(credentials.password);
};

export const verifyPin = async (pin: string): Promise<boolean> => {
  const record = await readPinRecord();
  if (!record) {
    return false;
  }
  return verify(pin, record);
};

export const pinCredentialExists = (): Promise<boolean> =>
  Keychain.hasGenericPassword({ service: PIN_KEYCHAIN_SERVICE });

/**
 * Whether a PIN can actually be used to unlock. A record that exists but cannot
 * be decoded answers `false` here and `true` from `pinCredentialExists`: the
 * fail-closed path must still treat it as evidence the gate was on, while
 * everything that offers the PIN as a way in must treat it as absent.
 */
export const pinCredentialUsable = async (): Promise<boolean> => {
  try {
    return (await readPinRecord()) !== null;
  } catch {
    return false;
  }
};

export const clearPinCredential = async (): Promise<void> => {
  try {
    await Keychain.resetGenericPassword({ service: PIN_KEYCHAIN_SERVICE });
  } catch {
    // Disabling the gate must succeed even with no credential to clear.
  }
};
