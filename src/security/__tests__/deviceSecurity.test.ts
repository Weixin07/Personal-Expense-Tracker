import { Linking } from 'react-native';
import NativeAppPinCrypto from '../NativeAppPinCrypto';
import {
  confirmDeviceCredential,
  openScreenLockSettings,
  secureLockScreenState,
  SECURITY_SETTINGS_ACTION,
} from '../deviceSecurity';

const native = NativeAppPinCrypto as unknown as {
  isDeviceSecure?: jest.Mock;
  confirmDeviceCredential?: jest.Mock;
};

describe('secureLockScreenState', () => {
  const original = native.isDeviceSecure;

  afterEach(() => {
    native.isDeviceSecure = original;
    original?.mockReset();
    original?.mockResolvedValue(true);
  });

  it('answers true when the device has a secure lock screen', async () => {
    native.isDeviceSecure?.mockResolvedValue(true);
    await expect(secureLockScreenState()).resolves.toBe(true);
  });

  it('answers false when the device has no secure lock screen', async () => {
    native.isDeviceSecure?.mockResolvedValue(false);
    await expect(secureLockScreenState()).resolves.toBe(false);
  });

  it('answers unknown rather than false when the probe rejects', async () => {
    native.isDeviceSecure?.mockRejectedValue(new Error('keyguard down'));
    await expect(secureLockScreenState()).resolves.toBeNull();
  });

  it('answers unknown when the installed binary predates the probe', async () => {
    native.isDeviceSecure = undefined;
    await expect(secureLockScreenState()).resolves.toBeNull();
  });
});

describe('confirmDeviceCredential', () => {
  const original = native.confirmDeviceCredential;

  afterEach(() => {
    native.confirmDeviceCredential = original;
    original?.mockReset();
    original?.mockResolvedValue(false);
  });

  it('reports a confirmed screen lock as authenticated', async () => {
    native.confirmDeviceCredential?.mockResolvedValue(true);
    await expect(confirmDeviceCredential()).resolves.toBe('authenticated');
  });

  it('reports a dismissed prompt as cancelled', async () => {
    native.confirmDeviceCredential?.mockResolvedValue(false);
    await expect(confirmDeviceCredential()).resolves.toBe('cancelled');
  });

  it('reports a device with no screen lock', async () => {
    native.confirmDeviceCredential?.mockRejectedValue(
      Object.assign(new Error('no lock'), { code: 'no_device_credential' }),
    );
    await expect(confirmDeviceCredential()).resolves.toBe('no-credential');
  });

  it.each([
    ['another rejection code', { code: 'no_activity' }],
    ['a rejection without a code', {}],
  ])('reports %s as unavailable', async (_label, extra) => {
    native.confirmDeviceCredential?.mockRejectedValue(
      Object.assign(new Error('failed'), extra),
    );
    await expect(confirmDeviceCredential()).resolves.toBe('unavailable');
  });

  it('reports a synchronous throw as unavailable', async () => {
    native.confirmDeviceCredential?.mockImplementation(() => {
      throw new Error('bridge down');
    });
    await expect(confirmDeviceCredential()).resolves.toBe('unavailable');
  });

  it('reports unavailable when the installed binary predates the prompt', async () => {
    native.confirmDeviceCredential = undefined;
    await expect(confirmDeviceCredential()).resolves.toBe('unavailable');
  });
});

describe('openScreenLockSettings', () => {
  const sendIntent = Linking.sendIntent as jest.Mock;
  const openSettings = Linking.openSettings as jest.Mock;

  beforeEach(() => {
    sendIntent.mockReset();
    openSettings.mockReset();
  });

  it('opens the security settings', async () => {
    sendIntent.mockResolvedValue(undefined);
    await openScreenLockSettings();
    expect(sendIntent).toHaveBeenCalledWith(SECURITY_SETTINGS_ACTION);
    expect(openSettings).not.toHaveBeenCalled();
  });

  it("falls back to the app's settings when that intent is missing", async () => {
    sendIntent.mockRejectedValue(new Error('no activity'));
    openSettings.mockResolvedValue(undefined);
    await openScreenLockSettings();
    expect(openSettings).toHaveBeenCalled();
  });

  it('resolves even when nothing can be opened', async () => {
    sendIntent.mockRejectedValue(new Error('no activity'));
    openSettings.mockRejectedValue(new Error('no settings'));
    await expect(openScreenLockSettings()).resolves.toBeUndefined();
  });
});
