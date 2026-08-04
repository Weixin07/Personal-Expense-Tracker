import React, {
  useCallback,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  ActivityIndicator,
  Button,
  Chip,
  Divider,
  IconButton,
  List,
  Surface,
  Text,
  useTheme,
} from 'react-native-paper';
import CategoryPickerDialog from '../components/CategoryPickerDialog';
import CurrencyPickerDialog from '../components/CurrencyPickerDialog';
import { findCurrencyName } from '../constants/currencyOptions';
import { useTransactionData } from '../context/AppContext';
import type { RootStackParamList } from '../navigation/AppNavigator';
import {
  DATE_PRESETS,
  computePresetRange,
  detectPreset,
  formatCurrencyAmount,
  formatDateRangeLabel,
  type DateRangePreset,
} from './homeUtils';
import { formatDateBritish } from '../utils/date';
import { formatMoneyAmount } from '../utils/formatting';
import { INCOME_COLOR_DARK, INCOME_COLOR_LIGHT } from '../theme';
import type { TransactionType } from '../database';

const TYPE_FILTERS: { value: TransactionType; label: string }[] = [
  { value: 'income', label: 'Income' },
  { value: 'expense', label: 'Expense' },
];

const ITEM_HEIGHT = 72;
const baseCurrencyDialogDescription =
  'Select the currency you want to use for totals and conversions. You can change this later in Settings.';

