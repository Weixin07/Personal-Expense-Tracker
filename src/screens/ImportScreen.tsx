import React, { useCallback, useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import {
  ActivityIndicator,
  Button,
  Divider,
  HelperText,
  List,
  Menu,
  SegmentedButtons,
  Surface,
  Text,
  TextInput,
} from 'react-native-paper';
import { useTransactionData } from '../context/AppContext';
import { pickCsvFile, readFileAsString } from '../security/storageAccess';
import { GoogleAuthError } from '../security/googleAuth';
import {
  authAlertForKind,
  describeAuthError,
} from '../security/googleAuthMessages';
import { listBackupFiles, downloadFileContent } from '../export';
import type { DriveBackupFile } from '../export';
import {
  autoDetectMapping,
  fxPairKey,
  inferDateOrder,
  missingRequiredFields,
  parseCsv,
  previewImport,
} from '../import';
import type {
  CsvDelimiter,
  DateFormat,
  DateOrder,
  FieldMapping,
  FxSuggestion,
  ImportPreview,
  ImportTargetField,
  NegativeAmountMeaning,
  NumberFormat,
} from '../import';

type Step = 'source' | 'drive' | 'mapping' | 'preview';

const TARGET_FIELDS: { field: ImportTargetField; label: string }[] = [
  { field: 'date', label: 'Date *' },
  { field: 'amountNative', label: 'Amount *' },
  { field: 'currencyCode', label: 'Currency *' },
  { field: 'fxRateToBase', label: 'FX rate' },
  { field: 'baseCurrencyCode', label: 'Base currency' },
  { field: 'baseAmount', label: 'Base amount' },
  { field: 'description', label: 'Description' },
  { field: 'payee', label: 'Payee' },
  { field: 'categoryName', label: 'Category' },
  { field: 'transactionType', label: 'Type' },
  { field: 'notes', label: 'Notes' },
];

const DATE_ORDER_LABELS: Record<DateOrder, string> = {
  dmy: 'DD/MM/YYYY',
  mdy: 'MM/DD/YYYY',
};

const DATE_FORMAT_OPTIONS = [
  { value: 'auto', label: 'Auto' },
  { value: 'iso', label: 'YYYY-MM-DD' },
  { value: 'dmy', label: 'DD/MM/YYYY' },
  { value: 'mdy', label: 'MM/DD/YYYY' },
];

const DELIMITER_OPTIONS = [
  { value: ',', label: 'Comma' },
  { value: ';', label: 'Semicolon' },
  { value: '\t', label: 'Tab' },
];

const NUMBER_FORMAT_OPTIONS = [
  { value: 'auto', label: 'Auto' },
  { value: 'us', label: '1,234.56' },
  { value: 'eu', label: '1.234,56' },
];

const NEGATIVE_MEANS_OPTIONS = [
  { value: 'income', label: 'Income' },
  { value: 'expense', label: 'Expense' },
];

const LARGE_IMPORT_THRESHOLD = 5000;

const MAX_LISTED_ERRORS = 10;

/**
 * How far a confirmed rate may sit from the last known one before it is queried.
 * An order of magnitude rather than a percentage, so ordinary drift against a
 * stale cached rate passes quietly while a reciprocal — the usual way this field
 * is filled in wrongly — never does.
 */
const IMPLAUSIBLE_RATE_FACTOR = 10;

const parseRateEntries = (
  entries: Record<string, string>,
): Record<string, number> => {
  const parsed: Record<string, number> = {};
  Object.entries(entries).forEach(([key, value]) => {
    const numeric = Number(value.trim());
    if (value.trim() && Number.isFinite(numeric) && numeric > 0) {
      parsed[key] = numeric;
    }
  });
  return parsed;
};

const sameRates = (
  a: Record<string, number>,
  b: Record<string, number>,
): boolean => {
  const keys = Object.keys(a);
  return (
    keys.length === Object.keys(b).length &&
    keys.every(key => a[key] === b[key])
  );
};

/**
 * Rates worth a second look before they are applied to the whole import. A pair
 * with a known rate is judged against it; a pair with none — the case when
 * nothing has ever been imported for it — is judged against parity, since a rate
 * of exactly 1 between two different currencies is nearly always a misread of
 * which way the conversion runs.
 */
const implausibleRates = (
  fxReview: readonly FxSuggestion[],
  rates: Record<string, number>,
): FxSuggestion[] =>
  fxReview.filter(item => {
    const rate = rates[fxPairKey(item.baseCurrencyCode, item.currencyCode)];
    if (rate == null) {
      return false;
    }
    if (item.suggestedRate != null && item.suggestedRate > 0) {
      const ratio = rate / item.suggestedRate;
      return (
        ratio >= IMPLAUSIBLE_RATE_FACTOR || ratio <= 1 / IMPLAUSIBLE_RATE_FACTOR
      );
    }
    return rate === 1;
  });

const describeSuspectRate = (
  item: FxSuggestion,
  rates: Record<string, number>,
): string => {
  const rate = rates[fxPairKey(item.baseCurrencyCode, item.currencyCode)];
  const known =
    item.suggestedRate != null && item.suggestedRate > 0
      ? ` The rate you last used was ${item.suggestedRate}.`
      : '';
  return (
    `1 ${item.currencyCode} = ${rate} ${item.baseCurrencyCode}` +
    ` affects ${item.rowCount} row${item.rowCount === 1 ? '' : 's'}.${known}`
  );
};

const ImportScreen: React.FC = () => {
  const {
    state: { settings, transactions, categories, fxRateCache },
    actions: { importTransactions },
  } = useTransactionData();

  const [step, setStep] = useState<Step>('source');
  const [busy, setBusy] = useState(false);
  const [csvText, setCsvText] = useState('');
  const [header, setHeader] = useState<string[]>([]);
  const [mapping, setMapping] = useState<FieldMapping>({});
  const [dateFormat, setDateFormat] = useState<DateFormat>('auto');
  const [delimiter, setDelimiter] = useState<CsvDelimiter>(',');
  const [numberFormat, setNumberFormat] = useState<NumberFormat>('auto');
  const [negativeMeans, setNegativeMeans] =
    useState<NegativeAmountMeaning>('expense');
  // Null until the user edits the field, so a base currency that hydrates after
  // this screen mounts still reaches the input.
  const [defaultCurrencyEdit, setDefaultCurrencyEdit] = useState<string | null>(
    null,
  );
  const [currencyChoices, setCurrencyChoices] = useState<
    Record<string, string>
  >({});
  const [preview, setPreview] = useState<ImportPreview | null>(null);
  // Editable rate fields, keyed by `fxPairKey`, alongside the rates the current
  // preview was actually built from. Divergence means the preview on screen no
  // longer reflects what has been typed.
  const [acceptedRates, setAcceptedRates] = useState<Record<string, string>>(
    {},
  );
  const [appliedRates, setAppliedRates] = useState<Record<string, number>>({});
  const [driveFiles, setDriveFiles] = useState<DriveBackupFile[]>([]);
  const [openMenuField, setOpenMenuField] = useState<ImportTargetField | null>(
    null,
  );

  const currencyColumnMapped = mapping.currencyCode !== undefined;
  const defaultCurrency = defaultCurrencyEdit ?? settings.baseCurrency ?? '';
  const trimmedDefaultCurrency = defaultCurrency.trim();

  const missing = useMemo(
    () =>
      missingRequiredFields(mapping, {
        hasDefaultCurrency: Boolean(trimmedDefaultCurrency),
      }),
    [mapping, trimmedDefaultCurrency],
  );

  const detectedDateOrder = useMemo<DateOrder | null>(() => {
    const column = mapping.date;
    if (dateFormat !== 'auto' || column === undefined || !csvText) {
      return null;
    }
    const { rows } = parseCsv(csvText, { delimiter });
    return inferDateOrder(rows.map(row => row.cells[column] ?? ''));
  }, [csvText, dateFormat, delimiter, mapping.date]);

  const applyParsed = useCallback(
    (text: string, delimiterOverride?: CsvDelimiter) => {
      const parsed = parseCsv(
        text,
        delimiterOverride ? { delimiter: delimiterOverride } : {},
      );
      setCsvText(text);
      setDelimiter(parsed.delimiter);
      setHeader(parsed.header);
      setMapping(autoDetectMapping(parsed.header, parsed.rows));
      setPreview(null);
    },
    [],
  );

  const loadText = useCallback(
    (text: string) => {
      applyParsed(text);
      setStep('mapping');
    },
    [applyParsed],
  );

  const handleDelimiterChange = useCallback(
    (value: string) => {
      applyParsed(csvText, value as CsvDelimiter);
    },
    [applyParsed, csvText],
  );

  const handlePickLocal = useCallback(async () => {
    setBusy(true);
    try {
      const selection = await pickCsvFile();
      if (!selection.ok) {
        if (!selection.cancelled) {
          Alert.alert(
            'Import failed',
            selection.message ?? 'Unable to open file.',
          );
        }
        return;
      }
      const text = await readFileAsString(selection.uri);
      loadText(text);
    } catch (error) {
      Alert.alert(
        'Import failed',
        error instanceof Error ? error.message : 'Unable to read the file.',
      );
    } finally {
      setBusy(false);
    }
  }, [loadText]);

  const handleOpenDrive = useCallback(async () => {
    setBusy(true);
    try {
      const result = await listBackupFiles({ interactive: true });
      if (!result.ok) {
        if (result.requiresAuth) {
          Alert.alert(
            'Sign in required',
            'Please sign in to Google Drive and try again.',
          );
        } else if (result.errorKind) {
          const { title, body } = authAlertForKind(
            result.errorKind,
            result.message,
          );
          Alert.alert(title, body);
        } else {
          Alert.alert(
            'Unable to list backups',
            result.message ?? 'Could not list Drive backups.',
          );
        }
        return;
      }
      setDriveFiles(result.files);
      setStep('drive');
    } catch (error) {
      const { title, body } = describeAuthError(error);
      Alert.alert(title, body);
    } finally {
      setBusy(false);
    }
  }, []);

  const handlePickDrive = useCallback(
    async (fileId: string) => {
      setBusy(true);
      try {
        const text = await downloadFileContent(fileId, { interactive: true });
        loadText(text);
      } catch (error) {
        if (error instanceof GoogleAuthError) {
          const { title, body } = describeAuthError(error);
          Alert.alert(title, body);
        } else {
          Alert.alert(
            'Download failed',
            error instanceof Error ? error.message : 'Unable to download file.',
          );
        }
      } finally {
        setBusy(false);
      }
    },
    [loadText],
  );

  const setFieldColumn = useCallback(
    (field: ImportTargetField, columnIndex: number | null) => {
      setOpenMenuField(null);
      setMapping(current => {
        const next = { ...current };
        if (columnIndex === null) {
          delete next[field];
        } else {
          next[field] = columnIndex;
        }
        return next;
      });
    },
    [],
  );

  const runPreview = useCallback(
    (choices: Record<string, string>, rates: Record<string, number>) => {
      try {
        const result = previewImport(csvText, mapping, dateFormat, {
          baseCurrency: settings.baseCurrency,
          defaultCurrency: trimmedDefaultCurrency
            ? trimmedDefaultCurrency.toUpperCase()
            : null,
          currencyChoices: choices,
          negativeMeans,
          numberFormat,
          delimiter,
          manualFxRates: rates,
          fxRateCache,
          existingTransactions: transactions,
          existingCategories: categories,
        });
        // Seed only pairs the user has not answered yet: re-previewing must not
        // discard rates that are being applied.
        setAcceptedRates(current => {
          const next = { ...current };
          result.fxReview.forEach(item => {
            const key = fxPairKey(item.baseCurrencyCode, item.currencyCode);
            if (next[key] === undefined) {
              next[key] =
                item.suggestedRate != null ? String(item.suggestedRate) : '';
            }
          });
          return next;
        });
        setAppliedRates(rates);
        setPreview(result);
        setStep('preview');
      } catch (error) {
        Alert.alert(
          'Cannot preview',
          error instanceof Error ? error.message : 'Unable to preview import.',
        );
      }
    },
    [
      categories,
      csvText,
      dateFormat,
      delimiter,
      transactions,
      fxRateCache,
      mapping,
      negativeMeans,
      numberFormat,
      settings.baseCurrency,
      trimmedDefaultCurrency,
    ],
  );

  const incomeReady = useMemo(
    () =>
      preview
        ? preview.valid.filter(item => item.record.type === 'income').length
        : 0,
    [preview],
  );

  const pendingRates = useMemo(
    () => parseRateEntries(acceptedRates),
    [acceptedRates],
  );
  const hasUnappliedRates = !sameRates(pendingRates, appliedRates);

  const handlePreview = useCallback(() => {
    runPreview(currencyChoices, appliedRates);
  }, [appliedRates, currencyChoices, runPreview]);

  const handleChooseCurrency = useCallback(
    (raw: string, code: string) => {
      const next = { ...currencyChoices, [raw.toLowerCase()]: code };
      setCurrencyChoices(next);
      runPreview(next, appliedRates);
    },
    [appliedRates, currencyChoices, runPreview],
  );

  // Deferred so the spinner paints before the file is re-parsed; the work is
  // synchronous and would otherwise complete inside the same frame as the press.
  const applyRates = useCallback(
    (rates: Record<string, number>) => {
      setBusy(true);
      setTimeout(() => {
        try {
          runPreview(currencyChoices, rates);
        } finally {
          setBusy(false);
        }
      }, 0);
    },
    [currencyChoices, runPreview],
  );

  const handleApplyRates = useCallback(() => {
    if (!preview) {
      return;
    }
    const suspect = implausibleRates(preview.fxReview, pendingRates);
    if (suspect.length === 0) {
      applyRates(pendingRates);
      return;
    }
    Alert.alert(
      'Check these rates',
      `${suspect
        .map(item => describeSuspectRate(item, pendingRates))
        .join('\n\n')}\n\nUse them anyway?`,
      [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Use these rates',
          onPress: () => applyRates(pendingRates),
        },
      ],
    );
  }, [applyRates, pendingRates, preview]);

  const resetToStart = useCallback(() => {
    setStep('source');
    setCsvText('');
    setHeader([]);
    setMapping({});
    setPreview(null);
    setAcceptedRates({});
    setAppliedRates({});
    setDriveFiles([]);
    setCurrencyChoices({});
    setDefaultCurrencyEdit(null);
    setDelimiter(',');
    setNumberFormat('auto');
    setNegativeMeans('expense');
    setDateFormat('auto');
  }, []);

  const handleConfirm = useCallback(async () => {
    if (!preview) {
      return;
    }
    setBusy(true);
    try {
      const summary = await importTransactions(preview, appliedRates);
      Alert.alert(
        'Import complete',
        `${summary.insertedExpenses} expense${summary.insertedExpenses === 1 ? '' : 's'}` +
          ` and ${summary.insertedIncome} income imported` +
          (summary.createdCategories
            ? `, ${summary.createdCategories} categor${summary.createdCategories === 1 ? 'y' : 'ies'} created`
            : '') +
          (summary.skippedInvalid
            ? `. ${summary.skippedInvalid} row${summary.skippedInvalid === 1 ? '' : 's'} skipped.`
            : '.') +
          (summary.skippedNeedsFxRate
            ? ` ${summary.skippedNeedsFxRate} row${summary.skippedNeedsFxRate === 1 ? '' : 's'} still need an FX rate.`
            : ''),
      );
      resetToStart();
    } catch (error) {
      Alert.alert(
        'Import failed',
        error instanceof Error
          ? error.message
          : 'Unable to import transactions.',
      );
    } finally {
      setBusy(false);
    }
  }, [appliedRates, importTransactions, preview, resetToStart]);

  return (
    <Surface style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        {busy ? (
          <ActivityIndicator
            accessibilityLabel="Working"
            style={styles.spinner}
          />
        ) : null}

        {step === 'source' ? (
          <View style={styles.section}>
            <Text variant="titleMedium">Choose a source</Text>
            <Button
              mode="contained"
              onPress={handlePickLocal}
              disabled={busy}
              accessibilityLabel="Import from a CSV file"
            >
              Choose CSV file
            </Button>
            <Button
              mode="contained-tonal"
              onPress={handleOpenDrive}
              disabled={busy}
              accessibilityLabel="Import from Google Drive"
            >
              From Google Drive
            </Button>
            <Text variant="bodySmall" style={styles.muted}>
              Google Drive lists backups this app exported. For a CSV from
              another app or your own records, use Choose CSV file — it can open
              files from Drive and other locations.
            </Text>
          </View>
        ) : null}

        {step === 'drive' ? (
          <View style={styles.section}>
            <Text variant="titleMedium">Select a backup</Text>
            {driveFiles.length === 0 ? (
              <>
                <Text variant="bodyMedium">
                  No backups from this app were found in Drive.
                </Text>
                <Text variant="bodySmall" style={styles.muted}>
                  Only files this app exported appear here. To import a CSV from
                  another app or your own records, choose a CSV file instead.
                </Text>
                <Button
                  mode="contained-tonal"
                  onPress={handlePickLocal}
                  disabled={busy}
                  accessibilityLabel="Choose a CSV file instead"
                >
                  Choose CSV file
                </Button>
              </>
            ) : (
              driveFiles.map(file => (
                <List.Item
                  key={file.id}
                  title={file.name}
                  description={new Date(file.modifiedTime).toLocaleString()}
                  onPress={() => handlePickDrive(file.id)}
                  accessibilityLabel={`Import ${file.name}`}
                />
              ))
            )}
            <Button onPress={resetToStart}>Back</Button>
          </View>
        ) : null}

        {step === 'mapping' ? (
          <View style={styles.section}>
            <Text variant="titleMedium">Map columns</Text>
            <Text variant="bodySmall" style={styles.muted}>
              Required fields are marked with *. Detected {header.length} column
              {header.length === 1 ? '' : 's'}.
            </Text>
            {TARGET_FIELDS.map(({ field, label }) => {
              const mapped = mapping[field];
              const anchorLabel =
                mapped !== undefined
                  ? `${header[mapped] || 'Column'} (column ${mapped + 1})`
                  : 'Not mapped';
              return (
                <View key={field} style={styles.mapRow}>
                  <Text style={styles.mapLabel}>{label}</Text>
                  <Menu
                    visible={openMenuField === field}
                    onDismiss={() => setOpenMenuField(null)}
                    anchor={
                      <Button
                        mode="outlined"
                        onPress={() => setOpenMenuField(field)}
                        accessibilityLabel={`Map ${label}`}
                      >
                        {anchorLabel}
                      </Button>
                    }
                  >
                    <Menu.Item
                      onPress={() => setFieldColumn(field, null)}
                      title="Not mapped"
                      accessibilityLabel={`Clear ${label} mapping`}
                    />
                    {header.map((column, index) => (
                      <Menu.Item
                        key={`${field}-${index}`}
                        onPress={() => setFieldColumn(field, index)}
                        title={
                          column
                            ? `${column} (column ${index + 1})`
                            : `Column ${index + 1}`
                        }
                      />
                    ))}
                  </Menu>
                </View>
              );
            })}

            {!currencyColumnMapped ? (
              <TextInput
                mode="outlined"
                label="Default currency"
                autoCapitalize="characters"
                value={defaultCurrency}
                onChangeText={setDefaultCurrencyEdit}
                accessibilityLabel="Default currency"
              />
            ) : null}
            {!currencyColumnMapped ? (
              <Text variant="bodySmall" style={styles.muted}>
                This file has no currency column. Rows are imported using the
                default currency above.
              </Text>
            ) : null}

            <Divider />

            <Text variant="bodySmall" style={styles.muted}>
              Column separator
            </Text>
            <SegmentedButtons
              value={delimiter}
              onValueChange={handleDelimiterChange}
              buttons={DELIMITER_OPTIONS}
            />

            <Text variant="bodySmall" style={styles.muted}>
              Number format
            </Text>
            <SegmentedButtons
              value={numberFormat}
              onValueChange={value => setNumberFormat(value as NumberFormat)}
              buttons={NUMBER_FORMAT_OPTIONS}
            />

            <Text variant="bodySmall" style={styles.muted}>
              A negative amount means
            </Text>
            <SegmentedButtons
              value={negativeMeans}
              onValueChange={value =>
                setNegativeMeans(value as NegativeAmountMeaning)
              }
              buttons={NEGATIVE_MEANS_OPTIONS}
            />

            <Text variant="bodySmall" style={styles.muted}>
              Date format
            </Text>
            <SegmentedButtons
              value={dateFormat}
              onValueChange={value => setDateFormat(value as DateFormat)}
              buttons={DATE_FORMAT_OPTIONS}
            />
            {detectedDateOrder ? (
              <Text variant="bodySmall" style={styles.muted}>
                Detected {DATE_ORDER_LABELS[detectedDateOrder]} from your file.
                Choose a format above to override it.
              </Text>
            ) : null}

            {missing.length > 0 ? (
              <HelperText type="error" visible>
                Map the required columns to continue.
              </HelperText>
            ) : null}

            <Button
              mode="contained"
              onPress={handlePreview}
              disabled={missing.length > 0}
              accessibilityLabel="Preview import"
            >
              Preview
            </Button>
            <Button onPress={resetToStart}>Cancel</Button>
          </View>
        ) : null}

        {step === 'preview' && preview ? (
          <View style={styles.section}>
            <Text variant="titleMedium">Review import</Text>
            <Text variant="bodyMedium">
              {preview.valid.length} of {preview.totalRows} rows ready to
              import.
            </Text>
            {incomeReady > 0 ? (
              <Text variant="bodySmall" style={styles.muted}>
                {preview.valid.length - incomeReady} expense and {incomeReady}{' '}
                income.
              </Text>
            ) : null}
            {preview.signConventionBypassed ? (
              <Text variant="bodySmall" style={styles.muted}>
                This file has no negative amounts, so rows without a type column
                are imported as expenses.
              </Text>
            ) : null}
            {preview.totalRows > LARGE_IMPORT_THRESHOLD ? (
              <View style={styles.banner}>
                <Text variant="bodySmall">
                  Large file ({preview.totalRows} rows). Importing may take a
                  moment.
                </Text>
              </View>
            ) : null}

            {preview.currencyReview.length > 0 ? (
              <View style={styles.section}>
                <Text variant="bodyMedium">Choose currencies</Text>
                {preview.currencyReview.map(item => (
                  <View key={item.raw} style={styles.section}>
                    <Text variant="bodySmall" style={styles.muted}>
                      &quot;{item.raw}&quot; matches more than one currency.
                      Pick the right one:
                    </Text>
                    <View style={styles.choiceRow}>
                      {item.candidates.map(code => (
                        <Button
                          key={code}
                          mode={
                            currencyChoices[item.raw.toLowerCase()] === code
                              ? 'contained'
                              : 'outlined'
                          }
                          onPress={() => handleChooseCurrency(item.raw, code)}
                          accessibilityLabel={`Use ${code} for ${item.raw}`}
                        >
                          {code}
                        </Button>
                      ))}
                    </View>
                  </View>
                ))}
              </View>
            ) : null}

            {preview.duplicates.length > 0 ? (
              <View style={styles.banner}>
                <Text variant="bodySmall">
                  {preview.duplicates.length} row
                  {preview.duplicates.length === 1 ? '' : 's'} look like
                  existing transactions and will be added again.
                </Text>
              </View>
            ) : null}
            {preview.newCategoryNames.length > 0 ? (
              <Text variant="bodySmall" style={styles.muted}>
                New categories: {preview.newCategoryNames.join(', ')}
              </Text>
            ) : null}

            {preview.needsFxRate.length > 0 ? (
              <View style={styles.banner}>
                <Text variant="bodySmall">
                  {preview.needsFxRate.length} row
                  {preview.needsFxRate.length === 1 ? '' : 's'} need an FX rate.
                  Enter the rates below, then apply them.
                </Text>
              </View>
            ) : null}

            {preview.fxReview.length > 0 ? (
              <View style={styles.section}>
                <Text variant="bodyMedium">Confirm FX rates</Text>
                {preview.fxReview.map(item => {
                  const key = fxPairKey(
                    item.baseCurrencyCode,
                    item.currencyCode,
                  );
                  return (
                    <TextInput
                      key={key}
                      mode="outlined"
                      label={`1 ${item.currencyCode} = ? ${item.baseCurrencyCode}`}
                      keyboardType="numeric"
                      value={acceptedRates[key] ?? ''}
                      onChangeText={text =>
                        setAcceptedRates(current => ({
                          ...current,
                          [key]: text,
                        }))
                      }
                      accessibilityLabel={`FX rate ${item.currencyCode} to ${item.baseCurrencyCode}`}
                    />
                  );
                })}
                <Button
                  mode="contained-tonal"
                  onPress={handleApplyRates}
                  disabled={busy || Object.keys(pendingRates).length === 0}
                  accessibilityLabel="Apply FX rates"
                >
                  Apply rates
                </Button>
              </View>
            ) : null}

            {preview.invalid.length > 0 ? (
              <View style={styles.section}>
                <Divider />
                <Text variant="bodyMedium">
                  {preview.invalid.length} row
                  {preview.invalid.length === 1 ? '' : 's'} skipped
                </Text>
                {preview.invalid.slice(0, MAX_LISTED_ERRORS).map(error => (
                  <Text
                    key={error.line}
                    variant="bodySmall"
                    style={styles.muted}
                  >
                    Line {error.line}: {error.reason}
                  </Text>
                ))}
                {preview.invalid.length > MAX_LISTED_ERRORS ? (
                  <Text variant="bodySmall" style={styles.muted}>
                    …and {preview.invalid.length - MAX_LISTED_ERRORS} more.
                  </Text>
                ) : null}
              </View>
            ) : null}

            {hasUnappliedRates ? (
              <HelperText type="error" visible>
                Apply the rates you entered before importing.
              </HelperText>
            ) : null}

            <Button
              mode="contained"
              onPress={handleConfirm}
              disabled={busy || preview.valid.length === 0 || hasUnappliedRates}
              accessibilityLabel="Confirm import"
            >
              Import {preview.valid.length} transactions
            </Button>
            <Button onPress={() => setStep('mapping')}>Back</Button>
          </View>
        ) : null}
      </ScrollView>
    </Surface>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    padding: 16,
    gap: 12,
  },
  section: {
    gap: 12,
  },
  spinner: {
    marginVertical: 8,
  },
  mapRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  mapLabel: {
    flex: 1,
  },
  muted: {
    color: '#6b6b6b',
  },
  banner: {
    padding: 12,
    borderRadius: 8,
    backgroundColor: '#fff4e5',
  },
  choiceRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
});

export default ImportScreen;
