import type { CategoryRecord, TransactionRecord } from '../../database';
import {
  buildCreatePayload,
  buildUpdatePayload,
  computeBaseAmount,
  getDefaultTransactionFormValues,
  resolveCounterpartAmountSeed,
  resolveCounterpartCurrency,
  resolveFundCurrencySeed,
  validateTransactionForm,
} from '../transactionFormUtils';
import type { FundRecord } from '../../database';

describe('transactionFormUtils', () => {
  const categories: CategoryRecord[] = [
    { id: 1, name: 'Essentials', createdAt: '', updatedAt: '', type: 'both' },
    { id: 2, name: 'Travel', createdAt: '', updatedAt: '', type: 'both' },
  ];

  const makeFund = (overrides: Partial<FundRecord> = {}): FundRecord => ({
    id: 1,
    name: 'Travel',
    currencyCode: 'EUR',
    openingBalance: 0,
    notes: null,
    createdAt: '',
    updatedAt: '',
    ...overrides,
  });

  const funds: FundRecord[] = [
    makeFund({ id: 1, name: 'General', currencyCode: null }),
    makeFund({ id: 2, name: 'Travel', currencyCode: 'EUR' }),
  ];

  describe('resolveFundCurrencySeed', () => {
    const cachedRates = [
      {
        baseCurrencyCode: 'USD',
        currencyCode: 'EUR',
        fxRateToBase: 1.1,
        updatedAt: '',
      },
    ];

    it('adopts the fund currency and a rate resolved for it', () => {
      expect(
        resolveFundCurrencySeed(
          makeFund(),
          false,
          '1.000000',
          'USD',
          cachedRates,
        ),
      ).toEqual({ currencyCode: 'EUR', fxRateToBase: '1.100000' });
    });

    it('leaves the form alone once the user has chosen a currency', () => {
      expect(
        resolveFundCurrencySeed(
          makeFund(),
          true,
          '1.000000',
          'USD',
          cachedRates,
        ),
      ).toBeNull();
    });

    it('leaves the form alone for a fund that follows the base currency', () => {
      expect(
        resolveFundCurrencySeed(
          makeFund({ currencyCode: null }),
          false,
          '1.000000',
          'USD',
          cachedRates,
        ),
      ).toBeNull();
    });

    it('keeps the current rate when the pair is not cached', () => {
      expect(
        resolveFundCurrencySeed(
          makeFund({ currencyCode: 'JPY' }),
          false,
          '1.5',
          'USD',
          cachedRates,
        ),
      ).toEqual({ currencyCode: 'JPY', fxRateToBase: '1.5' });
    });

    it('seeds nothing when no fund is selected', () => {
      expect(
        resolveFundCurrencySeed(null, false, '1.5', 'USD', cachedRates),
      ).toBeNull();
    });
  });

  describe('resolveCounterpartAmountSeed', () => {
    const cachedRates = [
      {
        baseCurrencyCode: 'USD',
        currencyCode: 'EUR',
        fxRateToBase: 2,
        updatedAt: '',
      },
    ];

    it('converts the base amount into the destination currency', () => {
      expect(
        resolveCounterpartAmountSeed('100', '1', 'EUR', 'USD', cachedRates),
      ).toBe('50.00');
    });

    it('carries the rate through to the base amount first', () => {
      expect(
        resolveCounterpartAmountSeed('100', '1.5', 'EUR', 'USD', cachedRates),
      ).toBe('75.00');
    });

    it('leaves the amount as it stands when the pair is not cached', () => {
      expect(
        resolveCounterpartAmountSeed('100', '1', 'JPY', 'USD', cachedRates),
      ).toBeNull();
    });

    it('leaves the amount as it stands without a base currency', () => {
      expect(
        resolveCounterpartAmountSeed('100', '1', 'EUR', null, cachedRates),
      ).toBeNull();
    });

    it('seeds the same figure when the destination shares the base currency', () => {
      expect(
        resolveCounterpartAmountSeed('100', '1', 'USD', 'USD', cachedRates),
      ).toBe('100.00');
    });

    it('seeds nothing from an amount that is not yet a number', () => {
      expect(
        resolveCounterpartAmountSeed('', '1', 'EUR', 'USD', cachedRates),
      ).toBeNull();
    });

    it('seeds nothing from a zero amount', () => {
      expect(
        resolveCounterpartAmountSeed('0', '1', 'EUR', 'USD', cachedRates),
      ).toBeNull();
    });
  });

  describe('resolveCounterpartCurrency', () => {
    const funds = [
      makeFund({ id: 1, name: 'General', currencyCode: null }),
      makeFund({ id: 2, name: 'Travel', currencyCode: 'EUR' }),
    ];

    it('keeps the currency the form already captured', () => {
      expect(resolveCounterpartCurrency(2, 'GBP', funds, 'USD', 'MYR')).toBe(
        'GBP',
      );
    });

    it('reads the destination fund when the form carries none', () => {
      expect(resolveCounterpartCurrency(2, null, funds, 'USD', 'MYR')).toBe(
        'EUR',
      );
    });

    it('follows the base currency for a fund holding none', () => {
      expect(resolveCounterpartCurrency(1, null, funds, 'USD', 'MYR')).toBe(
        'USD',
      );
    });

    it('falls back to the currency the transfer left in', () => {
      expect(resolveCounterpartCurrency(1, null, funds, null, 'MYR')).toBe(
        'MYR',
      );
    });

    it('falls back to the source currency for an unknown fund', () => {
      expect(resolveCounterpartCurrency(99, null, funds, null, 'MYR')).toBe(
        'MYR',
      );
    });
  });

  describe('computeBaseAmount', () => {
    it('computes and rounds to 8 decimal places', () => {
      expect(computeBaseAmount('12.34', '1.23456789')).toBeCloseTo(15.23456776);
    });

    it('returns null for invalid inputs', () => {
      expect(computeBaseAmount('abc', '1.23')).toBeNull();
      expect(computeBaseAmount('10', 'rate')).toBeNull();
    });
  });

  describe('getDefaultTransactionFormValues', () => {
    it('prefills using base currency when no existing expense provided', () => {
      const values = getDefaultTransactionFormValues('USD', categories);
      expect(values.currencyCode).toBe('USD');
      expect(values.description).toBe('');
      expect(values.payee).toBe('');
    });

    it('hydrates from existing expense', () => {
      const existing: TransactionRecord = {
        type: 'expense',
        id: 42,
        description: 'Lunch',
        payee: 'Cafe Rio',
        amountNative: 10,
        currencyCode: 'USD',
        fxRateToBase: 1,
        baseAmount: 10,
        baseCurrencyCode: 'USD',
        date: '2025-01-01',
        time: null,
        categoryId: 1,
        fundId: 1,
        counterpartFundId: null,
        counterpartAmount: null,
        counterpartCurrencyCode: null,
        notes: 'Receipt #123',
        isConfirmed: true,
        createdAt: '',
        updatedAt: '',
      };
      const values = getDefaultTransactionFormValues(
        null,
        categories,
        existing,
      );
      expect(values.description).toBe('Lunch');
      expect(values.payee).toBe('Cafe Rio');
      expect(values.baseAmount).toBe('10.00');
    });
  });

  describe('amount round trip', () => {
    const existingLargeAmount: TransactionRecord = {
      type: 'expense',
      id: 99,
      description: 'Deposit',
      payee: 'Landlord',
      amountNative: 1234.56,
      currencyCode: 'USD',
      fxRateToBase: 1,
      baseAmount: 1234.56,
      baseCurrencyCode: 'USD',
      date: '2025-01-01',
      time: null,
      categoryId: 1,
      fundId: 1,
      counterpartFundId: null,
      counterpartAmount: null,
      counterpartCurrencyCode: null,
      notes: null,
      isConfirmed: true,
      createdAt: '',
      updatedAt: '',
    };

    it('hydrates four-figure amounts as parseable text', () => {
      const values = getDefaultTransactionFormValues(
        'USD',
        categories,
        existingLargeAmount,
      );

      expect(values.amountNative).toBe('1234.56');
      expect(values.baseAmount).toBe('1234.56');
      expect(Number(values.amountNative)).toBe(1234.56);
      expect(Number(values.baseAmount)).toBe(1234.56);
    });

    it('validates and rebuilds a hydrated four-figure amount unchanged', () => {
      const values = getDefaultTransactionFormValues(
        'USD',
        categories,
        existingLargeAmount,
      );
      const result = validateTransactionForm(values, funds, 'USD');

      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.amountNative).toBe(1234.56);
        expect(buildUpdatePayload(99, result.value).amountNative).toBe(1234.56);
      }
    });
  });

  describe('validateTransactionForm', () => {
    it('returns errors for invalid form', () => {
      const futureDate = new Date();
      futureDate.setDate(futureDate.getDate() + 10); // Exceeds the 3-day future limit.
      const futureDateStr = futureDate.toISOString().slice(0, 10);

      const result = validateTransactionForm(
        {
          type: 'expense',
          description: '',
          payee: '',
          amountNative: '0',
          currencyCode: 'BTC',
          fxRateToBase: '0',
          baseAmount: '',
          baseCurrencyCode: 'USD',
          date: futureDateStr,
          time: '',
          categoryId: null,
          fundId: 1,
          counterpartFundId: null,
          counterpartAmount: '',
          counterpartCurrencyCode: null,
          notes: '',
        },
        funds,
        'USD',
      );
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors.form).toBe(
          'Add a description, payee, or category.',
        );
        expect(result.errors.amountNative).toBe(
          'Amount must be greater than zero.',
        );
        expect(result.errors.currencyCode).toBe(
          'Currency code must be a valid ISO-4217 code.',
        );
        expect(result.errors.date).toBe(
          'Date cannot be more than 3 days in the future.',
        );
      }
    });

    it('passes with valid data', () => {
      const result = validateTransactionForm(
        {
          type: 'expense',
          description: 'Dinner',
          payee: 'Bistro',
          amountNative: '20.50',
          currencyCode: 'USD',
          fxRateToBase: '1.123456',
          baseAmount: '',
          baseCurrencyCode: 'USD',
          date: '2025-01-10',
          time: '',
          categoryId: 1,
          fundId: 1,
          counterpartFundId: null,
          counterpartAmount: '',
          counterpartCurrencyCode: null,
          notes: 'Friends',
        },
        funds,
        'USD',
      );
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.payee).toBe('Bistro');
        expect(result.value.baseAmount).toBeCloseTo(23.030848, 8);
      }
    });

    const validBase = {
      type: 'expense',
      amountNative: '20.50',
      currencyCode: 'USD',
      fxRateToBase: '1.123456',
      baseAmount: '',
      baseCurrencyCode: 'USD',
      date: '2025-01-10',
      time: '',
      fundId: 1,
      counterpartFundId: null,
      counterpartAmount: '',
      counterpartCurrencyCode: null,
      notes: '',
    } as const;

    it('accepts a category-only expense with blank description and payee', () => {
      const result = validateTransactionForm(
        {
          ...validBase,
          description: '',
          payee: '',
          categoryId: 1,
          fundId: 1,
          counterpartFundId: null,
          counterpartAmount: '',
          counterpartCurrencyCode: null,
        },
        funds,
        'USD',
      );
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.description).toBe('');
        expect(result.value.payee).toBe('');
      }
    });

    it('accepts a description-only expense with no payee or category', () => {
      const result = validateTransactionForm(
        {
          ...validBase,
          description: 'Lunch',
          payee: '',
          categoryId: null,
        },
        funds,
        'USD',
      );
      expect(result.ok).toBe(true);
    });

    it('accepts a payee-only expense with no description or category', () => {
      const result = validateTransactionForm(
        {
          ...validBase,
          description: '',
          payee: 'Cafe',
          categoryId: null,
        },
        funds,
        'USD',
      );
      expect(result.ok).toBe(true);
    });

    it('rejects an expense with no description, payee, or category', () => {
      const result = validateTransactionForm(
        {
          ...validBase,
          description: '   ',
          payee: '',
          categoryId: null,
        },
        funds,
        'USD',
      );
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors.form).toBe(
          'Add a description, payee, or category.',
        );
      }
    });
  });

  describe('build payload helpers', () => {
    const valid = {
      type: 'expense',
      description: 'Groceries',
      payee: 'Local Market',
      amountNative: 50,
      currencyCode: 'USD',
      fxRateToBase: 1,
      baseAmount: 50,
      baseCurrencyCode: 'USD',
      date: '2025-01-09',
      time: null,
      categoryId: 1,
      fundId: 1,
      counterpartFundId: null,
      counterpartAmount: null,
      counterpartCurrencyCode: null,
      notes: 'Farmer market',
    } as const;

    it('builds create payload', () => {
      expect(buildCreatePayload(valid)).toEqual(valid);
    });

    it('builds update payload', () => {
      expect(buildUpdatePayload(5, valid)).toEqual({ id: 5, ...valid });
    });
  });
  describe('time of day', () => {
    afterEach(() => {
      jest.useRealTimers();
    });

    it('prefills a new form with the local date and clock time', () => {
      const now = new Date(2026, 7, 8, 23, 30);
      jest.useFakeTimers().setSystemTime(now);

      const values = getDefaultTransactionFormValues('USD', categories);

      const expectedDate = `${now.getFullYear()}-${String(
        now.getMonth() + 1,
      ).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
      expect(values.date).toBe(expectedDate);
      expect(values.time).toBe('23:30');
    });

    it('keeps an existing record without a time rather than stamping now', () => {
      jest.useFakeTimers().setSystemTime(new Date(2026, 7, 8, 23, 30));
      const existing: TransactionRecord = {
        type: 'expense',
        id: 7,
        description: 'Legacy',
        payee: 'Shop',
        amountNative: 5,
        currencyCode: 'USD',
        fxRateToBase: 1,
        baseAmount: 5,
        baseCurrencyCode: 'USD',
        date: '2024-03-02',
        time: null,
        categoryId: null,
        fundId: 1,
        counterpartFundId: null,
        counterpartAmount: null,
        counterpartCurrencyCode: null,
        notes: null,
        isConfirmed: true,
        createdAt: '',
        updatedAt: '',
      };

      const values = getDefaultTransactionFormValues(
        'USD',
        categories,
        existing,
      );

      expect(values.time).toBe('');
      expect(values.date).toBe('2024-03-02');
    });

    it('hydrates a recorded time from an existing record', () => {
      const existing: TransactionRecord = {
        type: 'expense',
        id: 8,
        description: 'Lunch',
        payee: 'Cafe',
        amountNative: 5,
        currencyCode: 'USD',
        fxRateToBase: 1,
        baseAmount: 5,
        baseCurrencyCode: 'USD',
        date: '2026-08-08',
        time: '14:30',
        categoryId: null,
        fundId: 1,
        counterpartFundId: null,
        counterpartAmount: null,
        counterpartCurrencyCode: null,
        notes: null,
        isConfirmed: true,
        createdAt: '',
        updatedAt: '',
      };

      expect(
        getDefaultTransactionFormValues('USD', categories, existing).time,
      ).toBe('14:30');
    });

    const timeBase = {
      type: 'expense',
      description: 'Dinner',
      payee: 'Bistro',
      amountNative: '20.50',
      currencyCode: 'USD',
      fxRateToBase: '1.123456',
      baseAmount: '',
      baseCurrencyCode: 'USD',
      date: '2025-01-10',
      categoryId: 1,
      fundId: 1,
      counterpartFundId: null,
      counterpartAmount: '',
      counterpartCurrencyCode: null,
      notes: '',
    } as const;

    it('carries a valid time through to the payload', () => {
      const result = validateTransactionForm(
        { ...timeBase, time: '14:30' },
        funds,
        'USD',
      );
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.time).toBe('14:30');
      }
    });

    it('records a blank time as absent rather than as an error', () => {
      const result = validateTransactionForm(
        { ...timeBase, time: '   ' },
        funds,
        'USD',
      );
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(result.value.time).toBeNull();
      }
    });

    it('rejects a time that could not be read', () => {
      const result = validateTransactionForm(
        { ...timeBase, time: 'lunch' },
        funds,
        'USD',
      );
      expect(result.ok).toBe(false);
      if (!result.ok) {
        expect(result.errors.time).toBe(
          'Time must be in 24-hour format HH:MM.',
        );
      }
    });

    it('carries the time through both payload builders', () => {
      const result = validateTransactionForm(
        { ...timeBase, time: '08:15' },
        funds,
        'USD',
      );
      expect(result.ok).toBe(true);
      if (result.ok) {
        expect(buildCreatePayload(result.value).time).toBe('08:15');
        expect(buildUpdatePayload(42, result.value).time).toBe('08:15');
      }
    });
  });
});

describe('transfers', () => {
  const fund = (
    id: number,
    name: string,
    currencyCode: string | null = null,
  ): FundRecord => ({
    id,
    name,
    currencyCode,
    openingBalance: 0,
    notes: null,
    createdAt: '',
    updatedAt: '',
  });

  const funds = [fund(1, 'General'), fund(2, 'Travel', 'EUR')];

  const transferBase = {
    type: 'transfer' as const,
    description: '',
    payee: '',
    amountNative: '100',
    currencyCode: 'USD',
    fxRateToBase: '1.000000',
    baseAmount: '',
    baseCurrencyCode: 'USD',
    date: '2025-01-10',
    time: '',
    categoryId: null,
    fundId: 1,
    counterpartFundId: 2,
    counterpartAmount: '117',
    counterpartCurrencyCode: 'EUR',
    notes: '',
  };

  it('saves with no description, payee or category', () => {
    // A transfer is identified by the two funds it moves money between, so the
    // rule that every other transaction needs one of those must not apply.
    const result = validateTransactionForm(transferBase, funds, 'USD');
    expect(result.ok).toBe(true);
  });

  it('requires a destination fund', () => {
    const result = validateTransactionForm(
      {
        ...transferBase,
        counterpartFundId: null,
      },
      funds,
      'USD',
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.counterpartFundId).toBeDefined();
    }
  });

  it('refuses the same fund on both sides', () => {
    const result = validateTransactionForm(
      {
        ...transferBase,
        counterpartFundId: 1,
      },
      funds,
      'USD',
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.counterpartFundId).toContain('two different funds');
    }
  });

  it('treats a blank received amount as the amount that left within one currency', () => {
    const result = validateTransactionForm(
      {
        ...transferBase,
        counterpartCurrencyCode: 'USD',
        counterpartAmount: '',
      },
      funds,
      'USD',
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.counterpartAmount).toBe(100);
      expect(result.warnings).toEqual([]);
    }
  });

  it('refuses a blank received amount across two currencies', () => {
    const result = validateTransactionForm(
      {
        ...transferBase,
        counterpartAmount: '',
      },
      funds,
      'USD',
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.counterpartAmount).toBe(
        'Enter the amount that arrived in EUR.',
      );
    }
  });

  it('reads the destination currency from the fund when the form carries none', () => {
    const result = validateTransactionForm(
      { ...transferBase, counterpartCurrencyCode: null, counterpartAmount: '' },
      funds,
      'USD',
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.counterpartAmount).toBe(
        'Enter the amount that arrived in EUR.',
      );
    }
  });

  it('records the resolved destination currency on a transfer that carried none', () => {
    const result = validateTransactionForm(
      { ...transferBase, counterpartCurrencyCode: null },
      funds,
      'USD',
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.counterpartCurrencyCode).toBe('EUR');
    }
  });

  it('follows the base currency for a destination fund holding none', () => {
    const fundsFollowingBase = [fund(1, 'General'), fund(2, 'Pocket')];
    const result = validateTransactionForm(
      { ...transferBase, counterpartCurrencyCode: null, counterpartAmount: '' },
      fundsFollowingBase,
      'USD',
    );
    // The fund follows USD, which is what the transfer left in, so a blank
    // field still means the same magnitude arrived.
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.counterpartAmount).toBe(100);
      expect(result.value.counterpartCurrencyCode).toBe('USD');
    }
  });

  it('labels a transfer from its own currency when nothing else names one', () => {
    const fundsFollowingBase = [fund(1, 'General'), fund(2, 'Pocket')];
    const result = validateTransactionForm(
      { ...transferBase, counterpartCurrencyCode: null, counterpartAmount: '' },
      fundsFollowingBase,
      null,
    );

    // Neither the fund nor a base currency names one, and the schema refuses a
    // transfer that carries no received currency.
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.counterpartCurrencyCode).toBe('USD');
      expect(result.value.counterpartAmount).toBe(100);
    }
  });

  it('queries a cross-currency transfer that implies a rate of one', () => {
    const result = validateTransactionForm(
      {
        ...transferBase,
        counterpartAmount: '100',
      },
      funds,
      'USD',
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.warnings).toEqual([
        {
          field: 'counterpartAmount',
          code: 'suspect-transfer-rate',
          message: '100.00 USD and 100.00 EUR imply a rate of 1.',
        },
      ]);
    }
  });

  it('leaves a converted transfer unqueried', () => {
    const result = validateTransactionForm(transferBase, funds, 'USD');
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.warnings).toEqual([]);
    }
  });

  it('drops any category a transfer was carrying', () => {
    const result = validateTransactionForm(
      {
        ...transferBase,
        categoryId: 7,
      },
      funds,
      'USD',
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.categoryId).toBeNull();
    }
  });

  it('requires a fund on every transaction', () => {
    const result = validateTransactionForm(
      {
        ...transferBase,
        type: 'expense',
        description: 'Coffee',
        counterpartFundId: null,
        counterpartAmount: '',
        fundId: null,
      },
      funds,
      'USD',
    );
    expect(result.ok).toBe(false);
    if (!result.ok) {
      expect(result.errors.fundId).toBeDefined();
    }
  });

  it('leaves counterpart fields off a non-transfer', () => {
    const result = validateTransactionForm(
      {
        ...transferBase,
        type: 'expense',
        description: 'Coffee',
      },
      funds,
      'USD',
    );
    expect(result.ok).toBe(true);
    if (result.ok) {
      expect(result.value.counterpartFundId).toBeNull();
      expect(result.value.counterpartAmount).toBeNull();
      expect(result.value.counterpartCurrencyCode).toBeNull();
    }
  });
});
