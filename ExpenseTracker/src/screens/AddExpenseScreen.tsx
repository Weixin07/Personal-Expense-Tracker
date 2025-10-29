import React, { useEffect, useMemo, useState } from 'react';
import { Alert, KeyboardAvoidingView, Platform, ScrollView, StyleSheet, View } from 'react-native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import {
  ActivityIndicator,
  Button,
  HelperText,
  Text,
  TextInput,
} from 'react-native-paper';
import CategoryPickerDialog from '../components/CategoryPickerDialog';
import CurrencyPickerDialog from '../components/CurrencyPickerDialog';
import { findCurrencyName } from '../constants/currencyOptions';
import { useExpenseData } from '../context/AppContext';
import type { RootStackParamList } from '../navigation/AppNavigator';
import {
  buildCreatePayload,
  buildUpdatePayload,
  computeBaseAmount,
  getDefaultExpenseFormValues,
  validateExpenseForm,
  type ExpenseFormErrors,
  type ExpenseFormValues,
} from './expenseFormUtils';
import { formatDateBritish, parseBritishDateInput } from '../utils/date';
import { formatMoneyAmount } from '../utils/formatting';

const currencyDialogDescription = 'Choose the currency for this expense. This should match the currency on your receipt.';

type Props = NativeStackScreenProps<RootStackParamList, 'AddExpense'>;

