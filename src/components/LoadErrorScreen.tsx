import React, { useState } from 'react';
import { StyleSheet } from 'react-native';
import { Button, Surface, Text, useTheme } from 'react-native-paper';

type LoadErrorScreenProps = {
  /** The failure's own message, shown verbatim; the last one stays while busy. */
  detail: string | null;
  busy: boolean;
  onRetry: () => void;
};

/** Stands in for the app while its data cannot be loaded, offering a retry. */
export const LoadErrorScreen: React.FC<LoadErrorScreenProps> = ({
  detail,
  busy,
  onRetry,
}) => {
  const theme = useTheme();
  const [heldDetail, setHeldDetail] = useState(detail);
  if (detail !== null && detail !== heldDetail) {
    setHeldDetail(detail);
  }

  return (
    <Surface style={styles.screen}>
      <Text
        variant="titleLarge"
        accessibilityRole="header"
        style={styles.title}
      >
        {"Couldn't open your data"}
      </Text>
      <Text variant="bodyMedium" style={styles.body}>
        {
          "The app couldn't read its data on this phone. Nothing has been deleted. Try again, and if it keeps happening, restart your phone."
        }
      </Text>
      {heldDetail ? (
        <Text
          variant="bodySmall"
          selectable
          style={[styles.detail, { color: theme.colors.error }]}
        >
          {heldDetail}
        </Text>
      ) : null}
      <Button
        mode="contained"
        onPress={onRetry}
        loading={busy}
        disabled={busy}
        accessibilityLabel="Try opening your data again"
      >
        Try again
      </Button>
    </Surface>
  );
};

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    padding: 24,
  },
  title: { marginBottom: 12, textAlign: 'center' },
  body: { marginBottom: 12, textAlign: 'center' },
  detail: { marginBottom: 20, textAlign: 'center' },
});

export default LoadErrorScreen;
