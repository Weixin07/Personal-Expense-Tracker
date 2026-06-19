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
import { useExpenseData } from '../../context/AppContext';
import type { ExportQueueItem } from '../../context/AppContext';

const mockNavigate = jest.fn();
jest.mock('@react-navigation/native', () => ({
  useNavigation: () => ({ navigate: mockNavigate, goBack: jest.fn() }),
}));

jest.mock('../../context/AppContext', () => ({
  useExpenseData: jest.fn(),
}));

const mockedUseExpenseData = useExpenseData as unknown as jest.Mock;

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

  it('navigates to the export queue', () => {
    renderWithProviders(<SettingsScreen />);
    fireEvent.press(screen.getByLabelText('Open export queue'));
    expect(mockNavigate).toHaveBeenCalledWith('ExportQueue');
  });

  it('toggles the biometric gate', () => {
    const setBiometricGateEnabled = jest.fn();
    mockedUseExpenseData.mockReturnValue(
      makeContextValue({ actions: { setBiometricGateEnabled } }),
    );
    renderWithProviders(<SettingsScreen />);
    fireEvent(
      screen.getByLabelText('Toggle biometric lock'),
      'valueChange',
      true,
    );
    expect(setBiometricGateEnabled).toHaveBeenCalledWith(true);
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
