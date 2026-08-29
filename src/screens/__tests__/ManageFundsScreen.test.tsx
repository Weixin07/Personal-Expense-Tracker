import React from 'react';
import { Alert } from 'react-native';
import ManageFundsScreen from '../ManageFundsScreen';
import { useTransactionData } from '../../context/AppContext';
import {
  renderWithProviders,
  makeContextValue,
  makeFund,
  screen,
  fireEvent,
  waitFor,
} from '../../__tests__/test-utils/renderWithProviders';
import type { TransactionRecord } from '../../database';

jest.mock('../../context/AppContext', () => ({
  useTransactionData: jest.fn(),
}));

const mockedUseTransactionData = useTransactionData as jest.MockedFunction<
  typeof useTransactionData
>;

const transaction = (
  overrides: Partial<TransactionRecord> = {},
): TransactionRecord => ({
  id: 1,
  type: 'expense',
  description: 'Coffee',
  payee: 'Cafe',
  amountNative: 3.5,
  currencyCode: 'USD',
  fxRateToBase: 1,
  baseAmount: 3.5,
  baseCurrencyCode: 'USD',
  date: '2025-01-10',
  time: null,
  categoryId: null,
  fundId: 1,
  counterpartFundId: null,
  counterpartAmount: null,
  counterpartCurrencyCode: null,
  notes: null,
  createdAt: '2025-01-10T00:00:00.000Z',
  updatedAt: '2025-01-10T00:00:00.000Z',
  ...overrides,
});

const renderScreen = (
  overrides: Parameters<typeof makeContextValue>[0] = {},
) => {
  const value = makeContextValue(overrides);
  mockedUseTransactionData.mockReturnValue(value);
  renderWithProviders(<ManageFundsScreen />);
  return value;
};

