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
  Switch,
  Text,
  TextInput,
} from 'react-native-paper';
import { useTransactionData } from '../context/AppContext';
import FundPickerDialog from '../components/FundPickerDialog';
import SelectField from '../components/SelectField';
import { findDefaultFund } from '../utils/funds';
import {
  formatExpenseCount,
  formatIncomeCount,
  formatTransferCount,
} from '../utils/transactionLabels';
import { formatDateBritish } from '../utils/date';
import { formatFxRate } from '../utils/formatting';
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
  describeSuspectDerivedRate,
  describeSuspectRate,
  describeTransferConversion,
  fxPairKey,
  implausibleRates,
  inferDateOrder,
  missingRequiredFields,
  parseCsv,
  previewImport,
  ratesToSeed,
} from '../import';
import type {
  CsvDelimiter,
  DateFormat,
  DateOrder,
  FieldMapping,
  ImportPreview,
  ImportTargetField,
  NegativeAmountMeaning,
  NumberFormat,
} from '../import';

type Step = 'source' | 'drive' | 'mapping' | 'preview';

const TARGET_FIELDS: { field: ImportTargetField; label: string }[] = [
  { field: 'date', label: 'Date *' },
  { field: 'time', label: 'Time' },
  { field: 'amountNative', label: 'Amount *' },
  { field: 'currencyCode', label: 'Currency *' },
  { field: 'fxRateToBase', label: 'FX rate' },
  { field: 'baseCurrencyCode', label: 'Base currency' },
  { field: 'baseAmount', label: 'Base amount' },
  { field: 'description', label: 'Description' },
  { field: 'payee', label: 'Payee' },
  { field: 'categoryName', label: 'Category' },
  { field: 'transactionType', label: 'Type' },
  { field: 'fundName', label: 'Fund' },
  { field: 'counterpartFundName', label: 'Transfer to fund' },
  { field: 'counterpartAmount', label: 'Amount received' },
  { field: 'counterpartCurrency', label: 'Received currency' },
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
 * Names the currency an amount column is read as, so a column holding some other
 * currency is visible as a mismatch at the moment it is chosen. A base amount is
 * read against the base currency; a received amount against the currency of the
 * fund it lands in, which is not the same thing.
 */
const targetFieldLabel = (
  field: ImportTargetField,
  label: string,
  baseCurrency: string | null,
  counterpartCurrency: string | null,
): string => {
  if (field === 'baseAmount' && baseCurrency) {
    return `${label} (in ${baseCurrency})`;
  }
  if (field === 'counterpartAmount' && counterpartCurrency) {
    return `${label} (in ${counterpartCurrency})`;
  }
  return label;
};

const ImportScreen: React.FC = () => {
  const {
    state: { settings, transactions, categories, funds, fxRateCache },
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
  // Whether the preview on screen was built with saved rates standing in for
  // unconfirmed ones, tracked alongside `appliedRates` for the same reason.
  const [appliedUseCachedRates, setAppliedUseCachedRates] = useState(true);
  // Duplicate skipping starts on so that re-running an import cannot double a
  // ledger without the choice being made deliberately.
  const [skipDuplicates, setSkipDuplicates] = useState(true);
  // Keyed by lower-cased incoming category name, matching `CommitImportOptions`.
  // Holds accepted merges only; a declined suggestion is recorded separately so
  // that declining leaves the incoming name untouched.
  const [categoryAliases, setCategoryAliases] = useState<
    Record<string, string>
  >({});
  const [declinedSuggestions, setDeclinedSuggestions] = useState<string[]>([]);
  // Per-name choice for fund names the file introduces: 'create' brings the fund
  // into existence, an id files those rows under an existing fund, and an absent
  // entry leaves them with the default fund.
  const [fundDecisions, setFundDecisions] = useState<
    Record<string, 'create' | number>
  >({});
  const [defaultFundOverride, setDefaultFundOverride] = useState<number | null>(
    null,
  );
  // Which incoming fund name the picker is currently choosing a target for.
  const [fundTargetForName, setFundTargetForName] = useState<string | null>(
    null,
  );
  const [defaultFundDialogVisible, setDefaultFundDialogVisible] =
    useState(false);
  const [driveFiles, setDriveFiles] = useState<DriveBackupFile[]>([]);
  const [openMenuField, setOpenMenuField] = useState<ImportTargetField | null>(
    null,
  );

  // Every row must land in a fund, so the chosen default stands in whenever the
  // file names none.
  const defaultFund = useMemo(() => {
    const override =
      defaultFundOverride != null
        ? (funds.find(fund => fund.id === defaultFundOverride) ?? null)
        : null;
    return override ?? findDefaultFund(funds);
  }, [defaultFundOverride, funds]);

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
    (
      choices: Record<string, string>,
      rates: Record<string, number>,
      useCached: boolean,
    ) => {
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
          useCachedRates: useCached,
          fxRateCache,
          existingTransactions: transactions,
          existingCategories: categories,
          existingFunds: funds,
          defaultFundId: defaultFund?.id ?? 0,
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
        setAppliedUseCachedRates(useCached);
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
      defaultFund,
      delimiter,
      funds,
      transactions,
      fxRateCache,
      mapping,
      negativeMeans,
      numberFormat,
      settings.baseCurrency,
      trimmedDefaultCurrency,
    ],
  );

  // What Confirm would actually write. Every count on screen reads this rather
  // than `preview.valid`, which still holds the rows skipping removes.
  const readyRows = useMemo(() => {
    if (!preview) {
      return [];
    }
    if (!skipDuplicates) {
      return preview.valid;
    }
    const duplicateLines = new Set(preview.duplicates.map(item => item.line));
    return preview.valid.filter(item => !duplicateLines.has(item.line));
  }, [preview, skipDuplicates]);

  const incomeReady = useMemo(
    () => readyRows.filter(item => item.record.type === 'income').length,
    [readyRows],
  );

  const skippedDuplicateCount = preview
    ? preview.valid.length - readyRows.length
    : 0;
  const derivedRateCount = readyRows.filter(
    item => item.fxRateSource === 'derived',
  ).length;
  const ratesToBeSaved = useMemo(() => ratesToSeed(readyRows), [readyRows]);
  const allRowsDuplicated = Boolean(
    preview && preview.valid.length > 0 && readyRows.length === 0,
  );

  const suggestionsPending = useMemo(
    () =>
      preview
        ? preview.categorySuggestions.filter(item => {
            const key = item.sourceName.toLowerCase();
            return (
              categoryAliases[key] === undefined &&
              !declinedSuggestions.includes(key)
            );
          })
        : [],
    [categoryAliases, declinedSuggestions, preview],
  );

  const needsDecision = Boolean(
    preview &&
      (preview.currencyReview.length > 0 ||
        preview.fxReview.length > 0 ||
        preview.suspectDerivedRates.length > 0 ||
        suggestionsPending.length > 0),
  );

  // A name the user merged into an existing category is no longer being created.
  const newCategoryNames = useMemo(
    () =>
      preview
        ? preview.newCategoryNames.filter(
            name => categoryAliases[name.toLowerCase()] === undefined,
          )
        : [],
    [categoryAliases, preview],
  );

  const pendingRates = useMemo(
    () => parseRateEntries(acceptedRates),
    [acceptedRates],
  );

  /**
   * Saved rates the user has emptied the field for. Clearing one is a rejection
   * of that rate, so it must stop standing in for a confirmed one — otherwise
   * deleting a rate you disagree with is what lets it through.
   */
  const clearedSavedRates = useMemo(
    () =>
      (preview?.fxReview ?? []).filter(item => {
        const entry =
          acceptedRates[fxPairKey(item.baseCurrencyCode, item.currencyCode)];
        return (
          item.suggestedRate != null && entry !== undefined && !entry.trim()
        );
      }),
    [acceptedRates, preview],
  );
  const useCachedRates = clearedSavedRates.length === 0;
  const hasUnappliedRates =
    !sameRates(pendingRates, appliedRates) ||
    useCachedRates !== appliedUseCachedRates;

  const handlePreview = useCallback(() => {
    runPreview(currencyChoices, appliedRates, useCachedRates);
  }, [appliedRates, currencyChoices, runPreview, useCachedRates]);

  const handleChooseCurrency = useCallback(
    (raw: string, code: string) => {
      const next = { ...currencyChoices, [raw.toLowerCase()]: code };
      setCurrencyChoices(next);
      runPreview(next, appliedRates, useCachedRates);
    },
    [appliedRates, currencyChoices, runPreview, useCachedRates],
  );

  // Deferred so the spinner paints before the file is re-parsed; the work is
  // synchronous and would otherwise complete inside the same frame as the press.
  const applyRates = useCallback(
    (rates: Record<string, number>) => {
      setBusy(true);
      setTimeout(() => {
        try {
          runPreview(currencyChoices, rates, useCachedRates);
        } finally {
          setBusy(false);
        }
      }, 0);
    },
    [currencyChoices, runPreview, useCachedRates],
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

  const handleAcceptSuggestion = useCallback(
    (sourceName: string, existingName: string) => {
      setCategoryAliases(current => ({
        ...current,
        [sourceName.toLowerCase()]: existingName,
      }));
    },
    [],
  );

  const handleDeclineSuggestion = useCallback((sourceName: string) => {
    setDeclinedSuggestions(current => [...current, sourceName.toLowerCase()]);
  }, []);

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
    setSkipDuplicates(true);
    setCategoryAliases({});
    setDeclinedSuggestions([]);
    setFundDecisions({});
    setDefaultFundOverride(null);
  }, []);

  const runImport = useCallback(async () => {
    if (!preview) {
      return;
    }
    setBusy(true);
    try {
      const createFunds = Object.entries(fundDecisions)
        .filter(([, decision]) => decision === 'create')
        .map(([key]) => key);
      const fundAliases: Record<string, string> = {};
      Object.entries(fundDecisions).forEach(([key, decision]) => {
        if (decision === 'create') {
          return;
        }
        const target = funds.find(fund => fund.id === decision);
        if (target) {
          fundAliases[key] = target.name;
        }
      });
      const summary = await importTransactions(preview, appliedRates, {
        skipDuplicates,
        categoryAliases,
        createFunds,
        fundAliases,
      });
      Alert.alert(
        'Import complete',
        `${formatExpenseCount(summary.insertedExpenses)}` +
          ` and ${formatIncomeCount(summary.insertedIncome)} imported` +
          (summary.insertedTransfers
            ? `, ${formatTransferCount(summary.insertedTransfers)}`
            : '') +
          (summary.createdCategories
            ? `, ${summary.createdCategories} categor${summary.createdCategories === 1 ? 'y' : 'ies'} created`
            : '') +
          (summary.createdFunds
            ? `, ${summary.createdFunds} fund${summary.createdFunds === 1 ? '' : 's'} created`
            : '') +
          (summary.skippedInvalid
            ? `. ${summary.skippedInvalid} row${summary.skippedInvalid === 1 ? '' : 's'} skipped.`
            : '.') +
          (summary.skippedDuplicates
            ? ` ${summary.skippedDuplicates} duplicate row${summary.skippedDuplicates === 1 ? '' : 's'} skipped.`
            : '') +
          (summary.skippedNeedsFxRate
            ? ` ${summary.skippedNeedsFxRate} row${summary.skippedNeedsFxRate === 1 ? '' : 's'} still need an FX rate.`
            : '') +
          (summary.seededRates.length
            ? `\n\nSaved as your current rates: ${summary.seededRates
                .map(
                  rate =>
                    `1 ${rate.currencyCode} = ${formatFxRate(rate.fxRateToBase)} ${rate.baseCurrencyCode}`,
                )
                .join(', ')}.`
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
  }, [
    appliedRates,
    categoryAliases,
    fundDecisions,
    funds,
    importTransactions,
    preview,
    resetToStart,
    skipDuplicates,
  ]);

  const handleConfirm = useCallback(() => {
    if (!preview || preview.suspectDerivedRates.length === 0) {
      void runImport();
      return;
    }
    Alert.alert(
      'Check the converted amounts',
      `${preview.suspectDerivedRates
        .map(describeSuspectDerivedRate)
        .join('\n\n')}\n\nA Base amount column holding the file's own` +
        ' currency converts nothing. Import anyway?',
      [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Import anyway', onPress: () => void runImport() },
      ],
    );
  }, [preview, runImport]);

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
            {TARGET_FIELDS.map(({ field, label: fieldLabel }) => {
              const label = targetFieldLabel(
                field,
                fieldLabel,
                settings.baseCurrency,
                defaultFund?.currencyCode ?? settings.baseCurrency,
              );
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

            <SelectField
              label="Default fund"
              value={defaultFund?.name ?? 'No fund'}
              onPress={() => setDefaultFundDialogVisible(true)}
              accessibilityLabel="Select default fund"
              accessibilityHint="Opens the fund picker"
            />
            <Text variant="bodySmall" style={styles.muted}>
              Rows that name no fund of their own are filed here.
            </Text>

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
              Number format used in this file
            </Text>
            <SegmentedButtons
              value={numberFormat}
              onValueChange={value => setNumberFormat(value as NumberFormat)}
              buttons={NUMBER_FORMAT_OPTIONS}
            />

            <Text variant="bodySmall" style={styles.muted}>
              In this file, a negative amount means
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
              {readyRows.length} of {preview.totalRows} rows ready to import.
            </Text>
            <Text variant="bodySmall" style={styles.muted}>
              {formatExpenseCount(readyRows.length - incomeReady)} and{' '}
              {formatIncomeCount(incomeReady)}.
            </Text>
            <Text variant="bodySmall" style={styles.muted}>
              Imported rows arrive unconfirmed and are listed under Needs
              attention on Home. A CSV carries no confirmed state, so rows you
              exported and are importing again come back unconfirmed too.
            </Text>

            {preview.mixedCurrencyWithoutBase || hasUnappliedRates ? (
              <View style={styles.section}>
                <Text variant="bodyMedium">Before you can import</Text>
                {preview.mixedCurrencyWithoutBase ? (
                  <View style={styles.bannerBlocking}>
                    <Text variant="bodySmall">
                      This file holds more than one currency, but no base
                      currency is set. Set your base currency in Settings, then
                      import again — otherwise every amount would be stored at
                      face value with nothing to tell the currencies apart.
                    </Text>
                  </View>
                ) : null}
                {hasUnappliedRates ? (
                  <HelperText type="error" visible>
                    {Object.keys(pendingRates).length === 0 &&
                    clearedSavedRates.length > 0
                      ? 'Apply your change to the saved rates before importing.'
                      : 'Apply the rates you entered before importing.'}
                  </HelperText>
                ) : null}
              </View>
            ) : null}

            {needsDecision ? (
              <>
                <Divider />
                <Text variant="bodyMedium">Needs a decision</Text>
              </>
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

            {preview.newFundNames.length > 0 ? (
              <View style={styles.banner}>
                <Text variant="bodyMedium">New funds in this file</Text>
                <Text variant="bodySmall" style={styles.muted}>
                  A fund holds money, so none is created unless you say so. Rows
                  naming a fund you skip land in{' '}
                  {defaultFund?.name ?? 'your default fund'}.
                </Text>
                {preview.newFundNames.map(item => {
                  const key = item.sourceName.toLowerCase();
                  const decision = fundDecisions[key];
                  return (
                    <View key={item.sourceName} style={styles.section}>
                      <Text variant="bodySmall" style={styles.muted}>
                        &quot;{item.sourceName}&quot; ({item.rowCount} row
                        {item.rowCount === 1 ? '' : 's'})
                        {decision === 'create'
                          ? ' — will be created'
                          : typeof decision === 'number'
                            ? ` — filed under ${funds.find(fund => fund.id === decision)?.name ?? ''}`
                            : ` — will use ${defaultFund?.name ?? 'the default fund'}`}
                      </Text>
                      <View style={styles.choiceRow}>
                        <Button
                          mode={
                            decision === 'create' ? 'contained' : 'outlined'
                          }
                          onPress={() =>
                            setFundDecisions(current => ({
                              ...current,
                              [key]: 'create',
                            }))
                          }
                          accessibilityLabel={`Create fund ${item.sourceName}`}
                        >
                          Create it
                        </Button>
                        <Button
                          mode="outlined"
                          onPress={() => setFundTargetForName(key)}
                          accessibilityLabel={`Choose an existing fund for ${item.sourceName}`}
                        >
                          Use existing
                        </Button>
                      </View>
                    </View>
                  );
                })}
              </View>
            ) : null}

            {suggestionsPending.length > 0 ? (
              <View style={styles.section}>
                <Text variant="bodyMedium">Similar categories</Text>
                {suggestionsPending.map(item => (
                  <View key={item.sourceName} style={styles.section}>
                    <Text variant="bodySmall" style={styles.muted}>
                      &quot;{item.sourceName}&quot; ({item.rowCount} row
                      {item.rowCount === 1 ? '' : 's'}) is close to your
                      existing &quot;{item.existingName}&quot;. Use the existing
                      one?
                    </Text>
                    <View style={styles.choiceRow}>
                      <Button
                        mode="contained"
                        onPress={() =>
                          handleAcceptSuggestion(
                            item.sourceName,
                            item.existingName,
                          )
                        }
                        accessibilityLabel={`Use ${item.existingName} for ${item.sourceName}`}
                      >
                        Use {item.existingName}
                      </Button>
                      <Button
                        mode="outlined"
                        onPress={() => handleDeclineSuggestion(item.sourceName)}
                        accessibilityLabel={`Keep ${item.sourceName} separate`}
                      >
                        Keep separate
                      </Button>
                    </View>
                  </View>
                ))}
              </View>
            ) : null}

            {preview.needsFxRate.length > 0 ? (
              <View style={styles.banner}>
                <Text variant="bodySmall">
                  {preview.needsFxRate.length} row
                  {preview.needsFxRate.length === 1 ? '' : 's'} need an FX rate.
                  Enter the rates below, then apply them.
                </Text>
                {preview.needsFxRate.slice(0, MAX_LISTED_ERRORS).map(error => (
                  <Text
                    key={error.line}
                    variant="bodySmall"
                    style={styles.muted}
                  >
                    Line {error.line}: {error.reason}
                  </Text>
                ))}
                {preview.needsFxRate.length > MAX_LISTED_ERRORS ? (
                  <Text variant="bodySmall" style={styles.muted}>
                    …and {preview.needsFxRate.length - MAX_LISTED_ERRORS} more.
                  </Text>
                ) : null}
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
                    <View key={key} style={styles.rateRow}>
                      <TextInput
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
                      {item.suggestedRate != null ? (
                        <Text variant="bodySmall" style={styles.muted}>
                          Filled in from your saved rate: 1 {item.currencyCode}{' '}
                          = {formatFxRate(item.suggestedRate)}{' '}
                          {item.baseCurrencyCode}
                          {item.suggestedRateUpdatedAt
                            ? `, saved on ${formatDateBritish(item.suggestedRateUpdatedAt.slice(0, 10))}`
                            : ''}
                          . {item.rowCount} row
                          {item.rowCount === 1 ? ' is' : 's are'} counted at it
                          — clear the field to hold them back instead.
                        </Text>
                      ) : null}
                    </View>
                  );
                })}
                <Button
                  mode="contained-tonal"
                  onPress={handleApplyRates}
                  disabled={busy || !hasUnappliedRates}
                  accessibilityLabel="Apply FX rates"
                >
                  Apply rates
                </Button>
              </View>
            ) : null}

            {preview.suspectDerivedRates.length > 0 ? (
              <View style={styles.banner}>
                <Text variant="bodySmall">
                  These rates come from the Base amount column, and they do not
                  look like conversions:
                </Text>
                {preview.suspectDerivedRates.map(item => (
                  <Text
                    key={fxPairKey(item.baseCurrencyCode, item.currencyCode)}
                    variant="bodySmall"
                    style={styles.muted}
                  >
                    {describeSuspectDerivedRate(item)}
                  </Text>
                ))}
                <Text variant="bodySmall">
                  A Base amount column must hold the amount in{' '}
                  {settings.baseCurrency ?? 'your base currency'}. If it holds
                  the file&apos;s own currency, go Back and unmap it, then enter
                  a rate instead.
                </Text>
              </View>
            ) : null}

            <Divider />
            <Text variant="bodyMedium">For your information</Text>

            {preview.transferConversions.length > 0 ? (
              <View style={styles.bannerInfo}>
                <Text variant="bodySmall">
                  {preview.transferConversions.reduce(
                    (total, item) => total + item.rowCount,
                    0,
                  )}{' '}
                  transfer
                  {preview.transferConversions.reduce(
                    (total, item) => total + item.rowCount,
                    0,
                  ) === 1
                    ? ''
                    : 's'}{' '}
                  converted using your last saved rate:
                </Text>
                {preview.transferConversions.map(item => (
                  <Text
                    key={fxPairKey(
                      item.currencyCode,
                      item.counterpartCurrencyCode,
                    )}
                    variant="bodySmall"
                    style={styles.muted}
                  >
                    {describeTransferConversion(item)}
                  </Text>
                ))}
              </View>
            ) : null}

            {preview.duplicates.length > 0 ? (
              <View style={styles.bannerInfo}>
                <View style={styles.toggleRow}>
                  <Text variant="bodySmall" style={styles.toggleLabel}>
                    {preview.duplicates.length} row
                    {preview.duplicates.length === 1 ? '' : 's'} match a stored
                    transaction or an earlier row in this file. Skip them?
                  </Text>
                  <Switch
                    value={skipDuplicates}
                    onValueChange={setSkipDuplicates}
                    accessibilityLabel="Skip duplicate rows"
                  />
                </View>
                <Text variant="bodySmall" style={styles.muted}>
                  {skipDuplicates
                    ? `${skippedDuplicateCount} row${skippedDuplicateCount === 1 ? '' : 's'} will not be imported.`
                    : 'They will be added again.'}
                </Text>
              </View>
            ) : null}

            {ratesToBeSaved.length > 0 ? (
              <View style={styles.bannerInfo}>
                <Text variant="bodySmall">
                  These rates will also be saved as your current ones, and
                  filled in when you add a transaction by hand:
                </Text>
                {ratesToBeSaved.map(rate => (
                  <Text
                    key={fxPairKey(rate.baseCurrencyCode, rate.currencyCode)}
                    variant="bodySmall"
                    style={styles.muted}
                  >
                    1 {rate.currencyCode} = {formatFxRate(rate.fxRateToBase)}{' '}
                    {rate.baseCurrencyCode}
                  </Text>
                ))}
              </View>
            ) : null}

            {preview.unmappedColumns.length > 0 ? (
              <View style={styles.bannerInfo}>
                <Text variant="bodySmall">
                  These columns hold values but are not mapped, so they will not
                  be imported. Go Back to map them.
                </Text>
                {preview.unmappedColumns.map(column => (
                  <Text
                    key={column.index}
                    variant="bodySmall"
                    style={styles.muted}
                  >
                    {column.header || `Column ${column.index + 1}`} — e.g.{' '}
                    {column.sampleValue}
                  </Text>
                ))}
              </View>
            ) : null}

            {preview.categoryTypeWidenings.length > 0 ? (
              <View style={styles.bannerInfo}>
                <Text variant="bodySmall">
                  These categories will be changed to work for both income and
                  expenses, because this file files rows against them in both
                  directions:{' '}
                  {preview.categoryTypeWidenings
                    .map(item => item.name)
                    .join(', ')}
                  .
                </Text>
              </View>
            ) : null}

            {preview.unreadableTimes.length > 0 ? (
              <View style={styles.bannerInfo}>
                <Text variant="bodySmall">
                  {preview.unreadableTimes.length} row
                  {preview.unreadableTimes.length === 1 ? '' : 's'} had a time
                  that could not be read and will be imported without one.
                </Text>
              </View>
            ) : null}

            {preview.totalRows > LARGE_IMPORT_THRESHOLD ? (
              <View style={styles.bannerInfo}>
                <Text variant="bodySmall">
                  Large file ({preview.totalRows} rows). Importing may take a
                  moment.
                </Text>
              </View>
            ) : null}

            {preview.signConventionBypassed ? (
              <Text variant="bodySmall" style={styles.muted}>
                This file has no negative amounts, so rows without a type column
                are imported as expenses.
              </Text>
            ) : null}

            {derivedRateCount > 0 &&
            preview.suspectDerivedRates.length === 0 ? (
              <Text variant="bodySmall" style={styles.muted}>
                {derivedRateCount} row{derivedRateCount === 1 ? '' : 's'} used a
                converted amount from the file, keeping the rate the source
                recorded rather than a current one.
              </Text>
            ) : null}

            {newCategoryNames.length > 0 ? (
              <Text variant="bodySmall" style={styles.muted}>
                New categories: {newCategoryNames.join(', ')}
              </Text>
            ) : null}

            {preview.invalid.length > 0 ? (
              <View style={styles.section}>
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

            {allRowsDuplicated ? (
              <HelperText type="error" visible>
                Every row is a duplicate. Turn off skipping above to import them
                again.
              </HelperText>
            ) : null}

            <Button
              mode="contained"
              onPress={handleConfirm}
              disabled={
                busy ||
                readyRows.length === 0 ||
                hasUnappliedRates ||
                preview.mixedCurrencyWithoutBase
              }
              accessibilityLabel="Confirm import"
            >
              Import {readyRows.length} transactions
            </Button>
            <Button onPress={() => setStep('mapping')}>Back</Button>
          </View>
        ) : null}
      </ScrollView>
      <FundPickerDialog
        visible={defaultFundDialogVisible}
        onDismiss={() => setDefaultFundDialogVisible(false)}
        funds={funds}
        selectedId={defaultFund?.id ?? null}
        title="Default fund"
        onSelect={fundId => setDefaultFundOverride(fundId)}
      />
      <FundPickerDialog
        visible={fundTargetForName !== null}
        onDismiss={() => setFundTargetForName(null)}
        funds={funds}
        selectedId={
          fundTargetForName !== null &&
          typeof fundDecisions[fundTargetForName] === 'number'
            ? (fundDecisions[fundTargetForName] as number)
            : null
        }
        title="File these rows under"
        onSelect={fundId => {
          if (fundTargetForName === null) {
            return;
          }
          setFundDecisions(current => ({
            ...current,
            [fundTargetForName]: fundId,
          }));
          setFundTargetForName(null);
        }}
      />
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
    gap: 8,
  },
  bannerBlocking: {
    padding: 12,
    borderRadius: 8,
    backgroundColor: '#fdecea',
  },
  bannerInfo: {
    padding: 12,
    borderRadius: 8,
    backgroundColor: '#eef1f5',
    gap: 8,
  },
  rateRow: {
    gap: 4,
  },
  toggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 12,
  },
  toggleLabel: {
    flex: 1,
  },
  choiceRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
});

export default ImportScreen;
