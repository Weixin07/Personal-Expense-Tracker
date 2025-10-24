import React, { useMemo, useState } from "react";
import { FlatList } from "react-native";
import { Button, Dialog, List, Portal, Searchbar } from "react-native-paper";
import type { CategoryRecord } from "../database";

type CategoryOption = { id: number | null; name: string };

export type CategoryPickerDialogProps = {
  visible: boolean;
  categories: CategoryRecord[];
  selectedId: number | null;
  onSelect: (categoryId: number | null) => void;
  onDismiss: () => void;
};

const buildOptions = (categories: CategoryRecord[]): CategoryOption[] => {
  const sorted = [...categories].sort((a, b) => a.name.localeCompare(b.name));
  return [{ id: null, name: 'No category' }, ...sorted.map(category => ({ id: category.id, name: category.name }))];
};

const CategoryPickerDialog: React.FC<CategoryPickerDialogProps> = ({
  visible,
  categories,
  selectedId,
  onSelect,
  onDismiss,
}) => {
  const [query, setQuery] = useState("");

  const options = useMemo(() => buildOptions(categories), [categories]);

  const filteredOptions = useMemo(() => {
    if (!query) {
      return options;
    }
    const lower = query.trim().toLowerCase();
    return options.filter(option => option.name.toLowerCase().includes(lower));
  }, [query, options]);

  const handleSelect = (categoryId: number | null) => {
    onSelect(categoryId);
    setQuery("");
    onDismiss();
  };

  const handleDismiss = () => {
    setQuery("");
    onDismiss();
  };

  return (
    <Portal>
      <Dialog
        visible={visible}
        onDismiss={handleDismiss}
        accessibilityLabel="Category selection dialog"
      >
        <Dialog.Title accessibilityRole="header">Choose category</Dialog.Title>
        <Dialog.Content>
          <Searchbar
            placeholder="Search category"
            value={query}
            onChangeText={setQuery}
            accessibilityLabel="Search category"
            style={{ marginBottom: 12 }}
          />
          <FlatList
            data={filteredOptions}
            keyExtractor={item => (item.id === null ? 'none' : String(item.id))}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <List.Item
                title={item.name}
                onPress={() => handleSelect(item.id)}
                accessibilityRole="button"
                accessibilityLabel={`Select ${item.name}`}
                right={() =>
                  selectedId === item.id ? (
                    <List.Icon icon="check" accessibilityLabel="Selected category" />
                  ) : null
                }
              />
            )}
            style={{ maxHeight: 300 }}
          />
        </Dialog.Content>
        <Dialog.Actions>
          <Button onPress={handleDismiss} accessibilityLabel="Cancel category selection">
            Cancel
          </Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
};

export default CategoryPickerDialog;