import React from 'react';
import { StyleSheet, View } from 'react-native';
import { useTheme } from 'react-native-paper';

/**
 * An opaque full-screen surface in the theme background that hides the app
 * beneath it from sight and touch, and is itself hidden from accessibility.
 */
export const LockCover: React.FC<{ testID?: string }> = ({ testID }) => {
  const theme = useTheme();
  return (
    <View
      testID={testID}
      style={[
        StyleSheet.absoluteFill,
        { backgroundColor: theme.colors.background },
      ]}
      accessible={false}
      importantForAccessibility="no-hide-descendants"
      onStartShouldSetResponder={() => true}
    />
  );
};

export default LockCover;