describe('ManageFundsScreen', () => {
  beforeEach(() => {
    jest.clearAllMocks();
    jest.spyOn(Alert, 'alert').mockImplementation(() => undefined);
  });

  it('creates a fund from the dialog', async () => {
    const value = renderScreen();

    fireEvent.press(screen.getByLabelText('Add fund'));
    fireEvent.changeText(screen.getByLabelText('Fund name'), 'Travel');
    fireEvent.changeText(screen.getByLabelText('Fund opening balance'), '250');
    fireEvent.press(screen.getByLabelText('Create fund'));

    await waitFor(() =>
      expect(value.actions.createFund).toHaveBeenCalledWith({
        name: 'Travel',
        currencyCode: null,
        openingBalance: 250,
        notes: null,
      }),
    );
  });

  it('rejects a duplicate name before reaching the database', async () => {
    const value = renderScreen({
      state: { funds: [makeFund({ id: 1, name: 'Travel' })] },
    });

    fireEvent.press(screen.getByLabelText('Add fund'));
    fireEvent.changeText(screen.getByLabelText('Fund name'), 'travel');
    fireEvent.press(screen.getByLabelText('Create fund'));

    await waitFor(() =>
      expect(screen.getByText('Fund name must be unique.')).toBeOnTheScreen(),
    );
    expect(value.actions.createFund).not.toHaveBeenCalled();
  });

  it('refuses a negative opening balance but accepts zero', async () => {
    const value = renderScreen();

    fireEvent.press(screen.getByLabelText('Add fund'));
    fireEvent.changeText(screen.getByLabelText('Fund name'), 'Travel');
    fireEvent.changeText(screen.getByLabelText('Fund opening balance'), '-5');
    fireEvent.press(screen.getByLabelText('Create fund'));

    await waitFor(() =>
      expect(
        screen.getByText('Opening balance cannot be negative.'),
      ).toBeOnTheScreen(),
    );
    expect(value.actions.createFund).not.toHaveBeenCalled();
  });

  it('blocks deleting a fund that still holds transactions', () => {
    const value = renderScreen({
      state: {
        funds: [makeFund({ id: 1 }), makeFund({ id: 2, name: 'Travel' })],
        transactions: [transaction({ fundId: 2 })],
      },
    });

    fireEvent.press(screen.getByLabelText('Delete Travel'));

    expect(Alert.alert).toHaveBeenCalledWith(
      'Cannot delete fund',
      expect.stringContaining('1 transaction'),
    );
    expect(value.actions.deleteFund).not.toHaveBeenCalled();
  });

  it('counts the receiving side of a transfer as use of that fund', () => {
    renderScreen({
      state: {
        funds: [makeFund({ id: 1 }), makeFund({ id: 2, name: 'Travel' })],
        transactions: [
          transaction({ type: 'transfer', fundId: 1, counterpartFundId: 2 }),
        ],
      },
    });

    fireEvent.press(screen.getByLabelText('Delete Travel'));

    expect(Alert.alert).toHaveBeenCalledWith(
      'Cannot delete fund',
      expect.stringContaining('1 transaction'),
    );
  });

  it('offers no delete control at all for the fallback fund', () => {
    renderScreen({
      state: {
        funds: [
          makeFund({ id: 1, name: 'General' }),
          makeFund({ id: 2, name: 'Travel' }),
        ],
      },
    });

    expect(screen.queryByLabelText('Delete General')).toBeNull();
    expect(screen.getByLabelText('Delete Travel')).toBeOnTheScreen();
  });

  it('confirms before restating history with a new opening balance', async () => {
    const value = renderScreen({
      state: {
        funds: [makeFund({ id: 1, name: 'Travel', openingBalance: 0 })],
      },
    });

    fireEvent.press(screen.getByLabelText('Edit Travel'));
    fireEvent.changeText(screen.getByLabelText('Fund opening balance'), '99');
    fireEvent.press(screen.getByLabelText('Save fund'));

    await waitFor(() => expect(Alert.alert).toHaveBeenCalled());
    expect((Alert.alert as jest.Mock).mock.calls[0][1]).toContain(
      'opening balance',
    );
    expect(value.actions.updateFund).not.toHaveBeenCalled();
  });

  const openCurrencyPicker = () => {
    fireEvent.press(screen.getByLabelText('Select fund currency'));
    fireEvent.changeText(screen.getByLabelText('Search currency'), 'EUR');
    fireEvent.press(screen.getByText('EUR'));
  };

  it('confirms before regrouping a balance under a new currency', async () => {
    const value = renderScreen({
      state: {
        funds: [makeFund({ id: 1, name: 'Travel', currencyCode: 'USD' })],
      },
    });

    fireEvent.press(screen.getByLabelText('Edit Travel'));
    openCurrencyPicker();
    fireEvent.press(screen.getByLabelText('Save fund'));

    await waitFor(() => expect(Alert.alert).toHaveBeenCalled());
    expect((Alert.alert as jest.Mock).mock.calls[0][1]).toContain(
      'Changing the currency restates this fund’s whole balance in the new' +
        ' one, at the latest exchange rate you have saved. Where no saved rate' +
        ' covers it, the fund reports its figures unconverted instead.',
    );
    expect(value.actions.updateFund).not.toHaveBeenCalled();
  });

  it('persists the new currency once the confirmation is accepted', async () => {
    const value = renderScreen({
      state: {
        funds: [makeFund({ id: 1, name: 'Travel', currencyCode: 'USD' })],
      },
    });

    fireEvent.press(screen.getByLabelText('Edit Travel'));
    openCurrencyPicker();
    fireEvent.press(screen.getByLabelText('Save fund'));

    await waitFor(() => expect(Alert.alert).toHaveBeenCalled());
    const buttons = (Alert.alert as jest.Mock).mock.calls[0][2];
    buttons
      .find((button: { text: string }) => button.text === 'Save')
      .onPress();

    await waitFor(() =>
      expect(value.actions.updateFund).toHaveBeenCalledWith(
        expect.objectContaining({ id: 1, currencyCode: 'EUR' }),
      ),
    );
  });

  it('leaves the fund alone when the confirmation is dismissed', async () => {
    const value = renderScreen({
      state: {
        funds: [makeFund({ id: 1, name: 'Travel', currencyCode: 'USD' })],
      },
    });

    fireEvent.press(screen.getByLabelText('Edit Travel'));
    openCurrencyPicker();
    fireEvent.press(screen.getByLabelText('Save fund'));

    await waitFor(() => expect(Alert.alert).toHaveBeenCalled());
    const buttons = (Alert.alert as jest.Mock).mock.calls[0][2];
    buttons
      .find((button: { text: string }) => button.text === 'Cancel')
      ?.onPress?.();

    expect(value.actions.updateFund).not.toHaveBeenCalled();
  });

  it('removes a fund that holds nothing once the deletion is confirmed', async () => {
    const value = renderScreen({
      state: {
        funds: [
          makeFund({ id: 1, name: 'General' }),
          makeFund({ id: 2, name: 'Travel' }),
        ],
        transactions: [],
      },
    });

    fireEvent.press(screen.getByLabelText('Delete Travel'));

    expect(Alert.alert).toHaveBeenCalled();
    const buttons = (Alert.alert as jest.Mock).mock.calls[0][2];
    await buttons
      .find((button: { text: string }) => button.text === 'Delete')
      .onPress();

    expect(value.actions.deleteFund).toHaveBeenCalledWith(2);
  });

  it('refuses an empty name before reaching the database', () => {
    const value = renderScreen({
      state: { funds: [makeFund({ id: 1, name: 'Travel' })] },
    });

    fireEvent.press(screen.getByLabelText('Edit Travel'));
    fireEvent.changeText(screen.getByLabelText('Fund name'), '   ');
    fireEvent.press(screen.getByLabelText('Save fund'));

    expect(screen.getByText('Fund name is required.')).toBeOnTheScreen();
    expect(value.actions.updateFund).not.toHaveBeenCalled();
  });

  it('surfaces a rejected save and re-enables the control', async () => {
    const updateFund = jest.fn().mockRejectedValue(new Error('name taken'));
    renderScreen({
      state: { funds: [makeFund({ id: 1, name: 'Travel' })] },
      actions: { updateFund },
    });

    fireEvent.press(screen.getByLabelText('Edit Travel'));
    fireEvent.changeText(screen.getByLabelText('Fund name'), 'Trips');
    fireEvent.press(screen.getByLabelText('Save fund'));

    await waitFor(() =>
      expect(screen.getByText('name taken')).toBeOnTheScreen(),
    );
    expect(screen.getByLabelText('Save fund')).toBeEnabled();
  });

  it('clears the dialog when it is cancelled', () => {
    renderScreen({
      state: { funds: [makeFund({ id: 1, name: 'Travel' })] },
    });

    fireEvent.press(screen.getByLabelText('Edit Travel'));
    fireEvent.changeText(screen.getByLabelText('Fund name'), 'Scratch');
    fireEvent.press(screen.getByLabelText('Cancel fund dialog'));

    fireEvent.press(screen.getByLabelText('Add fund'));

    expect(screen.queryByDisplayValue('Scratch')).toBeNull();
  });

  it('labels a fund that follows the base currency, which its figure cannot name', () => {
    renderScreen({
      state: { funds: [makeFund({ id: 1, name: 'Travel' })] },
      selectors: {
        fundBalances: [
          {
            fundId: 1,
            basis: 'converted',
            byCurrency: [{ currencyCode: 'USD', balance: 250.5 }],
          },
        ],
      },
    });

    expect(
      screen.getByText('Follows base currency · +250.50 USD'),
    ).toBeOnTheScreen();
  });

  it('leaves a fund with its own currency to be named by its figure alone', () => {
    renderScreen({
      state: {
        funds: [makeFund({ id: 1, name: 'Travel', currencyCode: 'EUR' })],
      },
      selectors: {
        fundBalances: [
          {
            fundId: 1,
            basis: 'converted',
            byCurrency: [{ currencyCode: 'EUR', balance: 460 }],
          },
        ],
      },
    });

    expect(screen.getByText('+460.00 EUR')).toBeOnTheScreen();
  });

  it('marks an unconverted fund here too', () => {
    renderScreen({
      state: {
        funds: [makeFund({ id: 1, name: 'Travel', currencyCode: 'EUR' })],
      },
      selectors: {
        fundBalances: [
          {
            fundId: 1,
            basis: 'unconverted',
            byCurrency: [
              { currencyCode: 'EUR', balance: 0 },
              { currencyCode: 'USD', balance: -32.4 },
            ],
          },
        ],
      },
    });

    expect(
      screen.getByText('0.00 EUR · -32.40 USD  ⚠ unconverted'),
    ).toBeOnTheScreen();
  });

  it('saves an unchanged fund without asking', async () => {
    const value = renderScreen({
      state: { funds: [makeFund({ id: 1, name: 'Travel' })] },
    });

    fireEvent.press(screen.getByLabelText('Edit Travel'));
    fireEvent.changeText(screen.getByLabelText('Fund name'), 'Trips');
    fireEvent.press(screen.getByLabelText('Save fund'));

    await waitFor(() => expect(value.actions.updateFund).toHaveBeenCalled());
    expect(Alert.alert).not.toHaveBeenCalled();
  });
});
