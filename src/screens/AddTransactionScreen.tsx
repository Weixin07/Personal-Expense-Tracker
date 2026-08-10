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
import SelectField from '../components/SelectField';
import { findCurrencyName } from '../constants/currencyOptions';
import { useTransactionData } from '../context/AppContext';
import type { RootStackParamList } from '../navigation/AppNavigator';
import {
  buildCreatePayload,
  buildUpdatePayload,
  computeBaseAmount,
  getDefaultTransactionFormValues,
  resolveFxRateForCurrency,
  validateTransactionForm,
  type TransactionFormErrors,
  type TransactionFormValues,
} from './transactionFormUtils';
import type { TransactionType } from '../database';
import {
  formatDateBritish,
  parseBritishDateInput,
  parseTimeInput,
} from '../utils/date';
import { formatDirectionalMoney, formatMoneyAmount } from '../utils/formatting';

const TYPE_OPTIONS = [
  { value: 'expense', label: 'Expense' },
  { value: 'income', label: 'Income' },
];

const currencyDialogDescription =
  'Choose the currency for this transaction. This should match the currency on your receipt.';

type Props = NativeStackScreenProps<RootStackParamList, 'AddTransaction'>;

const AddTransactionScreen: React.FC<Props> = ({ route, navigation }) => {
  const transactionId = route.params?.transactionId ?? null;

  const {
    state: {
      categories,
      transactions,
      settings,
      fxRateCache,
      isInitialised,
      isLoading,
      error,
    },
    actions: { createTransaction, updateTransaction, deleteTransaction },
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
      ),
    [settings.baseCurrency, categories, existingTransaction, fxRateCache],
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

  useEffect(() => {
    setValues(initialFormValues);
    setDateInput(formatDateBritish(initialFormValues.date));
    setTimeInput(initialFormValues.time);
    setErrors({});
    setFormError(null);
  }, [initialFormValues]);

  useEffect(() => {
    if (error) {
      setFormError(error);
    }
  }, [error]);

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

  const handleCategorySelect = (categoryId: number | null) => {
    setValues(prev => ({ ...prev, categoryId }));
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
    setCurrencyDialogVisible(false);
    if (errors.currencyCode) {
      setErrors(prev => ({ ...prev, currencyCode: undefined }));
    }
  };

  const handleSubmit = async () => {
    setFormError(null);
    const validation = validateTransactionForm({
      ...values,
      baseAmount: computedBaseAmount,
    });

    if (!validation.ok) {
      setErrors(validation.errors);
      if (validation.errors.form) {
        setFormError(validation.errors.form);
      }
      return;
    }

    setSubmitting(true);
    try {
      if (existingTransaction) {
        await updateTransaction(
          buildUpdatePayload(existingTransaction.id, validation.value),
        );
      } else {
        await createTransaction(buildCreatePayload(validation.value));
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
          />

          <TextInput
            label="Payee"
            value={values.payee}
            onChangeText={handleChange('payee')}
            mode="outlined"
            accessibilityLabel="Transaction payee"
            autoCapitalize="words"
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
            label="Category"
            value={selectedCategory ? selectedCategory.name : 'No category'}
            onPress={() => setCategoryDialogVisible(true)}
            accessibilityLabel="Select category"
            accessibilityHint="Opens the category picker"
          />

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
      <CategoryPickerDialog
        visible={categoryDialogVisible}
        onDismiss={() => setCategoryDialogVisible(false)}
        categories={categories}
        directionFilter={values.type}
        selectedId={values.categoryId ?? null}
        onSelect={handleCategorySelect}
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
