import React from 'react';
import { Alert } from 'react-native';
import {
  renderWithProviders,
  makeContextValue,
  screen,
  fireEvent,
  waitFor,
} from '../../__tests__/test-utils/renderWithProviders';
import ImportScreen from '../ImportScreen';
import { useTransactionData } from '../../context/AppContext';
import { pickCsvFile, readFileAsString } from '../../security/storageAccess';
import { listBackupFiles, downloadFileContent } from '../../export';
import type { TransactionRecord } from '../../database';
import { makeImportSummary } from '../../__tests__/test-utils/importFixtures';

jest.mock('../../context/AppContext', () => ({
  useTransactionData: jest.fn(),
}));
jest.mock('../../security/storageAccess', () => ({
  pickCsvFile: jest.fn(),
  readFileAsString: jest.fn(),
}));
jest.mock('../../export', () => ({
  listBackupFiles: jest.fn(),
  downloadFileContent: jest.fn(),
}));

const mockedUseExpenseData = useTransactionData as unknown as jest.Mock;
const mockedPickCsvFile = pickCsvFile as jest.Mock;
const mockedReadFileAsString = readFileAsString as jest.Mock;
const mockedListBackupFiles = listBackupFiles as jest.Mock;
const mockedDownloadFileContent = downloadFileContent as jest.Mock;

const APP_CSV =
  'id,description,amount_native,currency_code,fx_rate_to_base,base_amount,date,category,notes,base_currency_code,payee\r\n' +
  '1,Lunch,10.00,USD,1.000000,10.00,2024-01-01,Food,,USD,Cafe\r\n';

let importTransactions: jest.Mock;

beforeEach(() => {
  jest.clearAllMocks();
  importTransactions = jest
    .fn()
    .mockResolvedValue(
      makeImportSummary({ insertedExpenses: 1, createdCategories: 1 }),
    );
  mockedUseExpenseData.mockReturnValue(
    makeContextValue({ actions: { importTransactions } }),
  );
});

