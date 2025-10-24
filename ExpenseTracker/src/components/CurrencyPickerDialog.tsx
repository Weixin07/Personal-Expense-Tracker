import React, { useMemo, useState } from "react";
import { FlatList } from "react-native";
import {
  Button,
  Dialog,
  IconButton,
  List,
  Portal,
  Searchbar,
  Text,
} from "react-native-paper";
import { getCurrencyOptions, type CurrencyOption } from "../constants/currencyOptions";

export type CurrencyPickerDialogProps = {
  visible: boolean;
  onDismiss: () => void;
  onSelect: (currency: CurrencyOption) => void;
  title?: string;
  description?: string;
  cancelLabel?: string;
  dismissable?: boolean;
  showCancelButton?: boolean;
};

const currencyOptions = getCurrencyOptions();

const CurrencyPickerDialog: React.FC<CurrencyPickerDialogProps> = ({
  visible,
  onDismiss,
  onSelect,
  title = "Choose currency",
  description,
  cancelLabel = "Cancel",
  dismissable = true,
  showCancelButton = true,
}) => {
  const [query, setQuery] = useState("");

  const filteredOptions = useMemo(() => {
    if (!query) {
      return currencyOptions;
    }
    const lowerQuery = query.trim().toLowerCase();
    return currencyOptions.filter(option =>
      option.code.toLowerCase().includes(lowerQuery) ||
      option.name.toLowerCase().includes(lowerQuery),
    );
  }, [query]);

  const handleSelect = (option: CurrencyOption) => {
    onSelect(option);
    setQuery("");
  };

  const handleDismiss = () => {
    if (!dismissable) {
      return;
    }
    setQuery("");
    onDismiss();
  };

  return (
    <Portal>
      <Dialog
        visible={visible}
        onDismiss={handleDismiss}
        dismissable={dismissable}
        accessibilityLabel={`${title} dialog`}
      >
        <Dialog.Title accessibilityRole="header">{title}</Dialog.Title>
        <Dialog.Content>
          {description ? (
            <Text variant="bodyMedium" style={{ marginBottom: 8 }}>
              {description}
            </Text>
          ) : null}
          <Searchbar
            placeholder="Search currency"
            value={query}
            onChangeText={setQuery}
            accessibilityLabel="Search currency"
            style={{ marginBottom: 12 }}
          />
          <FlatList
            data={filteredOptions}
            keyExtractor={({ code }) => code}
            keyboardShouldPersistTaps="handled"
            renderItem={({ item }) => (
              <List.Item
                title={`${item.code}`}
                description={item.name}
                onPress={() => handleSelect(item)}
                accessibilityRole="button"
                accessibilityLabel={`Select ${item.name}`}
                right={() => <IconButton icon="check" accessibilityLabel={`Use ${item.code}`} />}
              />
            )}
            style={{ maxHeight: 320 }}
          />
        </Dialog.Content>
        {showCancelButton ? (
          <Dialog.Actions>
            <Button onPress={handleDismiss} accessibilityLabel={`${cancelLabel} currency selection`}>
              {cancelLabel}
            </Button>
          </Dialog.Actions>
        ) : null}
      </Dialog>
    </Portal>
  );
};

export default CurrencyPickerDialog;
