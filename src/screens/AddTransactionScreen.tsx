import React, { useEffect, useMemo, useState } from 'react';
import {
  Alert,
  KeyboardAvoidingView,
  Platform,
  ScrollView,
  StyleSheet,
  View,
} from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  ActivityIndicator,
  Button,
  HelperText,
  SegmentedButtons,
  Text,
  TextInput,
} from 'react-native-paper';
import CategoryPickerDialog from '../components/CategoryPickerDialog';
import CurrencyPickerDialog from '../components/CurrencyPickerDialog';
import FundPickerDialog from '../components/FundPickerDialog';
import SelectField from '../components/SelectField';
import SuggestionList from '../components/SuggestionList';
import { findCurrencyName } from '../constants/currencyOptions';
import { useTransactionData } from '../context/AppContext';
import type { RootStackParamList } from '../navigation/AppNavigator';
import {
  buildCreatePayload,
  buildUpdatePayload,
  computeBaseAmount,
  getDefaultTransactionFormValues,
  resolveCounterpartAmountSeed,
  resolveCounterpartCurrency,
  resolveFundCurrencySeed,
  resolveFxRateForCurrency,
  validateTransactionForm,
  type TransactionFormErrors,
  type TransactionFormValues,
} from './transactionFormUtils';
import type { TransactionDirection, TransactionType } from '../database';
import {
  formatDateBritish,
  parseBritishDateInput,
  parseTimeInput,
} from '../utils/date';
import {
  formatDirectionalMoney,
  formatFxRate,
  formatMoneyAmount,
} from '../utils/formatting';
import { impliedTransferRate } from '../utils/fxRates';
import {
  SUGGESTION_WINDOW_MONTHS,
  TRANSFER_SUGGESTION_WINDOW_MONTHS,
  buildSuggestionIndex,
  filterSuggestions,
  rankFundIdsByFrequency,
} from '../utils/suggestions';
import type { SuggestionField } from '../utils/suggestions';

const TYPE_OPTIONS = [
  { value: 'expense', label: 'Expense' },
  { value: 'income', label: 'Income' },
  { value: 'transfer', label: 'Transfer' },
];

const currencyDialogDescription =
  'Choose the currency for this transaction. This should match the currency on your receipt.';

type Props = NativeStackScreenProps<RootStackParamList, 'AddTransaction'>;

