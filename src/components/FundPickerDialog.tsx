import React, { useMemo, useState } from 'react';
import { FlatList, StyleSheet } from 'react-native';
import { Button, Dialog, List, Portal } from 'react-native-paper';
import SearchField from './SearchField';
import { EMPTY_CATEGORY_USAGE } from '../utils/suggestions';
import type { CategoryUsage } from '../utils/suggestions';
import type { FundRecord } from '../database';

export type FundPickerDialogProps = {
  visible: boolean;
  funds: FundRecord[];
  selectedId: number | null;
  /** Omitted from the list, so a transfer cannot pick the fund it leaves. */
  excludeId?: number | null;
  /** Orders the list by how much each fund is used. Omit to order by name. */
  usageCounts?: ReadonlyMap<number, CategoryUsage>;
  title?: string;
  onSelect: (fundId: number) => void;
  onDismiss: () => void;
};

const compareByUsage = (
  a: FundRecord,
  b: FundRecord,
  usageCounts: ReadonlyMap<number, CategoryUsage>,
): number => {
  const usageA = usageCounts.get(a.id) ?? EMPTY_CATEGORY_USAGE;
  const usageB = usageCounts.get(b.id) ?? EMPTY_CATEGORY_USAGE;
  if (usageA.inWindow !== usageB.inWindow) {
    return usageB.inWindow - usageA.inWindow;
  }
  if (usageA.older !== usageB.older) {
    return usageB.older - usageA.older;
  }
  return a.name.localeCompare(b.name);
};

/**
 * Every transaction belongs to a fund, so unlike the category picker this offers
 * no "none" option.
 */
const FundPickerDialog: React.FC<FundPickerDialogProps> = ({
  visible,
  funds,
  selectedId,
  excludeId,
  usageCounts,
  title = 'Choose fund',
  onSelect,
  onDismiss,
}) => {
  const [query, setQuery] = useState('');

  const options = useMemo(() => {
    const eligible =
      excludeId == null ? funds : funds.filter(fund => fund.id !== excludeId);
    return [...eligible].sort((a, b) =>
      usageCounts
        ? compareByUsage(a, b, usageCounts)
        : a.name.localeCompare(b.name),
    );
  }, [funds, excludeId, usageCounts]);

  const filteredOptions = useMemo(() => {
    if (!query) {
      return options;
    }
    const lower = query.trim().toLowerCase();
    return options.filter(option => option.name.toLowerCase().includes(lower));
  }, [query, options]);

  const handleSelect = (fundId: number) => {
    onSelect(fundId);
    setQuery('');
    onDismiss();
  };

  const handleDismiss = () => {
    setQuery('');
    onDismiss();
  };

  return (
    <Portal>
      <Dialog visible={visible} onDismiss={handleDismiss}>
        <Dialog.Title accessibilityRole="header">{title}</Dialog.Title>
        <Dialog.Content>
          <SearchField
            placeholder="Search fund"
            value={query}
            onChangeText={setQuery}
            accessibilityLabel="Search fund"
          />
          <FlatList
            data={filteredOptions}
            keyExtractor={item => String(item.id)}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <List.Item
                title={item.name}
                description={item.currencyCode ?? undefined}
                onPress={() => handleSelect(item.id)}
                accessibilityRole="button"
                accessibilityLabel={`Select ${item.name}`}
                right={() =>
                  selectedId === item.id ? <List.Icon icon="check" /> : null
                }
              />
            )}
            style={styles.list}
          />
        </Dialog.Content>
        <Dialog.Actions>
          <Button
            onPress={handleDismiss}
            accessibilityLabel="Cancel fund selection"
          >
            Cancel
          </Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
};

const styles = StyleSheet.create({
  list: { maxHeight: 300 },
});

export default FundPickerDialog;
