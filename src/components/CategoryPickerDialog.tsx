import React, { useMemo, useState } from 'react';
import { FlatList, StyleSheet } from 'react-native';
import { Button, Dialog, List, Portal, Searchbar } from 'react-native-paper';
import { CATEGORY_TYPE_LABELS } from '../constants/categoryTypeLabels';
import type {
  CategoryRecord,
  CategoryType,
  TransactionType,
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
  directionFilter?: TransactionType;
  onSelect: (categoryId: number | null) => void;
  onDismiss: () => void;
};

const buildOptions = (
  categories: CategoryRecord[],
  directionFilter?: TransactionType,
): CategoryOption[] => {
  const eligible = directionFilter
    ? categories.filter(
        category =>
          category.type === directionFilter || category.type === 'both',
      )
    : categories;
  const sorted = [...eligible].sort((a, b) => a.name.localeCompare(b.name));
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
  onSelect,
  onDismiss,
}) => {
  const [query, setQuery] = useState('');

  const options = useMemo(
    () => buildOptions(categories, directionFilter),
    [categories, directionFilter],
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
          <Searchbar
            placeholder="Search category"
            value={query}
            onChangeText={setQuery}
            accessibilityLabel="Search category"
            style={styles.searchbar}
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
  searchbar: { marginBottom: 12 },
  list: { maxHeight: 300 },
});

export default CategoryPickerDialog;
