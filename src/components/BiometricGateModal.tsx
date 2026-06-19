import React, { useMemo } from 'react';
import { StyleSheet } from 'react-native';
import { Button, Modal, Portal, Text, useTheme } from 'react-native-paper';

export type BiometricGateModalProps = {
  lastError: string | null;
  onRetry: () => void;
};

const styles = StyleSheet.create({
  modalTitle: { marginBottom: 12 },
  modalBody: { marginBottom: 16 },
  modalError: { marginBottom: 16 },
});

export const BiometricGateModal: React.FC<BiometricGateModalProps> = ({
  lastError,
  onRetry,
}) => {
  const theme = useTheme();

  const containerStyle = useMemo(
    () => ({
      backgroundColor: theme.colors.surface,
      marginHorizontal: 24,
      padding: 24,
      borderRadius: 16,
      elevation: 6,
    }),
    [theme.colors.surface],
  );

  return (
    <Portal>
      <Modal visible dismissable={false} contentContainerStyle={containerStyle}>
        <Text variant="titleLarge" style={styles.modalTitle}>
          Unlock required
        </Text>
        <Text variant="bodyMedium" style={styles.modalBody}>
          Authenticate with biometrics or your device credentials to continue.
        </Text>
        {lastError ? (
          <Text
            variant="bodySmall"
            style={[styles.modalError, { color: theme.colors.error }]}
          >
            {lastError}
          </Text>
        ) : null}
        <Button mode="contained" onPress={onRetry}>
          Try again
        </Button>
      </Modal>
    </Portal>
  );
};

export default BiometricGateModal;
