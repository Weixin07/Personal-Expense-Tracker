import NativeAppPinCrypto from '../NativeAppPinCrypto';

const SAF_X_REQUIRED_EXPORTS = [
  'openDocument',
  'openDocumentTree',
  'readFile',
  'writeFile',
  'unlink',
] as const;

// react-native-saf-x exposes these as top-level functions, not under a
// `StorageAccessFramework` namespace. requireActual bypasses the jest mock so
// the assertion lands on the real package surface.
describe('react-native-saf-x export contract', () => {
  const actual = jest.requireActual('react-native-saf-x');

  it.each(SAF_X_REQUIRED_EXPORTS)('exports %s as a function', name => {
    expect(typeof actual[name]).toBe('function');
  });
});

const APP_PIN_CRYPTO_REQUIRED_METHODS = [
  'randomBytesBase64',
  'pbkdf2Sha256Base64',
] as const;

/**
 * AppPinCrypto is implemented in this repository rather than a package, so
 * there is no third-party surface to requireActual against — this asserts the
 * TypeScript side only. Whether the Kotlin implementation still matches is
 * verified by the on-device smoke in DEPLOY.md, not here.
 */
describe('AppPinCrypto spec contract', () => {
  it.each(APP_PIN_CRYPTO_REQUIRED_METHODS)('exposes %s as a function', name => {
    expect(
      typeof (NativeAppPinCrypto as unknown as Record<string, unknown>)[name],
    ).toBe('function');
  });
});
