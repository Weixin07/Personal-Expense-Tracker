import * as Keychain from 'react-native-keychain';

const BIOMETRIC_SERVICE = 'app-lock-biometric';

/**
 * Configures a keychain entry that requires biometric/passcode authentication for access.
 * This should be called once, perhaps from a settings screen, to enable the feature.
 * It is not strictly required for the prompt to work, but is good practice.
 */
export const setupBiometricLock = async (): Promise<void> => {
  await Keychain.setGenericPassword('user', 'lock', {
    service: BIOMETRIC_SERVICE,
    accessible: Keychain.ACCESSIBLE.WHEN_PASSCODE_SET_THIS_DEVICE_ONLY,
    authenticationType: Keychain.AUTHENTICATION_TYPE.BIOMETRICS_OR_DEVICE_PASSCODE,
  });
};

/**
 * Triggers the native biometric or device passcode authentication prompt.
 * @returns {Promise<boolean>} A promise that resolves to true if authentication is successful, and false otherwise.
 */
export const promptForAuthentication = async (): Promise<boolean> => {
  try {
    // The act of accessing this specific keychain service triggers the OS-level prompt.
    const credentials = await Keychain.getGenericPassword({
      service: BIOMETRIC_SERVICE,
      authenticationPrompt: {
        title: 'Authentication Required',
        subtitle: 'Unlock Expense Tracker',
        description: 'Please authenticate to access your expense data.',
      },
    });
    // If credentials are not null, it means the user successfully authenticated.
    return !!credentials;
  } catch (error) {
    // This block is hit if the user cancels the prompt or if authentication fails.
    console.log('Authentication failed or was cancelled:', error);
    return false;
  }
};
