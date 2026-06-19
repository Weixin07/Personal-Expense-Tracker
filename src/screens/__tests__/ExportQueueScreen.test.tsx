import React from 'react';
import { Alert } from 'react-native';
import {
  renderWithProviders,
  makeContextValue,
  screen,
  fireEvent,
  waitFor,
} from '../../__tests__/test-utils/renderWithProviders';
import ExportQueueScreen from '../ExportQueueScreen';
import { useExpenseData } from '../../context/AppContext';
import type { ExportQueueItem } from '../../context/AppContext';

jest.mock('../../context/AppContext', () => ({
  useExpenseData: jest.fn(),
}));

const mockedUseExpenseData = useExpenseData as unknown as jest.Mock;

const makeItem = (
  overrides: Partial<ExportQueueItem> = {},
): ExportQueueItem => ({
  id: 'e1',
  filename: 'export.csv',
  filePath: 'p',
  status: 'pending',
  createdAt: '2025-01-10T00:00:00.000Z',
  updatedAt: '2025-01-10T00:00:00.000Z',
  ...overrides,
});

beforeEach(() => {
  jest.clearAllMocks();
  mockedUseExpenseData.mockReturnValue(makeContextValue());
});

describe('ExportQueueScreen', () => {
  it('shows the empty state when the queue is empty', () => {
    renderWithProviders(<ExportQueueScreen />);
    expect(screen.getByText('Queue is empty')).toBeOnTheScreen();
  });

  it('queues a new export', async () => {
    const queueExport = jest.fn().mockResolvedValue(undefined);
    mockedUseExpenseData.mockReturnValue(
      makeContextValue({ actions: { queueExport } }),
    );
    renderWithProviders(<ExportQueueScreen />);
    fireEvent.press(screen.getByLabelText('Queue new export'));
    await waitFor(() => expect(queueExport).toHaveBeenCalled());
  });

  it('alerts when queuing an export fails', async () => {
    const queueExport = jest.fn().mockRejectedValue(new Error('disk full'));
    const alertSpy = jest.spyOn(Alert, 'alert');
    mockedUseExpenseData.mockReturnValue(
      makeContextValue({ actions: { queueExport } }),
    );
    renderWithProviders(<ExportQueueScreen />);
    fireEvent.press(screen.getByLabelText('Queue new export'));
    await waitFor(() =>
      expect(alertSpy).toHaveBeenCalledWith('Export failed', 'disk full'),
    );
  });

  it('retries a failed export', async () => {
    const retryExport = jest.fn().mockResolvedValue(undefined);
    mockedUseExpenseData.mockReturnValue(
      makeContextValue({
        state: { exportQueue: [makeItem({ status: 'failed' })] },
        actions: { retryExport },
      }),
    );
    renderWithProviders(<ExportQueueScreen />);
    fireEvent.press(screen.getByLabelText('Retry export'));
    await waitFor(() => expect(retryExport).toHaveBeenCalledWith('e1'));
  });

  it('confirms before removing an export', async () => {
    const removeExport = jest.fn().mockResolvedValue(undefined);
    const alertSpy = jest.spyOn(Alert, 'alert');
    mockedUseExpenseData.mockReturnValue(
      makeContextValue({
        state: { exportQueue: [makeItem()] },
        actions: { removeExport },
      }),
    );
    renderWithProviders(<ExportQueueScreen />);
    fireEvent.press(screen.getByLabelText('Remove export'));
    const buttons = alertSpy.mock.calls[0][2] as Array<{
      text?: string;
      onPress?: () => void;
    }>;
    buttons.find(button => button.text === 'Remove')?.onPress?.();
    await waitFor(() => expect(removeExport).toHaveBeenCalledWith('e1'));
  });

  it('clears completed exports', async () => {
    const clearCompletedExports = jest.fn().mockResolvedValue(undefined);
    mockedUseExpenseData.mockReturnValue(
      makeContextValue({
        state: { exportQueue: [makeItem({ status: 'completed' })] },
        actions: { clearCompletedExports },
      }),
    );
    renderWithProviders(<ExportQueueScreen />);
    fireEvent.press(screen.getByLabelText('Clear completed or failed exports'));
    await waitFor(() => expect(clearCompletedExports).toHaveBeenCalled());
  });

  it('alerts when a retry fails', async () => {
    const retryExport = jest.fn().mockRejectedValue(new Error('retry boom'));
    const alertSpy = jest.spyOn(Alert, 'alert');
    mockedUseExpenseData.mockReturnValue(
      makeContextValue({
        state: { exportQueue: [makeItem({ status: 'failed' })] },
        actions: { retryExport },
      }),
    );
    renderWithProviders(<ExportQueueScreen />);
    fireEvent.press(screen.getByLabelText('Retry export'));
    await waitFor(() =>
      expect(alertSpy).toHaveBeenCalledWith('Retry failed', 'retry boom'),
    );
  });

  it('alerts when clearing completed exports fails', async () => {
    const clearCompletedExports = jest
      .fn()
      .mockRejectedValue(new Error('clear boom'));
    const alertSpy = jest.spyOn(Alert, 'alert');
    mockedUseExpenseData.mockReturnValue(
      makeContextValue({
        state: { exportQueue: [makeItem({ status: 'completed' })] },
        actions: { clearCompletedExports },
      }),
    );
    renderWithProviders(<ExportQueueScreen />);
    fireEvent.press(screen.getByLabelText('Clear completed or failed exports'));
    await waitFor(() =>
      expect(alertSpy).toHaveBeenCalledWith('Clear failed', 'clear boom'),
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
        state: { exportQueue: [makeItem()] },
        actions: { uploadQueuedExports },
      }),
    );
    renderWithProviders(<ExportQueueScreen />);
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

  it('renders details for a completed export with drive metadata', () => {
    mockedUseExpenseData.mockReturnValue(
      makeContextValue({
        state: {
          exportQueue: [
            makeItem({
              status: 'completed',
              uploadedAt: '2025-01-11T00:00:00.000Z',
              driveFileId: 'drive-1',
            }),
          ],
          settings: { driveFolderId: 'folder-1' },
        },
      }),
    );
    renderWithProviders(<ExportQueueScreen />);
    expect(screen.getByText('export.csv')).toBeOnTheScreen();
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
        state: { exportQueue: [makeItem()] },
        actions: { uploadQueuedExports },
      }),
    );
    renderWithProviders(<ExportQueueScreen />);
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
});
