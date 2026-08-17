// Jest setup file for React Native testing

// Pin the zone so logic reading the local calendar is deterministic across
// machines. A UTC-ahead zone is deliberate: local and UTC disagree on the
// calendar day during local early morning, which is where date-window faults
// hide. It has no DST, so day arithmetic does not vary by season.
process.env.TZ = 'Asia/Kuala_Lumpur';

// Keep Animated on the JS driver in tests. The native driver path loads
// react-native's bundled renderer, which mismatches the installed react version.
jest.mock('react-native/src/private/animated/NativeAnimatedHelper', () => {
  const noop = jest.fn();
  const api = {
    getValue: noop,
    setWaitingForIdentifier: noop,
    unsetWaitingForIdentifier: noop,
    flushQueue: noop,
    createAnimatedNode: noop,
    startListeningToAnimatedNodeValue: noop,
    stopListeningToAnimatedNodeValue: noop,
    connectAnimatedNodes: noop,
    disconnectAnimatedNodes: noop,
    startAnimatingNode: noop,
    stopAnimation: noop,
    setAnimatedNodeValue: noop,
    setAnimatedNodeOffset: noop,
    flattenAnimatedNodeOffset: noop,
    extractAnimatedNodeOffset: noop,
    connectAnimatedNodeToView: noop,
    disconnectAnimatedNodeFromView: noop,
    restoreDefaultValues: noop,
    dropAnimatedNode: noop,
    addAnimatedEventToView: noop,
    removeAnimatedEventFromView: noop,
  };
  const helper = {
    API: api,
    generateNewNodeTag: () => 1,
    generateNewAnimationId: () => 1,
    assertNativeAnimatedModule: noop,
    shouldUseNativeDriver: () => false,
    shouldSignalBatch: false,
    transformDataType: value => value,
    nativeEventEmitter: { addListener: noop, removeListeners: noop },
  };
  return {
    __esModule: true,
    default: helper,
    shouldUseNativeDriver: () => false,
  };
});

// Mock react-native-config
jest.mock('react-native-config', () => ({
  GOOGLE_WEB_CLIENT_ID: 'test-web-client-id.apps.googleusercontent.com',
}));

// Mock react-native-keychain
jest.mock('react-native-keychain', () => ({
  ACCESSIBLE: {
    WHEN_UNLOCKED: 'AccessibleWhenUnlocked',
    AFTER_FIRST_UNLOCK: 'AccessibleAfterFirstUnlock',
    ALWAYS: 'AccessibleAlways',
    WHEN_PASSCODE_SET_THIS_DEVICE_ONLY:
      'AccessibleWhenPasscodeSetThisDeviceOnly', // eslint-disable-line no-secrets/no-secrets
    WHEN_UNLOCKED_THIS_DEVICE_ONLY: 'AccessibleWhenUnlockedThisDeviceOnly',
  },
  ACCESS_CONTROL: {
    USER_PRESENCE: 'UserPresence',
    BIOMETRY_ANY: 'BiometryAny',
    BIOMETRY_CURRENT_SET: 'BiometryCurrentSet',
    DEVICE_PASSCODE: 'DevicePasscode',
    APPLICATION_PASSWORD: 'ApplicationPassword',
    // eslint-disable-next-line no-secrets/no-secrets
    BIOMETRY_ANY_OR_DEVICE_PASSCODE: 'BiometryAnyOrDevicePasscode',
    BIOMETRY_CURRENT_SET_OR_DEVICE_PASSCODE:
      'BiometryCurrentSetOrDevicePasscode', // eslint-disable-line no-secrets/no-secrets
  },
  AUTHENTICATION_TYPE: {
    DEVICE_PASSCODE_OR_BIOMETRICS: 'AuthenticationWithBiometricsDevicePasscode',
    BIOMETRICS: 'AuthenticationWithBiometrics',
  },
  BIOMETRY_TYPE: {
    TOUCH_ID: 'TouchID',
    FACE_ID: 'FaceID',
    FINGERPRINT: 'Fingerprint',
    FACE: 'Face',
    IRIS: 'Iris',
  },
  SECURITY_LEVEL: {
    ANY: 'ANY',
    SECURE_SOFTWARE: 'SECURE_SOFTWARE',
    SECURE_HARDWARE: 'SECURE_HARDWARE',
  },
  setGenericPassword: jest.fn(() => Promise.resolve(true)),
  getGenericPassword: jest.fn(() => Promise.resolve(false)),
  resetGenericPassword: jest.fn(() => Promise.resolve(true)),
  hasGenericPassword: jest.fn(() => Promise.resolve(false)),
  hasInternetCredentials: jest.fn(() => Promise.resolve(false)),
  setInternetCredentials: jest.fn(() => Promise.resolve()),
  getInternetCredentials: jest.fn(() => Promise.resolve(false)),
  resetInternetCredentials: jest.fn(() => Promise.resolve()),
  getSupportedBiometryType: jest.fn(() => Promise.resolve(null)),
}));