describe('ImportScreen', () => {
  it('imports a local CSV end to end', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert');
    mockedPickCsvFile.mockResolvedValue({ ok: true, uri: 'content://x.csv' });
    mockedReadFileAsString.mockResolvedValue(APP_CSV);

    renderWithProviders(<ImportScreen />);

    fireEvent.press(screen.getByLabelText('Import from a CSV file'));

    await waitFor(() =>
      expect(screen.getByText('Map columns')).toBeOnTheScreen(),
    );

    fireEvent.press(screen.getByLabelText('Preview import'));

    await waitFor(() =>
      expect(screen.getByText('Review import')).toBeOnTheScreen(),
    );
    expect(screen.getByText('1 of 1 rows ready to import.')).toBeOnTheScreen();

    fireEvent.press(screen.getByLabelText('Confirm import'));

    await waitFor(() => expect(importTransactions).toHaveBeenCalled());
    const [preview] = importTransactions.mock.calls[0];
    expect(preview.valid).toHaveLength(1);
    await waitFor(() =>
      expect(alertSpy).toHaveBeenCalledWith(
        'Import complete',
        expect.stringContaining('1 expense and 0 income entries imported'),
      ),
    );
  });

  it('stays on the source step when the file pick is cancelled', async () => {
    mockedPickCsvFile.mockResolvedValue({ ok: false, cancelled: true });

    renderWithProviders(<ImportScreen />);
    fireEvent.press(screen.getByLabelText('Import from a CSV file'));

    await waitFor(() => expect(mockedPickCsvFile).toHaveBeenCalled());
    expect(screen.queryByText('Map columns')).toBeNull();
    expect(screen.getByText('Choose a source')).toBeOnTheScreen();
  });

  it('lists and downloads a Drive backup', async () => {
    mockedListBackupFiles.mockResolvedValue({
      ok: true,
      files: [
        { id: 'f1', name: 'backup.csv', modifiedTime: '2024-01-01T00:00:00Z' },
      ],
    });
    mockedDownloadFileContent.mockResolvedValue(APP_CSV);

    renderWithProviders(<ImportScreen />);
    fireEvent.press(screen.getByLabelText('Import from Google Drive'));

    await waitFor(() =>
      expect(screen.getByText('Select a backup')).toBeOnTheScreen(),
    );

    fireEvent.press(screen.getByLabelText('Import backup.csv'));

    await waitFor(() =>
      expect(screen.getByText('Map columns')).toBeOnTheScreen(),
    );
    expect(mockedDownloadFileContent).toHaveBeenCalledWith('f1', {
      interactive: true,
    });
  });

  it('offers the file picker when Drive holds no app backups', async () => {
    mockedListBackupFiles.mockResolvedValue({ ok: true, files: [] });
    mockedPickCsvFile.mockResolvedValue({ ok: true, uri: 'content://x.csv' });
    mockedReadFileAsString.mockResolvedValue(APP_CSV);

    renderWithProviders(<ImportScreen />);
    fireEvent.press(screen.getByLabelText('Import from Google Drive'));

    await waitFor(() =>
      expect(screen.getByText(/No backups from this app/)).toBeOnTheScreen(),
    );

    fireEvent.press(screen.getByLabelText('Choose a CSV file instead'));

    await waitFor(() =>
      expect(screen.getByText('Map columns')).toBeOnTheScreen(),
    );
  });

  it('prompts to sign in when Drive requires auth', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert');
    mockedListBackupFiles.mockResolvedValue({
      ok: false,
      requiresAuth: true,
    });

    renderWithProviders(<ImportScreen />);
    fireEvent.press(screen.getByLabelText('Import from Google Drive'));

    await waitFor(() =>
      expect(alertSpy).toHaveBeenCalledWith(
        'Sign in required',
        expect.any(String),
      ),
    );
  });

  it('surfaces a configuration error instead of closing silently', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert');
    mockedListBackupFiles.mockResolvedValue({
      ok: false,
      requiresAuth: false,
      message: 'DEVELOPER_ERROR',
      errorKind: 'developer-error',
    });

    renderWithProviders(<ImportScreen />);
    fireEvent.press(screen.getByLabelText('Import from Google Drive'));

    await waitFor(() =>
      expect(alertSpy).toHaveBeenCalledWith(
        'Google sign-in not configured',
        expect.stringContaining('SHA-1'),
      ),
    );
    expect(screen.getByText('Choose a source')).toBeOnTheScreen();
  });

  it('supports manual remapping, date-format change, and cancel', async () => {
    mockedPickCsvFile.mockResolvedValue({ ok: true, uri: 'content://x.csv' });
    mockedReadFileAsString.mockResolvedValue(APP_CSV);

    renderWithProviders(<ImportScreen />);
    fireEvent.press(screen.getByLabelText('Import from a CSV file'));
    await waitFor(() =>
      expect(screen.getByText('Map columns')).toBeOnTheScreen(),
    );

    fireEvent.press(screen.getByText('DD/MM/YYYY'));

    fireEvent.press(screen.getByLabelText('Map Notes'));
    fireEvent.press(screen.getByLabelText('Clear Notes mapping'));

    fireEvent.press(screen.getByText('Cancel'));
    expect(screen.getByText('Choose a source')).toBeOnTheScreen();
  });

  it('auto-maps a type column and surfaces the inferred date order', async () => {
    mockedPickCsvFile.mockResolvedValue({ ok: true, uri: 'content://x.csv' });
    mockedReadFileAsString.mockResolvedValue(
      'Date,Category,Note,Income/Expense,Amount,Currency\r\n' +
        '3/2/2022 10:11,Food,Brownie,Expense,50,INR\r\n' +
        '3/25/2022 9:00,Food,Lunch,Expense,80,INR\r\n',
    );

    renderWithProviders(<ImportScreen />);
    fireEvent.press(screen.getByLabelText('Import from a CSV file'));
    await waitFor(() =>
      expect(screen.getByText('Map columns')).toBeOnTheScreen(),
    );

    expect(screen.getByLabelText('Map Type')).toBeOnTheScreen();
    expect(
      screen.getByText(/Detected MM\/DD\/YYYY from your file/),
    ).toBeOnTheScreen();
  });

  it('reports duplicates and skipped rows and surfaces a commit failure', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert');
    const failingImport = jest.fn().mockRejectedValue(new Error('db down'));
    const existing: TransactionRecord = {
      type: 'expense',
      id: 99,
      description: 'Lunch',
      payee: 'Cafe',
      amountNative: 10,
      currencyCode: 'USD',
      fxRateToBase: 1,
      baseAmount: 10,
      baseCurrencyCode: 'USD',
      date: '2024-01-01',
      time: null,
      categoryId: null,
      notes: null,
      createdAt: '',
      updatedAt: '',
    };
    mockedUseExpenseData.mockReturnValue(
      makeContextValue({
        state: { transactions: [existing] },
        actions: { importTransactions: failingImport },
      }),
    );
    mockedPickCsvFile.mockResolvedValue({ ok: true, uri: 'content://x.csv' });
    mockedReadFileAsString.mockResolvedValue(
      'id,description,amount_native,currency_code,fx_rate_to_base,base_amount,date,category,notes,base_currency_code,payee\r\n' +
        '1,Lunch,10.00,USD,1.000000,10.00,2024-01-01,Food,,USD,Cafe\r\n' +
        '2,Bad,0,USD,1.000000,0.00,2024-01-02,Food,,USD,Cafe\r\n',
    );

    renderWithProviders(<ImportScreen />);
    fireEvent.press(screen.getByLabelText('Import from a CSV file'));
    await waitFor(() =>
      expect(screen.getByText('Map columns')).toBeOnTheScreen(),
    );
    fireEvent.press(screen.getByLabelText('Preview import'));

    // The only importable row duplicates a stored transaction, so with skipping
    // on nothing is left to import.
    await waitFor(() =>
      expect(
        screen.getByText('0 of 2 rows ready to import.'),
      ).toBeOnTheScreen(),
    );
    expect(screen.getByText(/match a stored transaction/)).toBeOnTheScreen();
    expect(screen.getByText(/Every row is a duplicate/)).toBeOnTheScreen();
    expect(screen.getByText('1 row skipped')).toBeOnTheScreen();
    expect(screen.getByLabelText('Confirm import')).toBeDisabled();

    fireEvent(
      screen.getByLabelText('Skip duplicate rows'),
      'valueChange',
      false,
    );

    await waitFor(() =>
      expect(
        screen.getByText('1 of 2 rows ready to import.'),
      ).toBeOnTheScreen(),
    );
    fireEvent.press(screen.getByLabelText('Confirm import'));
    await waitFor(() =>
      expect(alertSpy).toHaveBeenCalledWith('Import failed', 'db down'),
    );
  });

  it('imports a semicolon file with decorated amounts and reads both directions', async () => {
    mockedPickCsvFile.mockResolvedValue({ ok: true, uri: 'content://x.csv' });
    mockedReadFileAsString.mockResolvedValue(
      'Transaction Date;Merchant;Amount;Currency\r\n' +
        '2024-01-01;Cafe;"$1,234.56";USD\r\n' +
        '2024-01-02;Employer;-500;USD\r\n',
    );

    renderWithProviders(<ImportScreen />);
    fireEvent.press(screen.getByLabelText('Import from a CSV file'));
    await waitFor(() =>
      expect(screen.getByText('Map columns')).toBeOnTheScreen(),
    );

    fireEvent.press(screen.getByLabelText('Preview import'));

    // The file carries a negative, so the sign convention applies: negatives are
    // expenses and positives income under the default.
    await waitFor(() =>
      expect(
        screen.getByText('2 of 2 rows ready to import.'),
      ).toBeOnTheScreen(),
    );
    expect(screen.getByText('1 expense and 1 income entry.')).toBeOnTheScreen();

    fireEvent.press(screen.getByLabelText('Confirm import'));
    await waitFor(() => expect(importTransactions).toHaveBeenCalled());
    const [preview] = importTransactions.mock.calls[0];
    expect(preview.valid[0].record.amountNative).toBe(1234.56);
    expect(preview.valid[0].record.payee).toBe('Cafe');
  });

  it('imports negative rows as expenses once the sign convention is flipped', async () => {
    mockedPickCsvFile.mockResolvedValue({ ok: true, uri: 'content://x.csv' });
    mockedReadFileAsString.mockResolvedValue(
      'date,payee,amount,currency\r\n2024-01-01,Cafe,-25.00,USD\r\n',
    );

    renderWithProviders(<ImportScreen />);
    fireEvent.press(screen.getByLabelText('Import from a CSV file'));
    await waitFor(() =>
      expect(screen.getByText('Map columns')).toBeOnTheScreen(),
    );

    fireEvent.press(screen.getByText('Expense'));
    fireEvent.press(screen.getByLabelText('Preview import'));

    await waitFor(() =>
      expect(
        screen.getByText('1 of 1 rows ready to import.'),
      ).toBeOnTheScreen(),
    );
  });

  it('re-parses the file when a delimiter is chosen manually', async () => {
    mockedPickCsvFile.mockResolvedValue({ ok: true, uri: 'content://x.csv' });
    mockedReadFileAsString.mockResolvedValue(
      'date,payee,amount,currency\r\n2024-01-01,Cafe,10,USD\r\n',
    );

    renderWithProviders(<ImportScreen />);
    fireEvent.press(screen.getByLabelText('Import from a CSV file'));
    await waitFor(() =>
      expect(screen.getByText('Map columns')).toBeOnTheScreen(),
    );
    expect(
      screen.queryByText('Map the required columns to continue.'),
    ).toBeNull();

    fireEvent.press(screen.getByText('Semicolon'));

    await waitFor(() =>
      expect(
        screen.getByText('Map the required columns to continue.'),
      ).toBeOnTheScreen(),
    );
  });

  it('applies the number-format override to an ambiguous amount', async () => {
    mockedPickCsvFile.mockResolvedValue({ ok: true, uri: 'content://x.csv' });
    mockedReadFileAsString.mockResolvedValue(
      'date,payee,amount,currency\r\n2024-01-01,Cafe,1.234,USD\r\n',
    );

    renderWithProviders(<ImportScreen />);
    fireEvent.press(screen.getByLabelText('Import from a CSV file'));
    await waitFor(() =>
      expect(screen.getByText('Map columns')).toBeOnTheScreen(),
    );

    fireEvent.press(screen.getByText('1,234.56'));
    fireEvent.press(screen.getByLabelText('Preview import'));

    await waitFor(() =>
      expect(
        screen.getByText('1 of 1 rows ready to import.'),
      ).toBeOnTheScreen(),
    );
    fireEvent.press(screen.getByLabelText('Confirm import'));

    await waitFor(() => expect(importTransactions).toHaveBeenCalled());
    const [preview] = importTransactions.mock.calls[0];
    expect(preview.valid[0].record.amountNative).toBe(1.234);
  });

  it('asks which currency an ambiguous symbol means', async () => {
    mockedPickCsvFile.mockResolvedValue({ ok: true, uri: 'content://x.csv' });
    mockedReadFileAsString.mockResolvedValue(
      'date,payee,amount,currency\r\n2024-01-01,Cafe,10,$\r\n',
    );

    renderWithProviders(<ImportScreen />);
    fireEvent.press(screen.getByLabelText('Import from a CSV file'));
    await waitFor(() =>
      expect(screen.getByText('Map columns')).toBeOnTheScreen(),
    );

    fireEvent.press(screen.getByLabelText('Preview import'));

    await waitFor(() =>
      expect(screen.getByText('Choose currencies')).toBeOnTheScreen(),
    );
    expect(screen.getByText('0 of 1 rows ready to import.')).toBeOnTheScreen();

    fireEvent.press(screen.getByLabelText('Use USD for $'));

    await waitFor(() =>
      expect(
        screen.getByText('1 of 1 rows ready to import.'),
      ).toBeOnTheScreen(),
    );
  });

  it('applies a default currency when the file has no currency column', async () => {
    mockedPickCsvFile.mockResolvedValue({ ok: true, uri: 'content://x.csv' });
    mockedReadFileAsString.mockResolvedValue(
      'date,payee,amount\r\n2024-01-01,Cafe,10\r\n',
    );

    renderWithProviders(<ImportScreen />);
    fireEvent.press(screen.getByLabelText('Import from a CSV file'));
    await waitFor(() =>
      expect(screen.getByText('Map columns')).toBeOnTheScreen(),
    );

    expect(screen.getByLabelText('Default currency')).toBeOnTheScreen();

    fireEvent.press(screen.getByLabelText('Preview import'));

    await waitFor(() =>
      expect(
        screen.getByText('1 of 1 rows ready to import.'),
      ).toBeOnTheScreen(),
    );

    fireEvent.press(screen.getByLabelText('Confirm import'));
    await waitFor(() => expect(importTransactions).toHaveBeenCalled());
    const [preview] = importTransactions.mock.calls[0];
    expect(preview.valid[0].record.currencyCode).toBe('USD');
  });

  it('prefills the default currency from a base currency that arrives late', async () => {
    mockedUseExpenseData.mockReturnValue(
      makeContextValue({
        state: { settings: { baseCurrency: null } },
        actions: { importTransactions },
      }),
    );
    mockedPickCsvFile.mockResolvedValue({ ok: true, uri: 'content://x.csv' });
    mockedReadFileAsString.mockResolvedValue(
      'date,payee,amount\r\n2024-01-01,Cafe,10\r\n',
    );

    const { rerender } = renderWithProviders(<ImportScreen />);
    fireEvent.press(screen.getByLabelText('Import from a CSV file'));
    await waitFor(() =>
      expect(screen.getByText('Map columns')).toBeOnTheScreen(),
    );
    expect(screen.getByLabelText('Default currency')).toHaveDisplayValue('');

    mockedUseExpenseData.mockReturnValue(
      makeContextValue({
        state: { settings: { baseCurrency: 'SGD' } },
        actions: { importTransactions },
      }),
    );
    rerender(<ImportScreen />);

    expect(screen.getByLabelText('Default currency')).toHaveDisplayValue('SGD');
  });

  it('surfaces a file-open failure that is not a cancellation', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert');
    mockedPickCsvFile.mockResolvedValue({
      ok: false,
      cancelled: false,
      message: 'Permission denied',
    });

    renderWithProviders(<ImportScreen />);
    fireEvent.press(screen.getByLabelText('Import from a CSV file'));

    await waitFor(() =>
      expect(alertSpy).toHaveBeenCalledWith(
        'Import failed',
        'Permission denied',
      ),
    );
    expect(screen.getByText('Choose a source')).toBeOnTheScreen();
  });

  it('surfaces a read failure after the file is picked', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert');
    mockedPickCsvFile.mockResolvedValue({ ok: true, uri: 'content://x.csv' });
    mockedReadFileAsString.mockRejectedValue(new Error('unreadable'));

    renderWithProviders(<ImportScreen />);
    fireEvent.press(screen.getByLabelText('Import from a CSV file'));

    await waitFor(() =>
      expect(alertSpy).toHaveBeenCalledWith('Import failed', 'unreadable'),
    );
  });

  it('reports a generic Drive listing failure', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert');
    mockedListBackupFiles.mockResolvedValue({
      ok: false,
      requiresAuth: false,
      message: 'Network unreachable',
    });

    renderWithProviders(<ImportScreen />);
    fireEvent.press(screen.getByLabelText('Import from Google Drive'));

    await waitFor(() =>
      expect(alertSpy).toHaveBeenCalledWith(
        'Unable to list backups',
        'Network unreachable',
      ),
    );
  });

  it('reports a Drive download failure', async () => {
    const alertSpy = jest.spyOn(Alert, 'alert');
    mockedListBackupFiles.mockResolvedValue({
      ok: true,
      files: [
        { id: 'f1', name: 'backup.csv', modifiedTime: '2024-01-01T00:00:00Z' },
      ],
    });
    mockedDownloadFileContent.mockRejectedValue(new Error('offline'));

    renderWithProviders(<ImportScreen />);
    fireEvent.press(screen.getByLabelText('Import from Google Drive'));
    await waitFor(() =>
      expect(screen.getByText('Select a backup')).toBeOnTheScreen(),
    );

    fireEvent.press(screen.getByLabelText('Import backup.csv'));

    await waitFor(() =>
      expect(alertSpy).toHaveBeenCalledWith('Download failed', 'offline'),
    );
  });

  it('reports an FX review when a foreign rate is unknown', async () => {
    mockedPickCsvFile.mockResolvedValue({ ok: true, uri: 'content://x.csv' });
    mockedReadFileAsString.mockResolvedValue(
      'id,description,amount_native,currency_code,fx_rate_to_base,base_amount,date,category,notes,base_currency_code,payee\r\n' +
        '1,Paris,10.00,EUR,,,2024-01-01,Food,,USD,Cafe\r\n',
    );

    renderWithProviders(<ImportScreen />);
    fireEvent.press(screen.getByLabelText('Import from a CSV file'));
    await waitFor(() =>
      expect(screen.getByText('Map columns')).toBeOnTheScreen(),
    );
    fireEvent.press(screen.getByLabelText('Preview import'));

    await waitFor(() =>
      expect(screen.getByText('Confirm FX rates')).toBeOnTheScreen(),
    );
    expect(screen.getByText('0 of 1 rows ready to import.')).toBeOnTheScreen();
    expect(screen.getByText(/1 row need(s)? an FX rate/)).toBeOnTheScreen();
  });

  describe('confirming FX rates', () => {
    const FOREIGN_CSV =
      'id,description,amount_native,currency_code,fx_rate_to_base,base_amount,date,category,notes,base_currency_code,payee\r\n' +
      '1,Paris,10.00,EUR,,,2024-01-01,Food,,USD,Cafe\r\n';

    const reachFxReview = async (csv: string = FOREIGN_CSV) => {
      mockedPickCsvFile.mockResolvedValue({ ok: true, uri: 'content://x.csv' });
      mockedReadFileAsString.mockResolvedValue(csv);

      renderWithProviders(<ImportScreen />);
      fireEvent.press(screen.getByLabelText('Import from a CSV file'));
      await waitFor(() =>
        expect(screen.getByText('Map columns')).toBeOnTheScreen(),
      );
      fireEvent.press(screen.getByLabelText('Preview import'));
      await waitFor(() =>
        expect(screen.getByText('Confirm FX rates')).toBeOnTheScreen(),
      );
    };

    it('releases held rows once a rate is applied', async () => {
      await reachFxReview();

      fireEvent.changeText(screen.getByLabelText('FX rate EUR to USD'), '1.25');
      fireEvent.press(screen.getByLabelText('Apply FX rates'));

      await waitFor(() =>
        expect(
          screen.getByText('1 of 1 rows ready to import.'),
        ).toBeOnTheScreen(),
      );
      expect(screen.getByLabelText('Confirm import')).toBeEnabled();
    });

    it('blocks the import until entered rates are applied', async () => {
      await reachFxReview();

      fireEvent.changeText(screen.getByLabelText('FX rate EUR to USD'), '1.25');

      expect(screen.getByLabelText('Confirm import')).toBeDisabled();
      expect(
        screen.getByText('Apply the rates you entered before importing.'),
      ).toBeOnTheScreen();
    });

    it('keeps the entered rate when the preview is rebuilt', async () => {
      await reachFxReview();

      fireEvent.changeText(screen.getByLabelText('FX rate EUR to USD'), '1.25');
      fireEvent.press(screen.getByLabelText('Apply FX rates'));
      await waitFor(() =>
        expect(
          screen.getByText('1 of 1 rows ready to import.'),
        ).toBeOnTheScreen(),
      );

      expect(screen.getByLabelText('FX rate EUR to USD').props.value).toBe(
        '1.25',
      );
    });

    it('keeps a typed rate across an ambiguous-currency choice', async () => {
      await reachFxReview(
        'date,payee,amount,currency\r\n' +
          '2024-01-01,Cafe,10,EUR\r\n' +
          '2024-01-02,Bar,20,$\r\n',
      );

      fireEvent.changeText(screen.getByLabelText('FX rate EUR to USD'), '1.25');
      fireEvent.press(screen.getByLabelText('Use USD for $'));

      await waitFor(() =>
        expect(screen.queryByText('Choose currencies')).toBeNull(),
      );
      expect(screen.getByLabelText('FX rate EUR to USD').props.value).toBe(
        '1.25',
      );
    });

    it('commits the applied rate keyed by its currency pair', async () => {
      await reachFxReview();

      fireEvent.changeText(screen.getByLabelText('FX rate EUR to USD'), '1.25');
      fireEvent.press(screen.getByLabelText('Apply FX rates'));
      await waitFor(() =>
        expect(
          screen.getByText('1 of 1 rows ready to import.'),
        ).toBeOnTheScreen(),
      );

      fireEvent.press(screen.getByLabelText('Confirm import'));

      await waitFor(() => expect(importTransactions).toHaveBeenCalled());
      expect(importTransactions.mock.calls[0][1]).toEqual({ 'USD|EUR': 1.25 });
    });

    it('leaves Apply disabled until a usable rate is entered', async () => {
      await reachFxReview();

      expect(screen.getByLabelText('Apply FX rates')).toBeDisabled();

      fireEvent.changeText(screen.getByLabelText('FX rate EUR to USD'), '0');
      expect(screen.getByLabelText('Apply FX rates')).toBeDisabled();
    });

    it('queries a rate an order of magnitude off the last one used', async () => {
      const alertSpy = jest.spyOn(Alert, 'alert');
      mockedUseExpenseData.mockReturnValue(
        makeContextValue({
          state: {
            fxRateCache: [
              {
                baseCurrencyCode: 'USD',
                currencyCode: 'EUR',
                fxRateToBase: 1.1,
                updatedAt: '2024-01-01T00:00:00Z',
              },
            ],
          },
          actions: { importTransactions },
        }),
      );
      await reachFxReview();

      fireEvent.changeText(screen.getByLabelText('FX rate EUR to USD'), '17.8');
      fireEvent.press(screen.getByLabelText('Apply FX rates'));

      await waitFor(() => expect(alertSpy).toHaveBeenCalled());
      expect(alertSpy.mock.calls[0][0]).toBe('Check these rates');
      expect(alertSpy.mock.calls[0][1]).toMatch(
        'The rate you last used was 1.1',
      );
    });

    it('accepts a rate close to the last one used without querying', async () => {
      const alertSpy = jest.spyOn(Alert, 'alert');
      mockedUseExpenseData.mockReturnValue(
        makeContextValue({
          state: {
            fxRateCache: [
              {
                baseCurrencyCode: 'USD',
                currencyCode: 'EUR',
                fxRateToBase: 1.1,
                updatedAt: '2024-01-01T00:00:00Z',
              },
            ],
          },
          actions: { importTransactions },
        }),
      );
      await reachFxReview();

      fireEvent.changeText(screen.getByLabelText('FX rate EUR to USD'), '1.25');
      fireEvent.press(screen.getByLabelText('Apply FX rates'));

      await waitFor(() =>
        expect(
          screen.getByText('1 of 1 rows ready to import.'),
        ).toBeOnTheScreen(),
      );
      expect(alertSpy).not.toHaveBeenCalledWith(
        'Check these rates',
        expect.anything(),
        expect.anything(),
      );
    });

    it('queries a parity rate between different currencies', async () => {
      const alertSpy = jest.spyOn(Alert, 'alert');
      await reachFxReview();

      fireEvent.changeText(screen.getByLabelText('FX rate EUR to USD'), '1');
      fireEvent.press(screen.getByLabelText('Apply FX rates'));

      await waitFor(() => expect(alertSpy).toHaveBeenCalled());
      expect(alertSpy.mock.calls[0][0]).toBe('Check these rates');
      expect(alertSpy.mock.calls[0][1]).toMatch('1 EUR = 1 USD');
      expect(
        screen.getByText('0 of 1 rows ready to import.'),
      ).toBeOnTheScreen();
    });

    it('applies nothing when the query is cancelled', async () => {
      const alertSpy = jest.spyOn(Alert, 'alert');
      await reachFxReview();

      fireEvent.changeText(screen.getByLabelText('FX rate EUR to USD'), '1');
      fireEvent.press(screen.getByLabelText('Apply FX rates'));
      await waitFor(() => expect(alertSpy).toHaveBeenCalled());

      const buttons = alertSpy.mock.calls[0][2] ?? [];
      buttons.find(button => button.style === 'cancel')?.onPress?.();

      expect(
        screen.getByText('0 of 1 rows ready to import.'),
      ).toBeOnTheScreen();
      expect(screen.getByLabelText('Confirm import')).toBeDisabled();
    });

    it('applies the queried rate when it is confirmed', async () => {
      const alertSpy = jest.spyOn(Alert, 'alert');
      await reachFxReview();

      fireEvent.changeText(screen.getByLabelText('FX rate EUR to USD'), '1');
      fireEvent.press(screen.getByLabelText('Apply FX rates'));
      await waitFor(() => expect(alertSpy).toHaveBeenCalled());

      const buttons = alertSpy.mock.calls[0][2] ?? [];
      buttons.find(button => button.text === 'Use these rates')?.onPress?.();

      await waitFor(() =>
        expect(
          screen.getByText('1 of 1 rows ready to import.'),
        ).toBeOnTheScreen(),
      );
    });
  });

  it('distinguishes repeated column names in the mapping menu', async () => {
    mockedPickCsvFile.mockResolvedValue({ ok: true, uri: 'content://x.csv' });
    mockedReadFileAsString.mockResolvedValue(
      'Date,Amount,Currency,Ref,Ref\r\n' + '2024-01-01,10,USD,alpha,beta\r\n',
    );

    renderWithProviders(<ImportScreen />);
    fireEvent.press(screen.getByLabelText('Import from a CSV file'));
    await waitFor(() =>
      expect(screen.getByText('Map columns')).toBeOnTheScreen(),
    );

    fireEvent.press(screen.getByLabelText('Map Payee'));

    await waitFor(() =>
      expect(screen.getByText('Ref (column 4)')).toBeOnTheScreen(),
    );
    expect(screen.getByText('Ref (column 5)')).toBeOnTheScreen();
  });

  describe('time column', () => {
    const withTime = (time: string) =>
      'description,amount_native,currency_code,fx_rate_to_base,date,time\r\n' +
      `Lunch,10.00,USD,1.000000,2024-01-01,${time}\r\n`;

    const openPreview = async (csv: string) => {
      mockedPickCsvFile.mockResolvedValue({ ok: true, uri: 'file://x.csv' });
      mockedReadFileAsString.mockResolvedValue(csv);
      renderWithProviders(<ImportScreen />);
      fireEvent.press(screen.getByLabelText('Import from a CSV file'));
      await waitFor(() =>
        expect(screen.getByText('Map columns')).toBeOnTheScreen(),
      );
      fireEvent.press(screen.getByLabelText('Preview import'));
      await waitFor(() =>
        expect(screen.getByText('Review import')).toBeOnTheScreen(),
      );
    };

    it('offers Time as an optional mapping target', async () => {
      mockedPickCsvFile.mockResolvedValue({ ok: true, uri: 'file://x.csv' });
      mockedReadFileAsString.mockResolvedValue(APP_CSV);
      renderWithProviders(<ImportScreen />);
      fireEvent.press(screen.getByLabelText('Import from a CSV file'));

      await waitFor(() =>
        expect(screen.getByText('Map columns')).toBeOnTheScreen(),
      );
      expect(screen.getByText('Time')).toBeOnTheScreen();
      expect(screen.queryByText('Time *')).toBeNull();
    });

    it('carries a mapped time through to the import payload', async () => {
      await openPreview(withTime('14:30'));

      fireEvent.press(screen.getByLabelText('Confirm import'));
      await waitFor(() => expect(importTransactions).toHaveBeenCalled());
      const [preview] = importTransactions.mock.calls[0];
      expect(preview.valid[0].record.time).toBe('14:30');
    });

    it('warns about an unreadable time without skipping the row', async () => {
      await openPreview(withTime('25:99'));

      expect(
        screen.getByText('1 of 1 rows ready to import.'),
      ).toBeOnTheScreen();
      expect(
        screen.getByText(
          '1 row had a time that could not be read and will be imported without one.',
        ),
      ).toBeOnTheScreen();
    });
  });

  describe('review decisions', () => {
    const reachPreview = async (csv: string) => {
      mockedPickCsvFile.mockResolvedValue({ ok: true, uri: 'content://x.csv' });
      mockedReadFileAsString.mockResolvedValue(csv);
      renderWithProviders(<ImportScreen />);
      fireEvent.press(screen.getByLabelText('Import from a CSV file'));
      await waitFor(() =>
        expect(screen.getByText('Map columns')).toBeOnTheScreen(),
      );
      fireEvent.press(screen.getByLabelText('Preview import'));
      await waitFor(() =>
        expect(screen.getByText('Review import')).toBeOnTheScreen(),
      );
    };

    it('blocks a multi-currency file when no base currency is set', async () => {
      mockedUseExpenseData.mockReturnValue(
        makeContextValue({
          state: { settings: { baseCurrency: null } },
          actions: { importTransactions },
        }),
      );

      await reachPreview(
        'Date,Description,Amount,Currency\r\n' +
          '2024-01-01,Chai,50,INR\r\n' +
          '2024-01-02,Dinner,15,USD\r\n',
      );

      expect(screen.getByText(/no base currency is set/)).toBeOnTheScreen();
      expect(screen.getByLabelText('Confirm import')).toBeDisabled();
    });

    it('labels each severity band it renders', async () => {
      mockedUseExpenseData.mockReturnValue(
        makeContextValue({
          state: {
            settings: { baseCurrency: 'INR' },
            categories: [
              {
                id: 1,
                name: 'Transport',
                type: 'both',
                createdAt: '',
                updatedAt: '',
              },
            ],
          },
          actions: { importTransactions },
        }),
      );

      await reachPreview(
        'Date,Description,Amount,Currency,Category,Account\r\n' +
          '2024-01-01,Bus,5,USD,Transportation,Cash\r\n',
      );

      expect(screen.getByText('Needs a decision')).toBeOnTheScreen();
      expect(screen.getByText('For your information')).toBeOnTheScreen();
    });

    it('omits the decision band when nothing needs deciding', async () => {
      await reachPreview(APP_CSV);

      expect(screen.queryByText('Needs a decision')).not.toBeOnTheScreen();
    });

    it('reports rows that used a converted amount from the file', async () => {
      mockedUseExpenseData.mockReturnValue(
        makeContextValue({
          state: { settings: { baseCurrency: 'INR' } },
          actions: { importTransactions },
        }),
      );

      await reachPreview(
        'Date,Description,Amount,Currency,base_amount\r\n' +
          '2021-12-08,Dinner,15,USD,1120.72\r\n',
      );

      expect(
        screen.getByText(/1 row used a converted amount from the file/),
      ).toBeOnTheScreen();
      expect(
        screen.getByText('1 of 1 rows ready to import.'),
      ).toBeOnTheScreen();
    });

    const SUSPECT_CSV =
      'Date,Description,Amount,Currency,base_amount\r\n' +
      '2022-03-02,Brownie,50,INR,50\r\n';

    it('warns when a converted amount converts nothing', async () => {
      mockedUseExpenseData.mockReturnValue(
        makeContextValue({
          state: { settings: { baseCurrency: 'MYR' } },
          actions: { importTransactions },
        }),
      );

      await reachPreview(SUSPECT_CSV);

      expect(screen.getByText('Needs a decision')).toBeOnTheScreen();
      expect(
        screen.getByText(/do not look like conversions/),
      ).toBeOnTheScreen();
      expect(screen.getByText(/1 INR = 1.000000 MYR/)).toBeOnTheScreen();
      expect(
        screen.queryByText(/used a converted amount from the file/),
      ).toBeNull();
    });

    it('holds the import until a suspect conversion is confirmed', async () => {
      const alertSpy = jest.spyOn(Alert, 'alert');
      mockedUseExpenseData.mockReturnValue(
        makeContextValue({
          state: { settings: { baseCurrency: 'MYR' } },
          actions: { importTransactions },
        }),
      );

      await reachPreview(SUSPECT_CSV);
      fireEvent.press(screen.getByLabelText('Confirm import'));

      await waitFor(() => expect(alertSpy).toHaveBeenCalled());
      expect(alertSpy.mock.calls[0][0]).toBe('Check the converted amounts');
      expect(importTransactions).not.toHaveBeenCalled();
    });

    it('imports a suspect conversion once it is confirmed', async () => {
      const alertSpy = jest.spyOn(Alert, 'alert');
      mockedUseExpenseData.mockReturnValue(
        makeContextValue({
          state: { settings: { baseCurrency: 'MYR' } },
          actions: { importTransactions },
        }),
      );

      await reachPreview(SUSPECT_CSV);
      fireEvent.press(screen.getByLabelText('Confirm import'));
      await waitFor(() => expect(alertSpy).toHaveBeenCalled());

      const buttons = alertSpy.mock.calls[0][2] as {
        text: string;
        onPress?: () => void;
      }[];
      buttons.find(button => button.text === 'Import anyway')?.onPress?.();

      await waitFor(() => expect(importTransactions).toHaveBeenCalled());
    });

    it('names the rates the import will save as current', async () => {
      mockedUseExpenseData.mockReturnValue(
        makeContextValue({
          state: {
            settings: { baseCurrency: 'USD' },
            fxRateCache: [
              {
                baseCurrencyCode: 'USD',
                currencyCode: 'EUR',
                fxRateToBase: 1.1,
                updatedAt: '2024-03-14T00:00:00Z',
              },
            ],
          },
          actions: { importTransactions },
        }),
      );

      await reachPreview(
        'Date,Description,Amount,Currency\r\n2024-01-01,Paris,10,EUR\r\n',
      );

      expect(screen.getByText(/saved as your current ones/)).toBeOnTheScreen();
      expect(screen.getByText('1 EUR = 1.100000 USD')).toBeOnTheScreen();
    });

    it('repeats the saved rates in the summary once the import runs', async () => {
      const alertSpy = jest.spyOn(Alert, 'alert');
      importTransactions.mockResolvedValue(
        makeImportSummary({
          insertedExpenses: 1,
          seededRates: [
            {
              baseCurrencyCode: 'USD',
              currencyCode: 'EUR',
              fxRateToBase: 1.25,
            },
          ],
        }),
      );

      await reachPreview(
        'Date,Description,Amount,Currency\r\n2024-01-01,Paris,10,EUR\r\n',
      );
      fireEvent.changeText(screen.getByLabelText('FX rate EUR to USD'), '1.25');
      fireEvent.press(screen.getByLabelText('Apply FX rates'));
      await waitFor(() =>
        expect(
          screen.getByText('1 of 1 rows ready to import.'),
        ).toBeOnTheScreen(),
      );

      fireEvent.press(screen.getByLabelText('Confirm import'));

      await waitFor(() => expect(importTransactions).toHaveBeenCalled());
      expect(alertSpy).toHaveBeenCalledWith(
        'Import complete',
        expect.stringContaining(
          'Saved as your current rates: 1 EUR = 1.250000 USD.',
        ),
      );
    });

    it('names the rate a saved one was filled in from', async () => {
      mockedUseExpenseData.mockReturnValue(
        makeContextValue({
          state: {
            settings: { baseCurrency: 'USD' },
            fxRateCache: [
              {
                baseCurrencyCode: 'USD',
                currencyCode: 'EUR',
                fxRateToBase: 1.1,
                updatedAt: '2024-03-14T00:00:00Z',
              },
            ],
          },
          actions: { importTransactions },
        }),
      );

      await reachPreview(
        'Date,Description,Amount,Currency\r\n2024-01-01,Paris,10,EUR\r\n',
      );

      expect(
        screen.getByText(
          /Filled in from your saved rate: 1 EUR = 1.100000 USD, saved on 14\/03\/2024/,
        ),
      ).toBeOnTheScreen();
      expect(screen.getByText(/1 row is counted at it/)).toBeOnTheScreen();
    });

    it('holds rows back when a saved rate is cleared', async () => {
      mockedUseExpenseData.mockReturnValue(
        makeContextValue({
          state: {
            settings: { baseCurrency: 'USD' },
            fxRateCache: [
              {
                baseCurrencyCode: 'USD',
                currencyCode: 'EUR',
                fxRateToBase: 1.1,
                updatedAt: '2024-03-14T00:00:00Z',
              },
            ],
          },
          actions: { importTransactions },
        }),
      );

      await reachPreview(
        'Date,Description,Amount,Currency\r\n2024-01-01,Paris,10,EUR\r\n',
      );

      fireEvent.changeText(screen.getByLabelText('FX rate EUR to USD'), '');
      expect(screen.getByLabelText('Confirm import')).toBeDisabled();

      fireEvent.press(screen.getByLabelText('Apply FX rates'));
      await waitFor(() =>
        expect(
          screen.getByText('0 of 1 rows ready to import.'),
        ).toBeOnTheScreen(),
      );
      expect(screen.getByLabelText('Confirm import')).toBeDisabled();
    });

    it('names a populated column that no field claims', async () => {
      await reachPreview(
        'Date,Account,Category,Amount,Currency\r\n' +
          '2024-01-01,CUB - online payment,Food,50,USD\r\n',
      );

      expect(screen.getByText(/are not mapped/)).toBeOnTheScreen();
      expect(
        screen.getByText(/Account — e\.g\. CUB - online payment/),
      ).toBeOnTheScreen();
    });

    it('discloses a category the import would widen', async () => {
      mockedUseExpenseData.mockReturnValue(
        makeContextValue({
          state: {
            categories: [
              {
                id: 1,
                name: 'Refund',
                type: 'income',
                createdAt: '',
                updatedAt: '',
              },
            ],
          },
          actions: { importTransactions },
        }),
      );

      await reachPreview(
        'Date,Description,Amount,Currency,Category,Type\r\n' +
          '2024-01-01,Returned item,20,USD,Refund,Expense\r\n',
      );

      expect(
        screen.getByText(/changed to work for both income and expenses/),
      ).toBeOnTheScreen();
    });

    it('merges a near-duplicate category when the suggestion is accepted', async () => {
      mockedUseExpenseData.mockReturnValue(
        makeContextValue({
          state: {
            categories: [
              {
                id: 1,
                name: 'Transport',
                type: 'both',
                createdAt: '',
                updatedAt: '',
              },
            ],
          },
          actions: { importTransactions },
        }),
      );

      await reachPreview(
        'Date,Description,Amount,Currency,Category\r\n' +
          '2024-01-01,Bus,5,USD,Transportation\r\n',
      );

      expect(
        screen.getByText('New categories: Transportation'),
      ).toBeOnTheScreen();

      fireEvent.press(
        screen.getByLabelText('Use Transport for Transportation'),
      );

      await waitFor(() =>
        expect(
          screen.queryByText('New categories: Transportation'),
        ).not.toBeOnTheScreen(),
      );

      fireEvent.press(screen.getByLabelText('Confirm import'));
      await waitFor(() => expect(importTransactions).toHaveBeenCalled());
      expect(importTransactions.mock.calls[0][2]).toEqual({
        skipDuplicates: true,
        categoryAliases: { transportation: 'Transport' },
      });
    });

    it('leaves the incoming name alone when the suggestion is declined', async () => {
      mockedUseExpenseData.mockReturnValue(
        makeContextValue({
          state: {
            categories: [
              {
                id: 1,
                name: 'Transport',
                type: 'both',
                createdAt: '',
                updatedAt: '',
              },
            ],
          },
          actions: { importTransactions },
        }),
      );

      await reachPreview(
        'Date,Description,Amount,Currency,Category\r\n' +
          '2024-01-01,Bus,5,USD,Transportation\r\n',
      );

      fireEvent.press(screen.getByLabelText('Keep Transportation separate'));

      await waitFor(() =>
        expect(
          screen.queryByLabelText('Use Transport for Transportation'),
        ).not.toBeOnTheScreen(),
      );
      expect(
        screen.getByText('New categories: Transportation'),
      ).toBeOnTheScreen();

      fireEvent.press(screen.getByLabelText('Confirm import'));
      await waitFor(() => expect(importTransactions).toHaveBeenCalled());
      expect(importTransactions.mock.calls[0][2]).toEqual({
        skipDuplicates: true,
        categoryAliases: {},
      });
    });
  });
});
