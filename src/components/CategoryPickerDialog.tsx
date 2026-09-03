import React, { useMemo, useState } from 'react';
import { FlatList, StyleSheet } from 'react-native';
import { Button, Dialog, List, Portal } from 'react-native-paper';
import SearchField from './SearchField';
import { CATEGORY_TYPE_LABELS } from '../constants/categoryTypeLabels';
import { EMPTY_CATEGORY_USAGE } from '../utils/suggestions';
import type { CategoryUsage } from '../utils/suggestions';
import type {
  CategoryRecord,
  CategoryType,
  TransactionDirection,
} from '../database';

type CategoryOption = {
  id: number | null;
  name: string;
  type: CategoryType | null;
};

export type CategoryPickerDialogProps = {
  visible: boolean;
  categories: CategoryRecord[];
  selectedId: number | null;
  /**
   * Restricts the list to categories usable for this direction — a matching
   * type, or `both`. Omit to offer every category.
   */
  directionFilter?: TransactionDirection;
  /**
   * Orders the list by how much each category is used. Omit to order by name.
   */
  usageCounts?: ReadonlyMap<number, CategoryUsage>;
  onSelect: (categoryId: number | null) => void;
  onDismiss: () => void;
};

const compareByUsage = (
  a: CategoryRecord,
  b: CategoryRecord,
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

const buildOptions = (
  categories: CategoryRecord[],
  directionFilter?: TransactionDirection,
  usageCounts?: ReadonlyMap<number, CategoryUsage>,
): CategoryOption[] => {
  const eligible = directionFilter
    ? categories.filter(
        category =>
          category.type === directionFilter || category.type === 'both',
      )
    : categories;
  const sorted = [...eligible].sort((a, b) =>
    usageCounts
      ? compareByUsage(a, b, usageCounts)
      : a.name.localeCompare(b.name),
  );
  return [
    { id: null, name: 'No category', type: null },
    ...sorted.map(category => ({
      id: category.id,
      name: category.name,
      type: category.type,
    })),
  ];
};

const CategoryPickerDialog: React.FC<CategoryPickerDialogProps> = ({
  visible,
  categories,
  selectedId,
  directionFilter,
  usageCounts,
  onSelect,
  onDismiss,
}) => {
  const [query, setQuery] = useState('');

  const options = useMemo(
    () => buildOptions(categories, directionFilter, usageCounts),
    [categories, directionFilter, usageCounts],
  );

  const filteredOptions = useMemo(() => {
    if (!query) {
      return options;
    }
    const lower = query.trim().toLowerCase();
    return options.filter(option => option.name.toLowerCase().includes(lower));
  }, [query, options]);

  const handleSelect = (categoryId: number | null) => {
    onSelect(categoryId);
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
        <Dialog.Title accessibilityRole="header">Choose category</Dialog.Title>
        <Dialog.Content>
          <SearchField
            placeholder="Search category"
            value={query}
            onChangeText={setQuery}
            accessibilityLabel="Search category"
          />
          <FlatList
            data={filteredOptions}
            keyExtractor={item => (item.id === null ? 'none' : String(item.id))}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <List.Item
                title={item.name}
                description={
                  item.type ? CATEGORY_TYPE_LABELS[item.type] : undefined
                }
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
            accessibilityLabel="Cancel category selection"
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

export default CategoryPickerDialog;
