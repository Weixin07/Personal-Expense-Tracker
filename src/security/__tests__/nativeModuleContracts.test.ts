const SAF_X_REQUIRED_EXPORTS = [
  'openDocument',
  'openDocumentTree',
  'readFile',
  'writeFile',
  'unlink',
] as const;

// Guards against the original defect: storageAccess.ts imported a
// `StorageAccessFramework` export that react-native-saf-x does not provide.
// requireActual bypasses the jest mock to assert the real package surface.
describe('react-native-saf-x export contract', () => {
  const actual = jest.requireActual('react-native-saf-x');

  it.each(SAF_X_REQUIRED_EXPORTS)('exports %s as a function', name => {
    expect(typeof actual[name]).toBe('function');
  });
});
