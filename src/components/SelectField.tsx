import React from 'react';
import { Pressable, View } from 'react-native';
import { TextInput } from 'react-native-paper';

export type SelectFieldProps = {
  label: string;
  value: string;
  onPress: () => void;
  accessibilityLabel: string;
  accessibilityHint?: string;
  error?: boolean;
  icon?: string;
  testID?: string;
};

const SelectField: React.FC<SelectFieldProps> = ({
  label,
  value,
  onPress,
  accessibilityLabel,
  accessibilityHint,
  error = false,
  icon = 'menu-down',
  testID,
}) => (
  <Pressable
    onPress={onPress}
    accessibilityRole="button"
    accessibilityLabel={accessibilityLabel}
    accessibilityHint={accessibilityHint}
    testID={testID}
  >
    <View pointerEvents="none">
      <TextInput
        label={label}
        value={value}
        mode="outlined"
        editable={false}
        error={error}
        right={<TextInput.Icon icon={icon} />}
      />
    </View>
  </Pressable>
);

export default SelectField;
