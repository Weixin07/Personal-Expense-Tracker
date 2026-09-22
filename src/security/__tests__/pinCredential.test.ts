import * as Keychain from 'react-native-keychain';
import {
  clearPinCredential,
  pinCredentialExists,
  pinCredentialUsable,
  readPinRecord,
  setPin,
  verifyPin,
} from '../pinCredential';
import { PinRecordError } from '../pinHash';

const PIN_SERVICE = 'expense-tracker-app-pin';
const BIOMETRIC_SERVICE = 'expense-tracker-biometric-gate';

beforeEach(() => {
  jest.clearAllMocks();
  (Keychain.setGenericPassword as jest.Mock).mockResolvedValue(true);
  (Keychain.getGenericPassword as jest.Mock).mockResolvedValue(false);
  (Keychain.resetGenericPassword as jest.Mock).mockResolvedValue(true);
  (Keychain.hasGenericPassword as jest.Mock).mockResolvedValue(false);
});

describe('pinCredential storage options', () => {
  it('writes under its own service, separate from the biometric gate', async () => {
    await setPin('846207', 150_000);
    const [, , options] = (Keychain.setGenericPassword as jest.Mock).mock
      .calls[0];
    expect(options.service).toBe(PIN_SERVICE);
    expect(options.service).not.toBe(BIOMETRIC_SERVICE);
  });

  /**
   * The two options below are what make the PIN reachable when biometrics fail
   * and on a device with no passcode. Asserting the options rather than a
   * round-trip is deliberate: a round-trip still passes if someone copies the
   * biometric entry's options here, which would reopen both holes.
   */
  it('applies no biometric access control', async () => {
    await setPin('846207', 150_000);
    const [, , options] = (Keychain.setGenericPassword as jest.Mock).mock
      .calls[0];
    expect(options.accessControl).toBeUndefined();
  });

  it('does not require a device passcode to be set', async () => {
    await setPin('846207', 150_000);
    const [, , options] = (Keychain.setGenericPassword as jest.Mock).mock
      .calls[0];
    expect(options.accessible).not.toBe(
      Keychain.ACCESSIBLE.WHEN_PASSCODE_SET_THIS_DEVICE_ONLY,
    );
    expect(options.accessible).toBe(Keychain.ACCESSIBLE.AFTER_FIRST_UNLOCK);
  });

  it('stores through AES-GCM without requiring a secure-hardware guarantee', async () => {
    await setPin('846207', 150_000);
    const [, , options] = (Keychain.setGenericPassword as jest.Mock).mock
      .calls[0];
    expect(options.storage).toBe(Keychain.STORAGE_TYPE.AES_GCM_NO_AUTH);
    expect(options.securityLevel).toBeUndefined();
  });

  it('never writes the PIN itself', async () => {
    await setPin('846207', 150_000);
    const [username, password] = (Keychain.setGenericPassword as jest.Mock).mock
      .calls[0];
    expect(username).not.toContain('846207');
    expect(password).not.toContain('846207');
  });
});

describe('pinCredential reads', () => {
  it('reports no record when nothing is stored', async () => {
    await expect(readPinRecord()).resolves.toBeNull();
    await expect(verifyPin('846207')).resolves.toBe(false);
  });

  it('verifies a stored PIN', async () => {
    await setPin('846207', 150_000);
    const [, password] = (Keychain.setGenericPassword as jest.Mock).mock
      .calls[0];
    (Keychain.getGenericPassword as jest.Mock).mockResolvedValue({
      username: 'expense-tracker',
      password,
    });
    await expect(verifyPin('846207')).resolves.toBe(true);
    await expect(verifyPin('111213')).resolves.toBe(false);
  });

  it('surfaces a corrupt record instead of reporting no PIN', async () => {
    (Keychain.getGenericPassword as jest.Mock).mockResolvedValue({
      username: 'expense-tracker',
      password: 'corrupt',
    });
    await expect(readPinRecord()).rejects.toBeInstanceOf(PinRecordError);
  });

  it('reports existence through its own service', async () => {
    (Keychain.hasGenericPassword as jest.Mock).mockResolvedValue(true);
    await expect(pinCredentialExists()).resolves.toBe(true);
    expect(Keychain.hasGenericPassword).toHaveBeenCalledWith({
      service: PIN_SERVICE,
    });
  });

  it('clears without failing when there is nothing to clear', async () => {
    (Keychain.resetGenericPassword as jest.Mock).mockRejectedValue(
      new Error('no entry'),
    );
    await expect(clearPinCredential()).resolves.toBeUndefined();
  });
});

describe('exists versus usable', () => {
  it('reports a corrupt record as existing but not usable', async () => {
    (Keychain.hasGenericPassword as jest.Mock).mockResolvedValue(true);
    (Keychain.getGenericPassword as jest.Mock).mockResolvedValue({
      username: 'expense-tracker',
      password: 'corrupt',
    });
    await expect(pinCredentialExists()).resolves.toBe(true);
    await expect(pinCredentialUsable()).resolves.toBe(false);
  });

  it('reports a decodable record as both', async () => {
    await setPin('846207', 150_000);
    const [, password] = (Keychain.setGenericPassword as jest.Mock).mock
      .calls[0];
    (Keychain.hasGenericPassword as jest.Mock).mockResolvedValue(true);
    (Keychain.getGenericPassword as jest.Mock).mockResolvedValue({
      username: 'expense-tracker',
      password,
    });
    await expect(pinCredentialExists()).resolves.toBe(true);
    await expect(pinCredentialUsable()).resolves.toBe(true);
  });

  it('reports an absent record as neither', async () => {
    await expect(pinCredentialExists()).resolves.toBe(false);
    await expect(pinCredentialUsable()).resolves.toBe(false);
  });
});