const AddTransactionScreen: React.FC<Props> = ({ route, navigation }) => {
  const transactionId = route.params?.transactionId ?? null;

  const {
    state: {
      categories,
      funds,
      transactions,
      settings,
      fxRateCache,
      isInitialised,
      isLoading,
      error,
    },
    actions: { createTransaction, updateTransaction, deleteTransaction },
    selectors: { categoryUsageCounts },
  } = useTransactionData();

  const existingTransaction = useMemo(
    () => transactions.find(item => item.id === transactionId) ?? null,
    [transactions, transactionId],
  );

  const initialFormValues = useMemo(
    () =>
      getDefaultTransactionFormValues(
        settings.baseCurrency,
        categories,
        existingTransaction ?? undefined,
        fxRateCache,
        funds,
      ),
    [
      settings.baseCurrency,
      categories,
      existingTransaction,
      fxRateCache,
      funds,
    ],
  );

  const [values, setValues] =
    useState<TransactionFormValues>(initialFormValues);
  const [dateInput, setDateInput] = useState<string>(
    formatDateBritish(initialFormValues.date),
  );
  const [timeInput, setTimeInput] = useState<string>(initialFormValues.time);
  const [errors, setErrors] = useState<TransactionFormErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [currencyDialogVisible, setCurrencyDialogVisible] = useState(false);
  const [categoryDialogVisible, setCategoryDialogVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);
  const [activeSuggestionField, setActiveSuggestionField] =
    useState<SuggestionField | null>(null);
  const [fundDialogVisible, setFundDialogVisible] = useState(false);
  const [counterpartDialogVisible, setCounterpartDialogVisible] =
    useState(false);
  /**
   * Whether the currency is the user's own choice rather than a derived
   * default. A stored transaction's currency is a recorded fact about a past
   * event, so editing one starts out true: choosing a different fund must never
   * restate what a transaction was denominated in when it happened.
   */
  const [currencyTouched, setCurrencyTouched] = useState(
    existingTransaction != null,
  );
  /**
   * Whether the received amount is the user's own figure. Starts true on a
   * stored transfer for the same reason `currencyTouched` does: what arrived is
   * a recorded fact, and editing the source side must not restate it. Choosing
   * another destination fund is the deliberate exception — see
   * `handleCounterpartSelect`.
   */
  const [counterpartAmountTouched, setCounterpartAmountTouched] = useState(
    existingTransaction != null,
  );

  const isTransfer = values.type === 'transfer';
  /**
   * Direction to read category data with. A transfer has no direction of its
   * own, so it borrows `expense` purely to keep the lookup total; the category
   * picker is not mounted while it is selected.
   */
  const categoryDirection: TransactionDirection = isTransfer
    ? 'expense'
    : (values.type as TransactionDirection);

  const suggestionWindowMonths = isTransfer
    ? TRANSFER_SUGGESTION_WINDOW_MONTHS
    : SUGGESTION_WINDOW_MONTHS;

  const fundUsageCounts = useMemo(
    () =>
      rankFundIdsByFrequency(transactions, {
        type: values.type,
        windowMonths: suggestionWindowMonths,
      }),
    [transactions, values.type, suggestionWindowMonths],
  );

  const selectedFund = useMemo(
    () => funds.find(fund => fund.id === values.fundId) ?? null,
    [funds, values.fundId],
  );

  const counterpartFund = useMemo(
    () => funds.find(fund => fund.id === values.counterpartFundId) ?? null,
    [funds, values.counterpartFundId],
  );

  // What the row records, not what the fund holds now: a fund re-denominated
  // after the fact must not relabel a transfer already stored against it.
  const counterpartCurrency = useMemo(
    () =>
      resolveCounterpartCurrency(
        values.counterpartFundId,
        values.counterpartCurrencyCode,
        funds,
        settings.baseCurrency,
        values.currencyCode,
      ),
    [
      funds,
      settings.baseCurrency,
      values.counterpartCurrencyCode,
      values.counterpartFundId,
      values.currencyCode,
    ],
  );

  const impliedRateLabel = useMemo(() => {
    if (
      !counterpartCurrency ||
      counterpartCurrency.toUpperCase() ===
        values.currencyCode.trim().toUpperCase()
    ) {
      return '';
    }
    const rate = impliedTransferRate(
      Number(values.amountNative),
      Number(values.counterpartAmount),
    );
    if (rate == null || !values.counterpartAmount.trim()) {
      return '';
    }
    return `1 ${values.currencyCode.trim().toUpperCase()} = ${formatFxRate(rate)} ${counterpartCurrency}`;
  }, [
    counterpartCurrency,
    values.amountNative,
    values.counterpartAmount,
    values.currencyCode,
  ]);

  useEffect(() => {
    setValues(initialFormValues);
    setDateInput(formatDateBritish(initialFormValues.date));
    setTimeInput(initialFormValues.time);
    setErrors({});
    setFormError(null);
    setActiveSuggestionField(null);
  }, [initialFormValues]);

  useEffect(() => {
    if (error) {
      setFormError(error);
    }
  }, [error]);

  // What arrived follows what left while the user has not said otherwise, and
  // only across a currency boundary: within one currency a blank field already
  // means the same magnitude arrived.
  useEffect(() => {
    if (
      !isTransfer ||
      counterpartAmountTouched ||
      values.counterpartFundId == null ||
      !values.counterpartCurrencyCode ||
      values.counterpartCurrencyCode.toUpperCase() ===
        values.currencyCode.trim().toUpperCase()
    ) {
      return;
    }
    const seed = resolveCounterpartAmountSeed(
      values.amountNative,
      values.fxRateToBase,
      values.counterpartCurrencyCode,
      settings.baseCurrency,
      fxRateCache,
    );
    if (seed == null) {
      return;
    }
    setValues(prev =>
      prev.counterpartAmount === seed
        ? prev
        : { ...prev, counterpartAmount: seed },
    );
  }, [
    isTransfer,
    counterpartAmountTouched,
    values.amountNative,
    values.fxRateToBase,
    values.currencyCode,
    values.counterpartCurrencyCode,
    values.counterpartFundId,
    settings.baseCurrency,
    fxRateCache,
  ]);

  const computedBaseAmount = useMemo(() => {
    const amount = computeBaseAmount(values.amountNative, values.fxRateToBase);
    return amount != null ? formatMoneyAmount(amount) : '';
  }, [values.amountNative, values.fxRateToBase]);

  const baseAmountPreview = useMemo(() => {
    const amount = computeBaseAmount(values.amountNative, values.fxRateToBase);
    if (amount == null) {
      return '';
    }
    return formatDirectionalMoney(
      amount,
      values.type === 'income' ? 'received' : 'spent',
      settings.baseCurrency,
    );
  }, [
    settings.baseCurrency,
    values.amountNative,
    values.fxRateToBase,
    values.type,
  ]);

  // A field's own value must not reach the index memos: it would re-sort the
  // entire history on every keystroke. Only the filter memos may depend on
  // what has been typed.
  const suggestionOptions = useMemo(
    () => ({
      type: values.type,
      windowMonths: suggestionWindowMonths,
      excludeTransactionId: transactionId ?? undefined,
    }),
    [values.type, suggestionWindowMonths, transactionId],
  );

  const descriptionIndex = useMemo(
    () => buildSuggestionIndex(transactions, 'description', suggestionOptions),
    [transactions, suggestionOptions],
  );

  const payeeIndex = useMemo(
    () => buildSuggestionIndex(transactions, 'payee', suggestionOptions),
    [transactions, suggestionOptions],
  );

  const descriptionSuggestions = useMemo(
    () =>
      activeSuggestionField === 'description'
        ? filterSuggestions(descriptionIndex, values.description)
        : [],
    [activeSuggestionField, descriptionIndex, values.description],
  );

  const payeeSuggestions = useMemo(
    () =>
      activeSuggestionField === 'payee'
        ? filterSuggestions(payeeIndex, values.payee)
        : [],
    [activeSuggestionField, payeeIndex, values.payee],
  );

  const handleSuggestionSelect =
    (field: SuggestionField) => (value: string) => {
      setValues(prev => ({ ...prev, [field]: value }));
      setActiveSuggestionField(null);
    };

  const handleSuggestionBlur = (field: SuggestionField) => () => {
    setActiveSuggestionField(current => (current === field ? null : current));
  };

  const handleChange =
    (field: keyof TransactionFormValues) => (text: string) => {
      setValues(prev => ({ ...prev, [field]: text }));
      const errorField = field as keyof TransactionFormErrors;
      if (errors[errorField]) {
        setErrors(prev => ({ ...prev, [errorField]: undefined }));
      }
    };

  const handleDateChange = (text: string) => {
    setDateInput(text);
    const iso = parseBritishDateInput(text);
    setValues(prev => ({ ...prev, date: iso ?? '' }));
    if (errors.date) {
      setErrors(prev => ({ ...prev, date: undefined }));
    }
  };

  const handleTimeChange = (text: string) => {
    setTimeInput(text);
    // An unreadable entry keeps its raw text so submit-time validation reports
    // it. Blanking it would be indistinguishable from clearing the field, which
    // is a valid way to say the time is not known.
    const parsed = parseTimeInput(text);
    setValues(prev => ({ ...prev, time: parsed ?? text }));
    if (errors.time) {
      setErrors(prev => ({ ...prev, time: undefined }));
    }
  };

  const handleCounterpartAmountChange = (text: string) => {
    setCounterpartAmountTouched(true);
    handleChange('counterpartAmount')(text);
  };

  const handleCategorySelect = (categoryId: number | null) => {
    setValues(prev => ({ ...prev, categoryId }));
  };

  const handleFundSelect = (fundId: number) => {
    const fund = funds.find(item => item.id === fundId) ?? null;
    setValues(prev => ({
      ...prev,
      fundId,
      ...(resolveFundCurrencySeed(
        fund,
        currencyTouched,
        prev.fxRateToBase,
        settings.baseCurrency,
        fxRateCache,
      ) ?? {}),
    }));
  };

  // The destination's currency is captured with the choice so the stored row
  // records what the received amount was denominated in, not what the fund is
  // denominated in whenever it is next read.
  //
  // The amount moves with it, and does so even for a stored transfer, which is
  // the one case `counterpartAmountTouched` does not gate: choosing another
  // destination restates what the transfer is, and a figure left behind under a
  // currency it was never denominated in contradicts its own row.
  const handleCounterpartSelect = (fundId: number) => {
    const fund = funds.find(item => item.id === fundId) ?? null;
    const currency = fund?.currencyCode ?? settings.baseCurrency;
    setValues(prev => {
      const next = {
        ...prev,
        counterpartFundId: fundId,
        counterpartCurrencyCode: currency,
      };
      // An amount keeps its meaning while its currency does, so a destination
      // denominated the same way leaves what was already recorded alone.
      if (
        (prev.counterpartCurrencyCode ?? '').toUpperCase() ===
        (currency ?? '').toUpperCase()
      ) {
        return next;
      }
      return {
        ...next,
        counterpartAmount:
          resolveCounterpartAmountSeed(
            prev.amountNative,
            prev.fxRateToBase,
            currency,
            settings.baseCurrency,
            fxRateCache,
          ) ?? '',
      };
    });
    if (errors.counterpartAmount) {
      setErrors(prev => ({ ...prev, counterpartAmount: undefined }));
    }
  };

  const applyType = (nextType: TransactionType, clearCategory: boolean) => {
    setValues(prev => ({
      ...prev,
      type: nextType,
      categoryId: clearCategory ? null : prev.categoryId,
    }));
  };

  const handleTypeChange = (value: string) => {
    const nextType = value as TransactionType;
    if (nextType === values.type) {
      return;
    }

    // A transfer files under no category at all, so switching into it always
    // clears one rather than testing whether it still fits.
    if (nextType === 'transfer') {
      setValues(prev => ({ ...prev, type: nextType, categoryId: null }));
      return;
    }

    if (values.type === 'transfer') {
      setValues(prev => ({
        ...prev,
        type: nextType,
        counterpartFundId: null,
        counterpartAmount: '',
        counterpartCurrencyCode: null,
      }));
      setCounterpartAmountTouched(existingTransaction != null);
      return;
    }

    const selected = categories.find(
      category => category.id === values.categoryId,
    );
    const stillValid =
      !selected || selected.type === nextType || selected.type === 'both';
    if (stillValid) {
      applyType(nextType, false);
      return;
    }

    // A category chosen when the record was created is worth confirming before
    // discarding; one the form defaulted to on a new entry is not.
    if (!existingTransaction) {
      applyType(nextType, true);
      return;
    }

    Alert.alert(
      'Change type?',
      `"${selected.name}" cannot be used for ${nextType}. Changing the type will clear the category.`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Change',
          onPress: () => applyType(nextType, true),
        },
      ],
    );
  };

  const handleCurrencySelect = (option: { code: string }) => {
    const resolvedRate = resolveFxRateForCurrency(
      option.code,
      settings.baseCurrency,
      fxRateCache,
    );
    setValues(prev => ({
      ...prev,
      currencyCode: option.code,
      fxRateToBase: resolvedRate !== '' ? resolvedRate : prev.fxRateToBase,
    }));
    setCurrencyTouched(true);
    setCurrencyDialogVisible(false);
    if (errors.currencyCode) {
      setErrors(prev => ({ ...prev, currencyCode: undefined }));
    }
  };

  const handleSubmit = async () => {
    setFormError(null);
    const validation = validateTransactionForm(
      {
        ...values,
        baseAmount: computedBaseAmount,
      },
      funds,
      settings.baseCurrency,
    );

    if (!validation.ok) {
      setErrors(validation.errors);
      if (validation.errors.form) {
        setFormError(validation.errors.form);
      }
      return;
    }

    const { value, warnings } = validation;
    const persist = async () => {
      setSubmitting(true);
      try {
        if (existingTransaction) {
          await updateTransaction(
            buildUpdatePayload(existingTransaction.id, value),
          );
        } else {
          await createTransaction(buildCreatePayload(value));
        }
        navigation.goBack();
      } catch (err) {
        setFormError(
          err instanceof Error ? err.message : 'Failed to save transaction.',
        );
      } finally {
        setSubmitting(false);
      }
    };

    if (warnings.length > 0) {
      Alert.alert(
        'Check the amount received',
        `${warnings.map(warning => warning.message).join('\n\n')}\n\nSave anyway?`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Save anyway', onPress: () => void persist() },
        ],
      );
      return;
    }

    await persist();
  };

  const handleDelete = () => {
    if (!existingTransaction || deleting) {
      return;
    }

    Alert.alert(
      'Delete transaction',
      'Are you sure you want to delete this transaction?',
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            setDeleting(true);
            try {
              await deleteTransaction(existingTransaction.id);
              navigation.goBack();
            } catch (deleteErr) {
              Alert.alert(
                'Delete failed',
                deleteErr instanceof Error
                  ? deleteErr.message
                  : 'Unable to delete transaction.',
              );
            } finally {
              setDeleting(false);
            }
          },
        },
      ],
    );
  };

  const selectedCategory =
    categories.find(category => category.id === values.categoryId) ?? null;
  const currencyName = findCurrencyName(values.currencyCode);

  if (transactionId && isInitialised && !existingTransaction) {
    return (
      <View style={styles.centered}>
        <Text variant="titleLarge">Transaction not found</Text>
        <Button
          mode="contained"
          onPress={() => navigation.goBack()}
          style={styles.retryButton}
        >
          Go back
        </Button>
      </View>
    );
  }

  if (!isInitialised) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator animating size="large" />
      </View>
    );
  }

  const disableSubmit = submitting || isLoading || deleting;

  return (
    <KeyboardAvoidingView
      style={styles.flex}
      behavior={Platform.OS === 'ios' ? 'padding' : undefined}
      keyboardVerticalOffset={Platform.OS === 'ios' ? 88 : 0}
    >
      <ScrollView
        contentContainerStyle={styles.scrollContainer}
        testID="transaction-form-scroll"
        // Suggestion rows are tapped while the field above them still holds
        // focus. Without persisted taps the scroll view dismisses the keyboard
        // on touch, which blurs that field and unmounts the list before the
        // row's press resolves.
        keyboardShouldPersistTaps="handled"
      >
        <View style={styles.formGroup}>
          <SegmentedButtons
            value={values.type}
            onValueChange={handleTypeChange}
            buttons={TYPE_OPTIONS}
          />

          <TextInput
            label="Description"
            value={values.description}
            onChangeText={handleChange('description')}
            mode="outlined"
            accessibilityLabel="Transaction description"
            autoCapitalize="sentences"
            onFocus={() => setActiveSuggestionField('description')}
            onBlur={handleSuggestionBlur('description')}
          />
          <SuggestionList
            values={descriptionSuggestions}
            visible={activeSuggestionField === 'description'}
            onSelect={handleSuggestionSelect('description')}
            accessibilityLabel="Description suggestions"
            testID="description-suggestions"
          />

          <TextInput
            label="Payee"
            value={values.payee}
            onChangeText={handleChange('payee')}
            mode="outlined"
            accessibilityLabel="Transaction payee"
            autoCapitalize="words"
            onFocus={() => setActiveSuggestionField('payee')}
            onBlur={handleSuggestionBlur('payee')}
          />
          <SuggestionList
            values={payeeSuggestions}
            visible={activeSuggestionField === 'payee'}
            onSelect={handleSuggestionSelect('payee')}
            accessibilityLabel="Payee suggestions"
            testID="payee-suggestions"
          />

          <TextInput
            label="Amount (native)"
            value={values.amountNative}
            onChangeText={handleChange('amountNative')}
            mode="outlined"
            keyboardType="decimal-pad"
            accessibilityLabel="Amount in native currency"
            error={Boolean(errors.amountNative)}
          />
          <HelperText type="error" visible={Boolean(errors.amountNative)}>
            {errors.amountNative}
          </HelperText>

          <SelectField
            label="Currency"
            value={values.currencyCode}
            onPress={() => setCurrencyDialogVisible(true)}
            accessibilityLabel={
              currencyName
                ? `${values.currencyCode} ${currencyName}`
                : 'Select currency'
            }
            accessibilityHint="Opens the currency picker"
            error={Boolean(errors.currencyCode)}
          />
          <HelperText type="error" visible={Boolean(errors.currencyCode)}>
            {errors.currencyCode}
          </HelperText>

          <TextInput
            label={
              values.currencyCode && settings.baseCurrency
                ? `FX rate (1 ${values.currencyCode} = ? ${settings.baseCurrency})`
                : 'FX rate to base'
            }
            value={values.fxRateToBase}
            onChangeText={handleChange('fxRateToBase')}
            mode="outlined"
            keyboardType="decimal-pad"
            accessibilityLabel="FX rate to base currency"
            error={Boolean(errors.fxRateToBase)}
          />
          <HelperText type="error" visible={Boolean(errors.fxRateToBase)}>
            {errors.fxRateToBase}
          </HelperText>

          <TextInput
            label="Base amount"
            value={baseAmountPreview}
            mode="outlined"
            editable={false}
            accessibilityLabel="Computed base amount"
            error={Boolean(errors.baseAmount)}
          />
          <HelperText type="error" visible={Boolean(errors.baseAmount)}>
            {errors.baseAmount}
          </HelperText>

          <TextInput
            label="Date (DD/MM/YYYY)"
            value={dateInput}
            onChangeText={handleDateChange}
            mode="outlined"
            keyboardType="default"
            accessibilityLabel="Transaction date"
            error={Boolean(errors.date)}
          />
          <HelperText type="error" visible={Boolean(errors.date)}>
            {errors.date}
          </HelperText>

          <TextInput
            label="Time (HH:MM)"
            value={timeInput}
            onChangeText={handleTimeChange}
            mode="outlined"
            keyboardType="default"
            accessibilityLabel="Transaction time"
            error={Boolean(errors.time)}
          />
          <HelperText type="error" visible={Boolean(errors.time)}>
            {errors.time}
          </HelperText>

          <SelectField
            label={isTransfer ? 'From fund' : 'Fund'}
            value={selectedFund ? selectedFund.name : 'No fund'}
            onPress={() => setFundDialogVisible(true)}
            accessibilityLabel="Select fund"
            accessibilityHint="Opens the fund picker"
            error={Boolean(errors.fundId)}
          />
          <HelperText type="error" visible={Boolean(errors.fundId)}>
            {errors.fundId}
          </HelperText>

          {isTransfer ? (
            <>
              <SelectField
                label="To fund"
                value={counterpartFund ? counterpartFund.name : 'No fund'}
                onPress={() => setCounterpartDialogVisible(true)}
                accessibilityLabel="Select destination fund"
                accessibilityHint="Opens the destination fund picker"
                error={Boolean(errors.counterpartFundId)}
              />
              <HelperText
                type="error"
                visible={Boolean(errors.counterpartFundId)}
              >
                {errors.counterpartFundId}
              </HelperText>

              <TextInput
                label={
                  counterpartCurrency
                    ? `Amount received (${counterpartCurrency})`
                    : 'Amount received'
                }
                value={values.counterpartAmount}
                onChangeText={handleCounterpartAmountChange}
                mode="outlined"
                keyboardType="decimal-pad"
                accessibilityLabel="Amount received in the destination fund"
                error={Boolean(errors.counterpartAmount)}
              />
              <HelperText
                type="error"
                visible={Boolean(errors.counterpartAmount)}
              >
                {errors.counterpartAmount}
              </HelperText>

              {impliedRateLabel ? (
                <TextInput
                  label="Implied rate"
                  value={impliedRateLabel}
                  mode="outlined"
                  editable={false}
                  accessibilityLabel="Rate implied by the two amounts"
                />
              ) : null}
            </>
          ) : (
            <SelectField
              label="Category"
              value={selectedCategory ? selectedCategory.name : 'No category'}
              onPress={() => setCategoryDialogVisible(true)}
              accessibilityLabel="Select category"
              accessibilityHint="Opens the category picker"
            />
          )}

          <TextInput
            label="Notes"
            value={values.notes}
            onChangeText={handleChange('notes')}
            mode="outlined"
            multiline
            numberOfLines={3}
            accessibilityLabel="Transaction notes"
          />
        </View>

        {formError ? (
          <Text
            variant="bodyMedium"
            style={styles.errorText}
            accessibilityLiveRegion="polite"
          >
            {formError}
          </Text>
        ) : null}

        <Button
          mode="contained"
          onPress={handleSubmit}
          loading={disableSubmit}
          disabled={disableSubmit}
          accessibilityLabel={
            existingTransaction ? 'Update transaction' : 'Create transaction'
          }
        >
          {existingTransaction ? 'Update transaction' : 'Save transaction'}
        </Button>

        {existingTransaction ? (
          <Button
            mode="text"
            onPress={handleDelete}
            disabled={deleting}
            loading={deleting}
            textColor="#b00020"
            accessibilityLabel="Delete transaction"
          >
            Delete transaction
          </Button>
        ) : null}
      </ScrollView>

      <CurrencyPickerDialog
        visible={currencyDialogVisible}
        onDismiss={() => setCurrencyDialogVisible(false)}
        onSelect={handleCurrencySelect}
        title="Choose currency"
        description={currencyDialogDescription}
      />
      {isTransfer ? null : (
        <CategoryPickerDialog
          visible={categoryDialogVisible}
          onDismiss={() => setCategoryDialogVisible(false)}
          categories={categories}
          directionFilter={categoryDirection}
          selectedId={values.categoryId ?? null}
          usageCounts={categoryUsageCounts[categoryDirection]}
          onSelect={handleCategorySelect}
        />
      )}
      <FundPickerDialog
        visible={fundDialogVisible}
        onDismiss={() => setFundDialogVisible(false)}
        funds={funds}
        selectedId={values.fundId}
        excludeId={isTransfer ? values.counterpartFundId : null}
        usageCounts={fundUsageCounts}
        title={isTransfer ? 'Transfer from' : 'Choose fund'}
        onSelect={handleFundSelect}
      />
      <FundPickerDialog
        visible={counterpartDialogVisible}
        onDismiss={() => setCounterpartDialogVisible(false)}
        funds={funds}
        selectedId={values.counterpartFundId}
        excludeId={values.fundId}
        usageCounts={fundUsageCounts}
        title="Transfer to"
        onSelect={handleCounterpartSelect}
      />
    </KeyboardAvoidingView>
  );
};

const styles = StyleSheet.create({
  flex: {
    flex: 1,
  },
  scrollContainer: {
    flexGrow: 1,
    padding: 16,
    gap: 12,
  },
  formGroup: {
    gap: 8,
  },
  errorText: {
    color: '#b00020',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
    gap: 16,
  },
  retryButton: {
    marginTop: 12,
  },
});

export default AddTransactionScreen;
