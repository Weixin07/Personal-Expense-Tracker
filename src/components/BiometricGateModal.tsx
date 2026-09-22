import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { StyleSheet } from 'react-native';
import {
  Button,
  HelperText,
  Modal,
  Portal,
  Text,
  TextInput,
  useTheme,
} from 'react-native-paper';
import type { LockoutStatus } from '../hooks';
import PinEntryDialog from './PinEntryDialog';

export type BiometricGateModalProps = {
  lastError: string | null;
  lockout: LockoutStatus;
  /** `null` while the probe is in flight; `false` on a device with no credential. */
  biometricsAvailable: boolean | null;
  pinUsable: boolean | null;
  /** The gate is on but holds no PIN, so enrolment replaces the unlock prompt. */
  pinSetupRequired: boolean;
  onRetry: () => void;
  onSubmitPin: (pin: string) => Promise<boolean>;
  onSetUpPin: (pin: string) => Promise<void>;
  onDeclineSetup: () => Promise<void>;
};

const styles = StyleSheet.create({
  modalTitle: { marginBottom: 12 },
  modalBody: { marginBottom: 16 },
  modalError: { marginBottom: 16 },
  field: { marginBottom: 8 },
  spacer: { marginTop: 8 },
});

const formatWait = (retryAtMs: number): string => {
  const remainingSeconds = Math.max(
    0,
    Math.ceil((retryAtMs - Date.now()) / 1000),
  );
  if (remainingSeconds < 60) {
    return `${remainingSeconds} seconds`;
  }
  const minutes = Math.ceil(remainingSeconds / 60);
  return `${minutes} minute${minutes === 1 ? '' : 's'}`;
};

export const BiometricGateModal: React.FC<BiometricGateModalProps> = ({
  lastError,
  lockout,
  biometricsAvailable,
  pinUsable,
  pinSetupRequired,
  onRetry,
  onSubmitPin,
  onSetUpPin,
  onDeclineSetup,
}) => {
  const theme = useTheme();
  const biometricsUnavailable = biometricsAvailable === false;
  const [pinRequested, setPinRequested] = useState(false);
  const pinVisible = pinRequested || biometricsUnavailable;
  const [pin, setPin] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [setupError, setSetupError] = useState<string | null>(null);

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

  const handleSubmitPin = useCallback(async () => {
    setSubmitting(true);
    try {
      const unlocked = await onSubmitPin(pin);
      if (!unlocked) {
        setPin('');
      }
    } finally {
      setSubmitting(false);
    }
  }, [onSubmitPin, pin]);

  const handleSetUpPin = useCallback(
    async ({ pin: nextPin }: { pin: string }) => {
      setSubmitting(true);
      setSetupError(null);
      try {
        await onSetUpPin(nextPin);
      } catch (error) {
        setSetupError(
          error instanceof Error ? error.message : 'Could not save the PIN.',
        );
      } finally {
        setSubmitting(false);
      }
    },
    [onSetUpPin],
  );

  const waiting = !lockout.allowed && lockout.retryAtMs !== null;

  // Re-renders the remaining time once a second. The hook owns re-enabling the
  // controls when the wait ends; this only keeps the figure on screen honest.
  const [, setTick] = useState(0);
  useEffect(() => {
    if (!waiting) {
      return;
    }
    const timer = setInterval(() => setTick(current => current + 1), 1000);
    return () => clearInterval(timer);
  }, [waiting]);

  /**
   * An install that predates the PIN reaches Settings only through this modal,
   * so enrolment is offered here, with the decline that turns the lock off.
   */
  if (pinSetupRequired) {
    return (
      <PinEntryDialog
        visible
        mode="enrol"
        dismissable={false}
        onDismiss={() => void onDeclineSetup()}
        onSubmit={handleSetUpPin}
        title="Set an app PIN"
        description="The app lock now needs a PIN so you can still get in when biometrics are unavailable. Turning the lock off instead leaves your data unprotected until you set one."
        cancelLabel="Turn the lock off"
        submitLabel="Set PIN"
        busy={submitting}
        errorMessage={setupError}
      />
    );
  }

  return (
    <Portal>
      <Modal visible dismissable={false} contentContainerStyle={containerStyle}>
        <Text variant="titleLarge" style={styles.modalTitle}>
          Unlock required
        </Text>

        {waiting ? (
          <Text variant="bodyMedium" style={styles.modalBody}>
            {lockout.lockedOut
              ? `Too many incorrect PIN attempts. Try again in ${formatWait(lockout.retryAtMs as number)}.`
              : `Too many attempts. Try again in ${formatWait(lockout.retryAtMs as number)}.`}
          </Text>
        ) : (
          <Text variant="bodyMedium" style={styles.modalBody}>
            {biometricsUnavailable
              ? 'Enter your app PIN to continue.'
              : 'Authenticate with biometrics or your device credentials to continue.'}
          </Text>
        )}

        {lockout.warnAttemptsRemaining ? (
          <Text variant="bodySmall" style={styles.modalBody}>
            {lockout.attemptsRemaining > 0
              ? `${lockout.attemptsRemaining} attempts remaining before a longer lockout.`
              : 'Biometrics still work if they are available.'}
          </Text>
        ) : null}

        {lastError ? (
          <Text
            variant="bodySmall"
            style={[styles.modalError, { color: theme.colors.error }]}
          >
            {lastError}
          </Text>
        ) : null}

        {pinVisible && !waiting ? (
          <>
            <TextInput
              label="App PIN"
              value={pin}
              onChangeText={setPin}
              mode="outlined"
              secureTextEntry
              keyboardType="number-pad"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="off"
              contextMenuHidden
              editable={!submitting}
              style={styles.field}
              accessibilityLabel="App PIN"
            />
            <HelperText type="info" visible>
              Use your PIN when biometrics are unavailable.
            </HelperText>
            <Button
              mode="contained"
              onPress={() => void handleSubmitPin()}
              loading={submitting}
              disabled={submitting || !pin}
              accessibilityLabel="Unlock with PIN"
            >
              Unlock
            </Button>
          </>
        ) : null}

        {!pinVisible || (waiting && !biometricsUnavailable) ? (
          <Button
            mode="contained"
            onPress={onRetry}
            accessibilityLabel="Try biometrics again"
          >
            Try again
          </Button>
        ) : null}

        {!waiting && !biometricsUnavailable && pinUsable !== false ? (
          <Button
            mode="text"
            onPress={() => setPinRequested(current => !current)}
            style={styles.spacer}
            accessibilityLabel={
              pinVisible ? 'Use biometrics instead' : 'Use PIN instead'
            }
          >
            {pinVisible ? 'Use biometrics instead' : 'Use PIN instead'}
          </Button>
        ) : null}
      </Modal>
    </Portal>
  );
};

export default BiometricGateModal;
