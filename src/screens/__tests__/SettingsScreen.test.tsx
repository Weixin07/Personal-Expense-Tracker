import React from 'react';
import { Alert } from 'react-native';
import {
  renderWithProviders,
  makeContextValue,
  screen,
  fireEvent,
  waitFor,
} from '../../__tests__/test-utils/renderWithProviders';
import SettingsScreen from '../SettingsScreen';
import { useTransactionData } from '../../context/AppContext';
import type { ExportQueueItem } from '../../context/AppContext';
import { PIN_MAX_LENGTH, PIN_MIN_LENGTH } from '../../utils/validation';

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate, goBack: jest.fn() }),
}));

jest.mock('../../context/AppContext', () => ({
  useTransactionData: jest.fn(),
}));

const mockedUseExpenseData = useTransactionData as unknown as jest.Mock;

const pendingItem: ExportQueueItem = {
  id: 'e1',
  filename: 'export.csv',
  filePath: 'p',
  status: 'pending',
  createdAt: '2025-01-10T00:00:00.000Z',
  updatedAt: '2025-01-10T00:00:00.000Z',
};

beforeEach(() => {
  jest.clearAllMocks();
  mockedUseExpenseData.mockReturnValue(makeContextValue());
});

describe('SettingsScreen', () => {
  it('renders the preferences list', () => {
    renderWithProviders(<SettingsScreen />);
    expect(screen.getByText('Base currency')).toBeOnTheScreen();
    expect(screen.getByText('Biometric lock')).toBeOnTheScreen();
  });

  it('navigates to category management', () => {
    renderWithProviders(<SettingsScreen />);
    fireEvent.press(screen.getByLabelText('Manage categories'));
    expect(mockNavigate).toHaveBeenCalledWith('ManageCategories');
  });

  it('navigates to fund management', () => {
    renderWithProviders(<SettingsScreen />);
    fireEvent.press(screen.getByLabelText('Manage funds'));
    expect(mockNavigate).toHaveBeenCalledWith('ManageFunds');
  });

  it('navigates to the export queue', () => {
    renderWithProviders(<SettingsScreen />);
    fireEvent.press(screen.getByLabelText('Open export queue'));
    expect(mockNavigate).toHaveBeenCalledWith('ExportQueue');
  });

  it('navigates to the import screen', () => {
    renderWithProviders(<SettingsScreen />);
    fireEvent.press(screen.getByLabelText('Import transactions'));
    expect(mockNavigate).toHaveBeenCalledWith('Import');
  });

  it('toggles the biometric gate when a PIN already exists', async () => {
    const setBiometricGateEnabled = jest.fn();
    mockedUseExpenseData.mockReturnValue(
      makeContextValue({
        actions: {
          setBiometricGateEnabled,
          appPinUsable: jest.fn().mockResolvedValue(true),
        },
      }),
    );
    renderWithProviders(<SettingsScreen />);
    await waitFor(() =>
      expect(screen.getByLabelText('Change app PIN')).toBeOnTheScreen(),
    );
    fireEvent(
      screen.getByLabelText('Toggle biometric lock'),
      'valueChange',
      true,
    );
    expect(setBiometricGateEnabled).toHaveBeenCalledWith(true);
  });

  const renderWithGateOn = (setBiometricGateEnabled: jest.Mock) => {
    mockedUseExpenseData.mockReturnValue(
      makeContextValue({
        state: { settings: { biometricGateEnabled: true } },
        actions: {
          setBiometricGateEnabled,
          appPinUsable: jest.fn().mockResolvedValue(true),
        },
      }),
    );
    renderWithProviders(<SettingsScreen />);
  };

  const pressAlertButton = (alertSpy: jest.SpyInstance, text: string) => {
    const buttons = alertSpy.mock.calls[alertSpy.mock.calls.length - 1][2] as {
      text: string;
      onPress?: () => void;
    }[];
    buttons.find(button => button.text === text)?.onPress?.();
  };

  it('warns that turning the lock off removes the PIN, then turns it off', async () => {
    const setBiometricGateEnabled = jest.fn().mockResolvedValue(undefined);
    const alertSpy = jest.spyOn(Alert, 'alert');
    renderWithGateOn(setBiometricGateEnabled);
    await waitFor(() =>
      expect(screen.getByLabelText('Change app PIN')).toBeOnTheScreen(),
    );
    fireEvent(
      screen.getByLabelText('Toggle biometric lock'),
      'valueChange',
      false,
    );
    expect(alertSpy).toHaveBeenCalledWith(
      'Turn off the app lock?',
      expect.stringContaining('PIN will be removed'),
      expect.any(Array),
    );
    expect(setBiometricGateEnabled).not.toHaveBeenCalled();
    pressAlertButton(alertSpy, 'Turn off');
    expect(setBiometricGateEnabled).toHaveBeenCalledWith(false);
  });

  it('leaves the lock on when turning it off is cancelled', async () => {
    const setBiometricGateEnabled = jest.fn();
    const alertSpy = jest.spyOn(Alert, 'alert');
    renderWithGateOn(setBiometricGateEnabled);
    await waitFor(() =>
      expect(screen.getByLabelText('Change app PIN')).toBeOnTheScreen(),
    );
    fireEvent(
      screen.getByLabelText('Toggle biometric lock'),
      'valueChange',
      false,
    );
    pressAlertButton(alertSpy, 'Cancel');
    expect(setBiometricGateEnabled).not.toHaveBeenCalled();
  });

  // Under the rule on `TransactionDataActions.setBiometricGateEnabled`.
  it('asks for a PIN before enabling the gate when none is set', async () => {
    const setBiometricGateEnabled = jest.fn();
    mockedUseExpenseData.mockReturnValue(
      makeContextValue({
        actions: {
          setBiometricGateEnabled,
          appPinUsable: jest.fn().mockResolvedValue(false),
        },
      }),
    );
    renderWithProviders(<SettingsScreen />);
    await waitFor(() =>
      expect(screen.getByLabelText('Set app PIN')).toBeOnTheScreen(),
    );
    fireEvent(
      screen.getByLabelText('Toggle biometric lock'),
      'valueChange',
      true,
    );
    await waitFor(() =>
      expect(screen.getByText('Set app PIN')).toBeOnTheScreen(),
    );
    expect(setBiometricGateEnabled).not.toHaveBeenCalled();
  });

  it('enrols a PIN and then turns the gate on', async () => {
    const setAppPin = jest.fn().mockResolvedValue(undefined);
    const setBiometricGateEnabled = jest.fn().mockResolvedValue(undefined);
    mockedUseExpenseData.mockReturnValue(
      makeContextValue({
        actions: {
          setAppPin,
          setBiometricGateEnabled,
          appPinUsable: jest.fn().mockResolvedValue(false),
        },
      }),
    );
    renderWithProviders(<SettingsScreen />);
    fireEvent.press(await screen.findByLabelText('Set app PIN'));
    fireEvent.changeText(await screen.findByLabelText('New PIN'), '846207');
    fireEvent.changeText(screen.getByLabelText('Confirm new PIN'), '846207');
    fireEvent.press(screen.getByLabelText('Save'));
    await waitFor(() => expect(setAppPin).toHaveBeenCalledWith('846207'));
    await waitFor(() =>
      expect(setBiometricGateEnabled).toHaveBeenCalledWith(true),
    );
  });

  it('still reports the PIN as set when turning the gate on fails', async () => {
    mockedUseExpenseData.mockReturnValue(
      makeContextValue({
        actions: {
          setAppPin: jest.fn().mockResolvedValue(undefined),
          setBiometricGateEnabled: jest
            .fn()
            .mockRejectedValue(new Error('Keystore refused the credential.')),
          appPinUsable: jest
            .fn()
            .mockResolvedValueOnce(false)
            .mockResolvedValue(true),
        },
      }),
    );
    renderWithProviders(<SettingsScreen />);
    fireEvent.press(await screen.findByLabelText('Set app PIN'));
    fireEvent.changeText(await screen.findByLabelText('New PIN'), '846207');
    fireEvent.changeText(screen.getByLabelText('Confirm new PIN'), '846207');
    fireEvent.press(screen.getByLabelText('Save'));
    await waitFor(() =>
      expect(
        screen.getByText('Keystore refused the credential.'),
      ).toBeOnTheScreen(),
    );
    await waitFor(() =>
      expect(screen.getByLabelText('Change app PIN')).toBeOnTheScreen(),
    );
  });

  it('states the PIN length from the rule validatePin enforces', async () => {
    mockedUseExpenseData.mockReturnValue(
      makeContextValue({
        actions: { appPinUsable: jest.fn().mockResolvedValue(false) },
      }),
    );
    renderWithProviders(<SettingsScreen />);
    fireEvent.press(await screen.findByLabelText('Set app PIN'));
    expect(
      await screen.findByText(
        `${PIN_MIN_LENGTH} to ${PIN_MAX_LENGTH} digits. Avoid runs and repeats.`,
      ),
    ).toBeOnTheScreen();
  });

  it('changes a PIN through the current one', async () => {
    const changeAppPin = jest.fn().mockResolvedValue(true);
    mockedUseExpenseData.mockReturnValue(
      makeContextValue({
        actions: {
          changeAppPin,
          appPinUsable: jest.fn().mockResolvedValue(true),
        },
      }),
    );
    renderWithProviders(<SettingsScreen />);
    fireEvent.press(await screen.findByLabelText('Change app PIN'));
    fireEvent.changeText(await screen.findByLabelText('Current PIN'), '846207');
    fireEvent.changeText(screen.getByLabelText('New PIN'), '735019');
    fireEvent.changeText(screen.getByLabelText('Confirm new PIN'), '735019');
    fireEvent.press(screen.getByLabelText('Save'));
    await waitFor(() =>
      expect(changeAppPin).toHaveBeenCalledWith('846207', '735019'),
    );
  });

  it('reports a rejected current PIN without echoing it', async () => {
    const changeAppPin = jest.fn().mockResolvedValue(false);
    mockedUseExpenseData.mockReturnValue(
      makeContextValue({
        actions: {
          changeAppPin,
          appPinUsable: jest.fn().mockResolvedValue(true),
        },
      }),
    );
    renderWithProviders(<SettingsScreen />);
    fireEvent.press(await screen.findByLabelText('Change app PIN'));
    fireEvent.changeText(await screen.findByLabelText('Current PIN'), '111213');
    fireEvent.changeText(screen.getByLabelText('New PIN'), '735019');
    fireEvent.changeText(screen.getByLabelText('Confirm new PIN'), '735019');
    fireEvent.press(screen.getByLabelText('Save'));
    await waitFor(() =>
      expect(
        screen.getByText('Current PIN is incorrect, or too many attempts.'),
      ).toBeOnTheScreen(),
    );
    expect(screen.queryByText('111213')).toBeNull();
  });

  it('opens the auto-lock picker and saves a preset', async () => {
    const setAutoLockMinutes = jest.fn().mockResolvedValue(undefined);
    mockedUseExpenseData.mockReturnValue(
      makeContextValue({ actions: { setAutoLockMinutes } }),
    );
    renderWithProviders(<SettingsScreen />);
    fireEvent.press(screen.getByLabelText('Change auto-lock timing'));
    await waitFor(() =>
      expect(screen.getByLabelText('After 15 minutes')).toBeOnTheScreen(),
    );
    fireEvent.press(screen.getByLabelText('After 15 minutes'));
    await waitFor(() => expect(setAutoLockMinutes).toHaveBeenCalledWith(15));
  });

  it('shows the current auto-lock preset', () => {
    mockedUseExpenseData.mockReturnValue(
      makeContextValue({ state: { settings: { autoLockMinutes: null } } }),
    );
    renderWithProviders(<SettingsScreen />);
    expect(screen.getByText('Never')).toBeOnTheScreen();
  });

  // The upgrade prompt belongs to the gate modal, which covers every route to
  // this screen; a second copy here would be unreachable and free to drift.
  it('leaves the upgrade prompt to the gate modal', async () => {
    mockedUseExpenseData.mockReturnValue(
      makeContextValue({
        state: {
          pinSetupRequired: true,
          settings: { biometricGateEnabled: true },
        },
      }),
    );
    renderWithProviders(<SettingsScreen />);
    await waitFor(() =>
      expect(screen.getByLabelText('Set app PIN')).toBeOnTheScreen(),
    );
    expect(screen.queryByText('Turn the lock off')).toBeNull();
  });

  it('opens the base-currency dialog', () => {
    renderWithProviders(<SettingsScreen />);
    fireEvent.press(screen.getByLabelText('Change base currency'));
    expect(screen.getByText('Choose base currency')).toBeOnTheScreen();
  });

  it('uploads pending exports and reports success', async () => {
    const uploadQueuedExports = jest.fn().mockResolvedValue({
      requiresAuth: false,
      attempted: 1,
      uploaded: 1,
      failed: 0,
      errors: [],
    });
    const alertSpy = jest.spyOn(Alert, 'alert');
    mockedUseExpenseData.mockReturnValue(
      makeContextValue({
        state: { exportQueue: [pendingItem] },
        actions: { uploadQueuedExports },
      }),
    );
    renderWithProviders(<SettingsScreen />);
    fireEvent.press(
      screen.getByLabelText('Upload pending exports to Google Drive'),
    );
    await waitFor(() => expect(uploadQueuedExports).toHaveBeenCalled());
    await waitFor(() =>
      expect(alertSpy).toHaveBeenCalledWith(
        'Upload complete',
        expect.any(String),
      ),
    );
  });

  it('prompts to sign in when upload requires auth', async () => {
    const uploadQueuedExports = jest.fn().mockResolvedValue({
      requiresAuth: true,
      attempted: 0,
      uploaded: 0,
      failed: 0,
      errors: [],
    });
    const alertSpy = jest.spyOn(Alert, 'alert');
    mockedUseExpenseData.mockReturnValue(
      makeContextValue({
        state: { exportQueue: [pendingItem] },
        actions: { uploadQueuedExports },
      }),
    );
    renderWithProviders(<SettingsScreen />);
    fireEvent.press(
      screen.getByLabelText('Upload pending exports to Google Drive'),
    );
    await waitFor(() =>
      expect(alertSpy).toHaveBeenCalledWith(
        'Sign in required',
        expect.any(String),
      ),
    );
  });

  it('changes the base currency from the dialog', async () => {
    const setBaseCurrency = jest.fn().mockResolvedValue(undefined);
    mockedUseExpenseData.mockReturnValue(
      makeContextValue({ actions: { setBaseCurrency } }),
    );
    renderWithProviders(<SettingsScreen />);
    fireEvent.press(screen.getByLabelText('Change base currency'));
    fireEvent.changeText(screen.getByLabelText('Search currency'), 'EUR');
    fireEvent.press(screen.getByText('EUR'));
    await waitFor(() => expect(setBaseCurrency).toHaveBeenCalledWith('EUR'));
  });

  it('alerts when there are no pending exports to upload', async () => {
    const uploadQueuedExports = jest.fn().mockResolvedValue({
      requiresAuth: false,
      attempted: 0,
      uploaded: 0,
      failed: 0,
      errors: [],
    });
    const alertSpy = jest.spyOn(Alert, 'alert');
    mockedUseExpenseData.mockReturnValue(
      makeContextValue({
        state: { exportQueue: [pendingItem] },
        actions: { uploadQueuedExports },
      }),
    );
    renderWithProviders(<SettingsScreen />);
    fireEvent.press(
      screen.getByLabelText('Upload pending exports to Google Drive'),
    );
    await waitFor(() =>
      expect(alertSpy).toHaveBeenCalledWith(
        'Nothing to upload',
        expect.any(String),
      ),
    );
  });

  it('alerts when some uploads fail', async () => {
    const uploadQueuedExports = jest.fn().mockResolvedValue({
      requiresAuth: false,
      attempted: 2,
      uploaded: 1,
      failed: 1,
      errors: ['network error'],
    });
    const alertSpy = jest.spyOn(Alert, 'alert');
    mockedUseExpenseData.mockReturnValue(
      makeContextValue({
        state: { exportQueue: [pendingItem] },
        actions: { uploadQueuedExports },
      }),
    );
    renderWithProviders(<SettingsScreen />);
    fireEvent.press(
      screen.getByLabelText('Upload pending exports to Google Drive'),
    );
    await waitFor(() =>
      expect(alertSpy).toHaveBeenCalledWith(
        'Upload completed with errors',
        expect.any(String),
      ),
    );
  });

  it('alerts when the upload throws', async () => {
    const uploadQueuedExports = jest
      .fn()
      .mockRejectedValue(new Error('offline'));
    const alertSpy = jest.spyOn(Alert, 'alert');
    mockedUseExpenseData.mockReturnValue(
      makeContextValue({
        state: { exportQueue: [pendingItem] },
        actions: { uploadQueuedExports },
      }),
    );
    renderWithProviders(<SettingsScreen />);
    fireEvent.press(
      screen.getByLabelText('Upload pending exports to Google Drive'),
    );
    await waitFor(() =>
      expect(alertSpy).toHaveBeenCalledWith('Upload failed', 'offline'),
    );
  });

  it('clears the Drive folder with the use-default action', async () => {
    const setDriveFolderId = jest.fn().mockResolvedValue(undefined);
    jest.spyOn(Alert, 'alert');
    mockedUseExpenseData.mockReturnValue(
      makeContextValue({
        state: { settings: { driveFolderId: 'folder-1' } },
        actions: { setDriveFolderId },
      }),
    );
    renderWithProviders(<SettingsScreen />);
    fireEvent.press(screen.getByLabelText('Change Drive backup folder'));
    fireEvent.press(screen.getByLabelText('Reset Drive folder'));
    await waitFor(() => expect(setDriveFolderId).toHaveBeenCalledWith(null));
  });

  it('saves a Drive backup folder id', async () => {
    const setDriveFolderId = jest.fn().mockResolvedValue(undefined);
    jest.spyOn(Alert, 'alert');
    mockedUseExpenseData.mockReturnValue(
      makeContextValue({ actions: { setDriveFolderId } }),
    );
    renderWithProviders(<SettingsScreen />);
    fireEvent.press(screen.getByLabelText('Change Drive backup folder'));
    fireEvent.changeText(
      screen.getByLabelText('Google Drive folder identifier'),
      'folder-123',
    );
    fireEvent.press(screen.getByLabelText('Save Drive folder'));
    await waitFor(() =>
      expect(setDriveFolderId).toHaveBeenCalledWith('folder-123'),
    );
  });
});
