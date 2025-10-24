import React, { useCallback, useEffect, useMemo, useRef, useState } from 'react';
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
} from 'react-native-paper';
import CategoryPickerDialog from '../components/CategoryPickerDialog';
import CurrencyPickerDialog from '../components/CurrencyPickerDialog';
import { findCurrencyName } from '../constants/currencyOptions';
import { useExpenseData } from '../context/AppContext';
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

const ITEM_HEIGHT = 72;
const baseCurrencyDialogDescription = 'Select the currency you want to use for totals and conversions. You can change this later in Settings.';

const HomeScreen: React.FC = () => {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const {
    state: { settings, exportQueue, categories, filters, isInitialised, isLoading },
    selectors: { filteredExpenses, totals, hasActiveFilters },
    actions: { refresh, setFilters, setBaseCurrency },
  } = useExpenseData();

  const [refreshing, setRefreshing] = useState(false);
  const [categoryDialogVisible, setCategoryDialogVisible] = useState(false);
  const [baseCurrencyDialogVisible, setBaseCurrencyDialogVisible] = useState(false);
  const defaultFiltersAppliedRef = useRef(false);

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
  }, [filters.startDate, filters.endDate, filters.categoryId, isInitialised, setFilters]);

  const datePreset = useMemo(() => detectPreset(filters), [filters]);
  const dateRangeLabel = useMemo(() => formatDateRangeLabel(filters), [filters]);
  const categoryFilterId = filters.categoryId ?? null;

  const categoriesMap = useMemo(() => {
    const map = new Map<number, string>();
    categories.forEach(category => {
      map.set(category.id, category.name);
    });
    return map;
  }, [categories]);

  const totalsLabel = useMemo(
    () => formatCurrencyAmount(totals.baseAmount, settings.baseCurrency, 'base'),
    [totals.baseAmount, settings.baseCurrency],
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

  const handleResetFilters = useCallback(() => {
    const range = computePresetRange('last30Days');
    setFilters({
      startDate: range.startDate ?? undefined,
      endDate: range.endDate ?? undefined,
      categoryId: undefined,
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
    navigation.navigate('AddExpense');
  }, [navigation]);

  const handleOpenQueue = useCallback(() => {
    navigation.navigate('ExportQueue');
  }, [navigation]);

  const renderExpenseItem = useCallback(
    ({ item }: { item: typeof filteredExpenses[number] }) => {
      const categoryName = item.categoryId ? categoriesMap.get(item.categoryId) : null;
      const descriptionParts = [
        formatDateBritish(item.date),
        categoryName ?? 'No category',
        `${item.amountNative.toFixed(2)} ${item.currencyCode}`,
      ];
      return (
        <List.Item
          style={styles.listItem}
          title={item.description}
          description={descriptionParts.join(' | ')}
          descriptionNumberOfLines={2}
          onPress={() => navigation.navigate('AddExpense', { expenseId: item.id })}
          accessibilityLabel={`Open expense ${item.description}`}
          right={() => (
            <View style={styles.amountContainer}>
              <Text style={styles.listAmount}>
                {formatCurrencyAmount(item.baseAmount, settings.baseCurrency, 'base')}
              </Text>
            </View>
          )}
        />
      );
    },
    [categoriesMap, navigation, settings.baseCurrency],
  );

  const keyExtractor = useCallback((item: typeof filteredExpenses[number]) => item.id.toString(), []);
  const ItemSeparator = useCallback(() => <Divider />, []);
  const getItemLayout = useCallback(
    (_: unknown, index: number) => ({ length: ITEM_HEIGHT, offset: ITEM_HEIGHT * index, index }),
    [],
  );

  const listHeader = useMemo(() => {
    const selectedCategoryName =
      categoryFilterId !== null ? categoriesMap.get(categoryFilterId) ?? 'Unknown category' : null;

    return (
      <View style={styles.listHeader}>
        <View style={styles.headerRow}>
          <Text variant="headlineMedium">Expense Overview</Text>
          <IconButton
            icon="refresh"
            accessibilityLabel="Refresh expenses"
            onPress={handleRefresh}
            disabled={refreshing}
          />
        </View>
        <Text variant="bodyMedium">Base currency: {baseCurrencyLabel}</Text>
        <Text variant="bodyMedium">Total (base): {totalsLabel}</Text>
        <Text variant="bodyMedium">Tracked expenses: {filteredExpenses.length}</Text>
        <Text variant="labelLarge" style={styles.metaText}>Pending exports: {pendingExports}</Text>
        {pendingExports > 5 ? (
          <View style={styles.queueBanner}>
            <Text variant="labelSmall">
              There are {pendingExports} exports waiting to upload. Connect to the internet and upload them soon.
            </Text>
            <Button mode="contained-tonal" onPress={handleOpenQueue} accessibilityLabel="View export queue">
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
        <Button mode="contained" onPress={handleAddExpense} style={styles.addButton}>
          Add expense
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
            <Chip
              selected={categoryFilterId !== null}
              onPress={() => setCategoryDialogVisible(true)}
              onClose={categoryFilterId !== null ? handleClearCategory : undefined}
              accessibilityLabel="Filter by category"
            >
              {categoryFilterId !== null
                ? `Category: ${selectedCategoryName ?? 'Unknown'}`
                : 'Category'}
            </Chip>
            {hasActiveFilters ? (
              <Chip onPress={handleResetFilters} accessibilityLabel="Reset filters">
                Reset
              </Chip>
            ) : null}
          </View>
        </View>
      </View>
    );
  }, [
    baseCurrencyLabel,
    categoriesMap,
    categoryFilterId,
    datePreset,
    dateRangeLabel,
    filteredExpenses.length,
    handleAddExpense,
    handleClearCategory,
    handlePresetSelect,
    handleRefresh,
    handleResetFilters,
    handleOpenQueue,
    hasActiveFilters,
    pendingExports,
    refreshing,
    totalsLabel,
  ]);

  const listEmptyComponent = useMemo(
    () =>
      isInitialised ? (
        <View style={styles.emptyState}>
          <Text variant="titleMedium">No expenses found</Text>
          <Text variant="bodyMedium" style={styles.emptyBody}>
            Try adjusting your filters or add a new expense to start tracking.
          </Text>
          <Button mode="outlined" onPress={handleAddExpense}>
            Add expense
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
        data={filteredExpenses}
        keyExtractor={keyExtractor}
        renderItem={renderExpenseItem}
        ItemSeparatorComponent={ItemSeparator}
        ListHeaderComponent={listHeader}
        ListEmptyComponent={listEmptyComponent}
        ListFooterComponent={<View style={styles.listFooter} />}
        refreshControl={<RefreshControl refreshing={refreshing} onRefresh={handleRefresh} />}
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