const HomeScreen: React.FC = () => {
  const theme = useTheme();
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const {
    state: {
      settings,
      exportQueue,
      categories,
      filters,
      isInitialised,
      isLoading,
    },
    selectors: { filteredTransactions, totals, hasActiveFilters },
    actions: { refresh, setFilters, setBaseCurrency },
  } = useTransactionData();

  const [refreshing, setRefreshing] = useState(false);
  const [categoryDialogVisible, setCategoryDialogVisible] = useState(false);
  const [baseCurrencyDialogVisible, setBaseCurrencyDialogVisible] =
    useState(false);
  const defaultFiltersAppliedRef = useRef(false);

  // Totals and conversions are meaningless without a base currency, so a launch
  // that finds none opens the picker and holds it open until one is chosen.
  useEffect(() => {
    if (isInitialised && !settings.baseCurrency) {
      setBaseCurrencyDialogVisible(true);
    }
  }, [isInitialised, settings.baseCurrency]);

  useEffect(() => {
    if (!defaultFiltersAppliedRef.current && isInitialised) {
      const noDateFilter = !filters.startDate && !filters.endDate;
      const noCategoryFilter = filters.categoryId == null;
      if (noDateFilter && noCategoryFilter) {
        const range = computePresetRange('last30Days');
        setFilters({
          startDate: range.startDate ?? undefined,
          endDate: range.endDate ?? undefined,
        });
      }
      defaultFiltersAppliedRef.current = true;
    }
  }, [
    filters.startDate,
    filters.endDate,
    filters.categoryId,
    isInitialised,
    setFilters,
  ]);

  const datePreset = useMemo(() => detectPreset(filters), [filters]);
  const dateRangeLabel = useMemo(
    () => formatDateRangeLabel(filters),
    [filters],
  );
  const categoryFilterId = filters.categoryId ?? null;
  const typeFilter = filters.type ?? null;
  const incomeColor = theme.dark ? INCOME_COLOR_DARK : INCOME_COLOR_LIGHT;

  const categoriesMap = useMemo(() => {
    const map = new Map<number, string>();
    categories.forEach(category => {
      map.set(category.id, category.name);
    });
    return map;
  }, [categories]);

  // A figure is rendered only when rows contributed to it, so a single-direction
  // ledger shows one line and an empty result shows none. The list's own empty
  // state is what tells the user nothing matched.
  const totalsLines = useMemo(
    () =>
      totals.byBaseCurrency.flatMap(entry => {
        const code = entry.baseCurrencyCode ?? settings.baseCurrency;
        const lines: string[] = [];
        if (entry.expense.count > 0) {
          lines.push(
            `Expense: ${formatCurrencyAmount(entry.expense.total, code, 'base')}`,
          );
        }
        if (entry.income.count > 0) {
          lines.push(
            `Income: ${formatCurrencyAmount(entry.income.total, code, 'base')}`,
          );
        }
        if (entry.expense.count > 0 && entry.income.count > 0) {
          lines.push(
            `Net: ${formatCurrencyAmount(entry.net.total, code, 'base')}`,
          );
        }
        return lines;
      }),
    [totals.byBaseCurrency, settings.baseCurrency],
  );

  const pendingExports = useMemo(
    () => exportQueue.filter(item => item.status === 'pending').length,
    [exportQueue],
  );

  const baseCurrencyLabel = useMemo(() => {
    if (!settings.baseCurrency) {
      return 'Not set';
    }
    const name = findCurrencyName(settings.baseCurrency);
    return name ? `${settings.baseCurrency} (${name})` : settings.baseCurrency;
  }, [settings.baseCurrency]);

  const handlePresetSelect = useCallback(
    (preset: DateRangePreset) => {
      const range = computePresetRange(preset);
      setFilters({
        startDate: range.startDate ?? undefined,
        endDate: range.endDate ?? undefined,
      });
    },
    [setFilters],
  );

  const handleCategorySelect = useCallback(
    (categoryId: number | null) => {
      setFilters({ categoryId: categoryId ?? undefined });
      setCategoryDialogVisible(false);
    },
    [setFilters],
  );

  const handleClearCategory = useCallback(() => {
    setFilters({ categoryId: undefined });
  }, [setFilters]);

  // Selecting the active direction clears it, so the pair behaves as one
  // three-state control without needing a separate clear affordance.
  const handleTypeSelect = useCallback(
    (value: TransactionType) => {
      setFilters({ type: filters.type === value ? undefined : value });
    },
    [filters.type, setFilters],
  );

  const handleResetFilters = useCallback(() => {
    const range = computePresetRange('last30Days');
    setFilters({
      startDate: range.startDate ?? undefined,
      endDate: range.endDate ?? undefined,
      categoryId: undefined,
      type: undefined,
    });
  }, [setFilters]);

  const handleRefresh = useCallback(async () => {
    setRefreshing(true);
    try {
      await refresh();
    } finally {
      setRefreshing(false);
    }
  }, [refresh]);

  const handleBaseCurrencySelect = useCallback(
    async (option: { code: string }) => {
      try {
        await setBaseCurrency(option.code);
        setBaseCurrencyDialogVisible(false);
      } catch {
        // leave dialog open for retry
      }
    },
    [setBaseCurrency],
  );

  const handleBaseCurrencyDismiss = useCallback(() => {
    if (settings.baseCurrency) {
      setBaseCurrencyDialogVisible(false);
    }
  }, [settings.baseCurrency]);

  const handleAddExpense = useCallback(() => {
    navigation.navigate('AddTransaction');
  }, [navigation]);

  const handleOpenQueue = useCallback(() => {
    navigation.navigate('ExportQueue');
  }, [navigation]);

  const renderTransactionItem = useCallback(
    ({ item }: { item: (typeof filteredTransactions)[number] }) => {
      const categoryName = item.categoryId
        ? categoriesMap.get(item.categoryId)
        : null;
      const payee = item.payee.trim();
      const description = item.description.trim();
      const title = payee || description || '(no payee)';
      const isIncome = item.type === 'income';
      const descriptionParts = [
        formatDateBritish(item.date),
        categoryName ?? 'No category',
        `${formatMoneyAmount(item.amountNative)} ${item.currencyCode}`,
      ];
      if (payee && description) {
        descriptionParts.unshift(description);
      }
      return (
        <List.Item
          style={styles.listItem}
          title={title}
          description={descriptionParts.join(' | ')}
          descriptionNumberOfLines={2}
          onPress={() =>
            navigation.navigate('AddTransaction', { transactionId: item.id })
          }
          accessibilityLabel={`Open ${item.type} ${title}`}
          right={() => (
            <View style={styles.amountContainer}>
              <Text
                style={[
                  styles.listAmount,
                  isIncome ? { color: incomeColor } : null,
                ]}
              >
                {isIncome ? '+' : ''}
                {formatCurrencyAmount(
                  item.baseAmount,
                  item.baseCurrencyCode ?? settings.baseCurrency,
                  'base',
                )}
              </Text>
            </View>
          )}
        />
      );
    },
    [categoriesMap, incomeColor, navigation, settings.baseCurrency],
  );

  const keyExtractor = useCallback(
    (item: (typeof filteredTransactions)[number]) => item.id.toString(),
    [],
  );
  const ItemSeparator = useCallback(() => <Divider />, []);
  const getItemLayout = useCallback(
    (_: unknown, index: number) => ({
      length: ITEM_HEIGHT,
      offset: ITEM_HEIGHT * index,
      index,
    }),
    [],
  );

  const listHeader = useMemo(() => {
    const selectedCategoryName =
      categoryFilterId !== null
        ? (categoriesMap.get(categoryFilterId) ?? 'Unknown category')
        : null;

    return (
      <View style={styles.listHeader}>
        <View style={styles.headerRow}>
          <Text variant="headlineMedium">Transaction Overview</Text>
          <IconButton
            icon="refresh"
            accessibilityLabel="Refresh transactions"
            onPress={handleRefresh}
            disabled={refreshing}
          />
        </View>
        <Text variant="bodyMedium">Base currency: {baseCurrencyLabel}</Text>
        {totalsLines.map(line => (
          <Text key={line} variant="bodyMedium">
            {line}
          </Text>
        ))}
        {totals.mixedBase ? (
          <Text variant="labelSmall" style={styles.metaText}>
            Totals span multiple base currencies and are shown per base.
          </Text>
        ) : null}
        <Text variant="bodyMedium">
          Tracked transactions: {filteredTransactions.length}
        </Text>
        <Text variant="labelLarge" style={styles.metaText}>
          Pending exports: {pendingExports}
        </Text>
        {pendingExports > 5 ? (
          <View
            style={[
              styles.queueBanner,
              {
                backgroundColor: theme.colors.errorContainer,
                borderColor: theme.colors.error,
              },
            ]}
          >
            <Text
              variant="labelSmall"
              style={{ color: theme.colors.onErrorContainer }}
            >
              There are {pendingExports} exports waiting to upload. Connect to
              the internet and upload them soon.
            </Text>
            <Button
              mode="contained-tonal"
              onPress={handleOpenQueue}
              accessibilityLabel="View export queue"
            >
              View export queue
            </Button>
          </View>
        ) : null}
        <Text variant="labelSmall" style={styles.metaText}>
          Date range: {dateRangeLabel}
        </Text>
        {datePreset === 'custom' ? (
          <Text variant="labelSmall" style={styles.metaText}>
            Custom date filters in effect
          </Text>
        ) : null}
        {selectedCategoryName ? (
          <Text variant="labelSmall" style={styles.metaText}>
            Category: {selectedCategoryName}
          </Text>
        ) : null}
        <Button
          mode="contained"
          onPress={handleAddExpense}
          style={styles.addButton}
        >
          Add transaction
        </Button>

        <View style={styles.filtersSection}>
          <Text variant="labelLarge">Quick filters</Text>
          <View style={styles.chipsRow}>
            {DATE_PRESETS.map(preset => (
              <Chip
                key={preset.value}
                selected={datePreset === preset.value}
                onPress={() => handlePresetSelect(preset.value)}
                accessibilityLabel={`Filter ${preset.label}`}
              >
                {preset.label}
              </Chip>
            ))}
            {TYPE_FILTERS.map(option => (
              <Chip
                key={option.value}
                selected={typeFilter === option.value}
                onPress={() => handleTypeSelect(option.value)}
                accessibilityLabel={`Filter ${option.label}`}
              >
                {option.label}
              </Chip>
            ))}
            <Chip
              selected={categoryFilterId !== null}
              onPress={() => setCategoryDialogVisible(true)}
              onClose={
                categoryFilterId !== null ? handleClearCategory : undefined
              }
              accessibilityLabel="Filter by category"
            >
              {categoryFilterId !== null
                ? `Category: ${selectedCategoryName ?? 'Unknown'}`
                : 'Category'}
            </Chip>
            {hasActiveFilters ? (
              <Chip
                onPress={handleResetFilters}
                accessibilityLabel="Reset filters"
              >
                Reset
              </Chip>
            ) : null}
          </View>
        </View>
      </View>
    );
  }, [
    baseCurrencyLabel,
    theme.colors.error,
    theme.colors.errorContainer,
    theme.colors.onErrorContainer,
    categoriesMap,
    categoryFilterId,
    typeFilter,
    handleTypeSelect,
    datePreset,
    dateRangeLabel,
    filteredTransactions.length,
    handleAddExpense,
    handleClearCategory,
    handlePresetSelect,
    handleRefresh,
    handleResetFilters,
    handleOpenQueue,
    hasActiveFilters,
    pendingExports,
    refreshing,
    totalsLines,
    totals.mixedBase,
  ]);

  const listEmptyComponent = useMemo(
    () =>
      isInitialised ? (
        <View style={styles.emptyState}>
          <Text variant="titleMedium">No transactions found</Text>
          <Text variant="bodyMedium" style={styles.emptyBody}>
            Try adjusting your filters or add a new transaction to start
            tracking.
          </Text>
          <Button mode="outlined" onPress={handleAddExpense}>
            Add transaction
          </Button>
        </View>
      ) : null,
    [handleAddExpense, isInitialised],
  );

  if (!isInitialised && isLoading) {
    return (
      <View style={styles.centered}>
        <ActivityIndicator animating size="large" />
      </View>
    );
  }

  return (
    <Surface style={styles.container}>
      <FlatList
        data={filteredTransactions}
        keyExtractor={keyExtractor}
        renderItem={renderTransactionItem}
        ItemSeparatorComponent={ItemSeparator}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={listEmptyComponent}
        ListFooterComponent={<View style={styles.listFooter} />}
        refreshControl={
          <RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />
        }
        contentContainerStyle={styles.listContentContainer}
        initialNumToRender={20}
        windowSize={10}
        maxToRenderPerBatch={20}
        updateCellsBatchingPeriod={50}
        removeClippedSubviews
        getItemLayout={getItemLayout}
      />
      <CurrencyPickerDialog
        visible={baseCurrencyDialogVisible}
        onDismiss={handleBaseCurrencyDismiss}
        onSelect={handleBaseCurrencySelect}
        title="Choose base currency"
        description={baseCurrencyDialogDescription}
        dismissable={Boolean(settings.baseCurrency)}
        showCancelButton={Boolean(settings.baseCurrency)}
      />
      <CategoryPickerDialog
        visible={categoryDialogVisible}
        onDismiss={() => setCategoryDialogVisible(false)}
        categories={categories}
        selectedId={categoryFilterId}
        onSelect={handleCategorySelect}
      />
    </Surface>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  listContentContainer: {
    paddingBottom: 24,
  },
  listHeader: {
    paddingHorizontal: 16,
    paddingTop: 16,
    gap: 12,
  },
  headerRow: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    alignItems: 'center',
  },
  metaText: {
    color: '#6b6b6b',
  },
  queueBanner: {
    borderWidth: 1,
    borderRadius: 8,
    padding: 12,
    gap: 8,
    marginVertical: 8,
  },
  addButton: {
    alignSelf: 'flex-start',
  },
  filtersSection: {
    gap: 8,
  },
  chipsRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  listItem: {
    paddingHorizontal: 16,
    minHeight: ITEM_HEIGHT,
  },
  amountContainer: {
    minWidth: 96,
    alignItems: 'flex-end',
    justifyContent: 'center',
  },
  listAmount: {
    fontWeight: '600',
  },
  emptyState: {
    paddingHorizontal: 16,
    paddingVertical: 40,
    alignItems: 'center',
    gap: 12,
  },
  emptyBody: {
    textAlign: 'center',
    color: '#6b6b6b',
  },
  centered: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
  },
  listFooter: {
    height: 16,
  },
});

export default HomeScreen;