const AddExpenseScreen: React.FC<Props> = ({ route, navigation }) => {
  const expenseId = route.params?.expenseId ?? null;

  const {
    state: { categories, expenses, settings, isInitialised, isLoading, error },
    actions: { createExpense, updateExpense, deleteExpense },
  } = useExpenseData();

  const existingExpense = useMemo(
    () => expenses.find(item => item.id === expenseId) ?? null,
    [expenses, expenseId],
  );

  const initialFormValues = useMemo(
    () => getDefaultExpenseFormValues(settings.baseCurrency, categories, existingExpense ?? undefined),
    [settings.baseCurrency, categories, existingExpense],
  );

  const [values, setValues] = useState<ExpenseFormValues>(initialFormValues);
  const [dateInput, setDateInput] = useState<string>(formatDateBritish(initialFormValues.date));
  const [errors, setErrors] = useState<ExpenseFormErrors>({});
  const [formError, setFormError] = useState<string | null>(null);
  const [currencyDialogVisible, setCurrencyDialogVisible] = useState(false);
  const [categoryDialogVisible, setCategoryDialogVisible] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [deleting, setDeleting] = useState(false);

  useEffect(() => {
    setValues(initialFormValues);
    setDateInput(formatDateBritish(initialFormValues.date));
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

  const handleChange = (field: keyof ExpenseFormValues) => (text: string) => {\n    setValues(prev => ({ ...prev, [field]: text }));\n    const errorField = field as keyof ExpenseFormErrors;\n    if (errors[errorField]) {\n      setErrors(prev => ({ ...prev, [errorField]: undefined }));\n    }\n  };

  const handleDateChange = (text: string) => {
    setDateInput(text);
    const iso = parseBritishDateInput(text);
    setValues(prev => ({ ...prev, date: iso ?? '' }));
    if (errors.date) {
      setErrors(prev => ({ ...prev, date: undefined }));
    }
  };

  const handleCategorySelect = (categoryId: number | null) => {
    setValues(prev => ({ ...prev, categoryId }));
  };

  const handleCurrencySelect = (option: { code: string }) => {
    setValues(prev => ({ ...prev, currencyCode: option.code }));
    setCurrencyDialogVisible(false);
    if (errors.currencyCode) {
      setErrors(prev => ({ ...prev, currencyCode: undefined }));
    }
  };

  const handleSubmit = async () => {
    setFormError(null);
    const validation = validateExpenseForm({
      ...values,
      baseAmount: computedBaseAmount,
    });

    if (!validation.ok) {
      setErrors(validation.errors);
      return;
    }

    setSubmitting(true);
    try {
      if (existingExpense) {
        await updateExpense(buildUpdatePayload(existingExpense.id, validation.value));
      } else {
        await createExpense(buildCreatePayload(validation.value));
      }
      navigation.goBack();
    } catch (err) {
      setFormError(err instanceof Error ? err.message : 'Failed to save expense.');
    } finally {
      setSubmitting(false);
    }
  };

  const handleDelete = () => {
    if (!existingExpense || deleting) {
      return;
    }

    Alert.alert('Delete expense', 'Are you sure you want to delete this expense?', [
      { text: 'Cancel', style: 'cancel' },
      {
        text: 'Delete',
        style: 'destructive',
        onPress: async () => {
          setDeleting(true);
          try {
            await deleteExpense(existingExpense.id);
            navigation.goBack();
          } catch (deleteErr) {
            Alert.alert(
              'Delete failed',
              deleteErr instanceof Error ? deleteErr.message : 'Unable to delete expense.',
            );
          } finally {
            setDeleting(false);
          }
        },
      },
    ]);
  };

  const selectedCategory = categories.find(category => category.id === values.categoryId) ?? null;
  const currencyName = findCurrencyName(values.currencyCode);

  if (expenseId && isInitialised && !existingExpense) {
    return (
      <View style={styles.centered}>
        <Text variant="titleLarge">Expense not found</Text>
        <Button mode="contained" onPress={() => navigation.goBack()} style={styles.retryButton}>
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
      <ScrollView contentContainerStyle={styles.scrollContainer} keyboardShouldPersistTaps="handled">
        <View style={styles.formGroup}>
          <TextInput
            label="Description"
            value={values.description}
            onChangeText={handleChange('description')}
            mode="outlined"
            accessibilityLabel="Expense description"
            error={Boolean(errors.description)}
            autoCapitalize="sentences"
          />
          <HelperText type="error" visible={Boolean(errors.description)}>
            {errors.description}
          </HelperText>

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

          <TextInput
            label="Currency"
            value={values.currencyCode}
            onPressIn={() => setCurrencyDialogVisible(true)}
            right={<TextInput.Icon icon="menu-down" accessibilityLabel="Open currency picker" />}
            mode="outlined"
            showSoftInputOnFocus={false}
            accessibilityLabel={currencyName ? `${values.currencyCode} ${currencyName}` : 'Select currency'}
            editable={false}
            error={Boolean(errors.currencyCode)}
          />
          <HelperText type="error" visible={Boolean(errors.currencyCode)}>
            {errors.currencyCode}
          </HelperText>

          <TextInput
            label="FX rate to base"
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
            value={computedBaseAmount}
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
            accessibilityLabel="Expense date"
            error={Boolean(errors.date)}
          />
          <HelperText type="error" visible={Boolean(errors.date)}>
            {errors.date}
          </HelperText>

          <TextInput
            label="Category"
            value={selectedCategory ? selectedCategory.name : 'No category'}
            mode="outlined"
            editable={false}
            showSoftInputOnFocus={false}
            onPressIn={() => setCategoryDialogVisible(true)}
            right={<TextInput.Icon icon="menu-down" accessibilityLabel="Open category picker" />}
            accessibilityLabel="Select category"
          />

          <TextInput
            label="Notes"
            value={values.notes}
            onChangeText={handleChange('notes')}
            mode="outlined"
            multiline
            numberOfLines={3}
            accessibilityLabel="Expense notes"
          />
        </View>

        {formError ? (
          <Text variant="bodyMedium" style={styles.errorText} accessibilityLiveRegion="polite">
            {formError}
          </Text>
        ) : null}

        <Button
          mode="contained"
          onPress={handleSubmit}
          loading={disableSubmit}
          disabled={disableSubmit}
          accessibilityLabel={existingExpense ? 'Update expense' : 'Create expense'}
        >
          {existingExpense ? 'Update expense' : 'Save expense'}
        </Button>

        {existingExpense ? (
          <Button
            mode="text"
            onPress={handleDelete}
            disabled={deleting}
            loading={deleting}
            textColor="#b00020"
            accessibilityLabel="Delete expense"
          >
            Delete expense
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

export default AddExpenseScreen;
