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
