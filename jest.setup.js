// Jest setup file for React Native testing

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
  GOOGLE_OAUTH_CLIENT_ID: 'test-client-id',
  GOOGLE_OAUTH_REDIRECT_URI: 'com.expensetracker:/oauth2redirect/google',
  GOOGLE_DRIVE_UPLOAD_SCOPE: 'https://www.googleapis.com/auth/drive.file',
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

// Mock react-native-app-auth
jest.mock('react-native-app-auth', () => ({
  authorize: jest.fn(() =>
    Promise.resolve({
      accessToken: 'mock-access-token',
      accessTokenExpirationDate: new Date(Date.now() + 3600000).toISOString(),
      refreshToken: 'mock-refresh-token',
      tokenType: 'Bearer',
      idToken: 'mock-id-token',
      scopes: ['https://www.googleapis.com/auth/drive.file'],
    }),
  ),
  refresh: jest.fn((config, { refreshToken }) =>
    Promise.resolve({
      accessToken: 'mock-refreshed-access-token',
      accessTokenExpirationDate: new Date(Date.now() + 3600000).toISOString(),
      refreshToken: refreshToken,
      tokenType: 'Bearer',
      idToken: 'mock-id-token',
    }),
  ),
  revoke: jest.fn(() => Promise.resolve()),
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
  StorageAccessFramework: {
    requestDirectoryPermissions: jest.fn(() =>
      Promise.resolve({ granted: true, uri: 'content://mock/tree' }),
    ),
    persistAccessPermissions: jest.fn(() => Promise.resolve()),
    persistPermissions: jest.fn(() => Promise.resolve()),
    takePersistableUriPermission: jest.fn(() => Promise.resolve()),
    createFile: jest.fn(() => Promise.resolve('content://mock/file')),
    writeFile: jest.fn(() => Promise.resolve()),
    readFile: jest.fn(() => Promise.resolve('')),
    deleteFile: jest.fn(() => Promise.resolve()),
  },
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