// Mock react-native-fs
jest.mock('react-native-fs', () => ({
  DocumentDirectoryPath: '/mock/documents',
  CachesDirectoryPath: '/mock/caches',
  ExternalDirectoryPath: '/mock/external',
  writeFile: jest.fn(() => Promise.resolve()),
  readFile: jest.fn(() => Promise.resolve('')),
  unlink: jest.fn(() => Promise.resolve()),
  exists: jest.fn(() => Promise.resolve(true)),
  mkdir: jest.fn(() => Promise.resolve()),
}));

// Mock @react-native-google-signin/google-signin
jest.mock('@react-native-google-signin/google-signin', () => ({
  GoogleSignin: {
    configure: jest.fn(),
    hasPlayServices: jest.fn(() => Promise.resolve(true)),
    signIn: jest.fn(() =>
      Promise.resolve({
        type: 'success',
        data: {
          scopes: ['https://www.googleapis.com/auth/drive.file'],
          user: { email: 'test@example.com' },
        },
      }),
    ),
    signInSilently: jest.fn(() =>
      Promise.resolve({ type: 'noSavedCredentialFound' }),
    ),
    addScopes: jest.fn(() => Promise.resolve({ type: 'success', data: {} })),
    getTokens: jest.fn(() =>
      Promise.resolve({
        accessToken: 'mock-access-token',
        idToken: 'mock-id-token',
      }),
    ),
    getCurrentUser: jest.fn(() => null),
    signOut: jest.fn(() => Promise.resolve()),
    revokeAccess: jest.fn(() => Promise.resolve()),
  },
  statusCodes: {
    SIGN_IN_CANCELLED: 'SIGN_IN_CANCELLED',
    IN_PROGRESS: 'IN_PROGRESS',
    PLAY_SERVICES_NOT_AVAILABLE: 'PLAY_SERVICES_NOT_AVAILABLE',
  },
}));

// Mock NetInfo
jest.mock('@react-native-community/netinfo', () => ({
  fetch: jest.fn(() =>
    Promise.resolve({
      isConnected: true,
      isInternetReachable: true,
      type: 'wifi',
    }),
  ),
  addEventListener: jest.fn(() => jest.fn()),
}));

// Mock react-native-saf-x
jest.mock('react-native-saf-x', () => ({
  openDocument: jest.fn(() =>
    Promise.resolve([{ uri: 'content://mock/pick.csv', name: 'pick.csv' }]),
  ),
  openDocumentTree: jest.fn(() =>
    Promise.resolve({ uri: 'content://mock/tree', name: 'tree' }),
  ),
  readFile: jest.fn(() => Promise.resolve('')),
  writeFile: jest.fn(() => Promise.resolve()),
  unlink: jest.fn(() => Promise.resolve(true)),
}));

// Mock SQLite
jest.mock('react-native-sqlite-storage', () => ({
  openDatabase: jest.fn(() => ({
    transaction: jest.fn(),
    executeSql: jest.fn(),
    close: jest.fn(),
  })),
  enablePromise: jest.fn(),
  DEBUG: jest.fn(),
}));

// Suppress console warnings in tests
global.console = {
  ...console,
  warn: jest.fn(),
  error: jest.fn(),
};
