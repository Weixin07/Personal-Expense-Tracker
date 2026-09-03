import React from 'react';
import { StyleSheet } from 'react-native';
import { Searchbar } from 'react-native-paper';

export type SearchFieldProps = {
  value: string;
  onChangeText: (value: string) => void;
  placeholder: string;
  /**
   * Names what this field searches. Required because a screen may show several,
   * and identical labels leave a screen reader unable to tell them apart.
   */
  accessibilityLabel: string;
  testID?: string;
};

/**
 * A controlled search input. Owns the control only — what a query matches is
 * the caller's, since each caller searches a different shape of thing.
 *
 * Reports every keystroke. A caller wanting to act on the settled value rather
 * than each character debounces what it does with the value, not the display.
 */
const SearchField: React.FC<SearchFieldProps> = ({
  value,
  onChangeText,
  placeholder,
  accessibilityLabel,
  testID,
}) => (
  <Searchbar
    placeholder={placeholder}
    value={value}
    onChangeText={onChangeText}
    accessibilityLabel={accessibilityLabel}
    testID={testID}
    style={styles.searchbar}
  />
);

const styles = StyleSheet.create({
  searchbar: { marginBottom: 12 },
});

export default SearchField;
