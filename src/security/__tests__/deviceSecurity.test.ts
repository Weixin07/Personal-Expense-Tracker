import NativeAppPinCrypto from '../NativeAppPinCrypto';
import { secureLockScreenState } from '../deviceSecurity';

const native = NativeAppPinCrypto as unknown as {
  isDeviceSecure?: jest.Mock;
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
