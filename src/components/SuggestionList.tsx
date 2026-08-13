import React from 'react';
import { StyleSheet } from 'react-native';
import { Divider, List, Surface } from 'react-native-paper';

export type SuggestionListProps = {
  values: readonly string[];
  visible: boolean;
  onSelect: (value: string) => void;
  accessibilityLabel: string;
  testID?: string;
};

/**
 * Values offered beneath a text field, in the order given. Renders nothing when
 * hidden or empty, so a caller can mount it unconditionally.
 *
 * Deliberately not a FlatList: it renders inside the form's ScrollView, where a
 * nested virtualised list breaks scrolling.
 */
const SuggestionList: React.FC<SuggestionListProps> = ({
  values,
  visible,
  onSelect,
  accessibilityLabel,
  testID,
}) => {
  if (!visible || values.length === 0) {
    return null;
  }

  return (
    <Surface
      style={styles.container}
      elevation={2}
      accessibilityLabel={accessibilityLabel}
      testID={testID}
    >
      {values.map((value, index) => (
        <React.Fragment key={value}>
          {index > 0 ? <Divider /> : null}
          <List.Item
            title={value}
            onPress={() => onSelect(value)}
            accessibilityRole="button"
            accessibilityLabel={`Use ${value}`}
            style={styles.item}
          />
        </React.Fragment>
      ))}
    </Surface>
  );
};

const styles = StyleSheet.create({
  container: {
    borderRadius: 4,
    overflow: 'hidden',
  },
  item: {
    paddingVertical: 0,
  },
});

export default SuggestionList;
