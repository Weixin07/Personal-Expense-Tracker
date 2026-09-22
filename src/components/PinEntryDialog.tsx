import React, { useCallback, useEffect, useState } from 'react';
import { AppState, StyleSheet, type AppStateStatus } from 'react-native';
import {
  Button,
  Dialog,
  HelperText,
  Portal,
  Text,
  TextInput,
} from 'react-native-paper';
import { validatePin } from '../utils/validation';

export type PinEntryMode = 'enrol' | 'verify' | 'change';

export type PinEntrySubmission = {
  pin: string;
  currentPin?: string;
};

export type PinEntryDialogProps = {
  visible: boolean;
  mode: PinEntryMode;
  onDismiss: () => void;
  onSubmit: (submission: PinEntrySubmission) => void | Promise<void>;
  title?: string;
  description?: string;
  submitLabel?: string;
  cancelLabel?: string;
  dismissable?: boolean;
  busy?: boolean;
  errorMessage?: string | null;
};

const styles = StyleSheet.create({
  body: { marginBottom: 12 },
  field: { marginBottom: 8 },
});

const defaultTitle: Record<PinEntryMode, string> = {
  enrol: 'Set app PIN',
  verify: 'Enter app PIN',
  change: 'Change app PIN',
};

const PinEntryDialog: React.FC<PinEntryDialogProps> = ({
  visible,
  mode,
  onDismiss,
  onSubmit,
  title,
  description,
  submitLabel = 'Save',
  cancelLabel = 'Cancel',
  dismissable = true,
  busy = false,
  errorMessage = null,
}) => {
  const [currentPin, setCurrentPin] = useState('');
  const [pin, setPin] = useState('');
  const [confirmPin, setConfirmPin] = useState('');
  const [localError, setLocalError] = useState<string | null>(null);

  const needsConfirmation = mode === 'enrol' || mode === 'change';

  // Entry is discarded whenever the dialog opens or closes, so a PIN typed in
  // one session is never left in state for the next. Adjusted during render
  // rather than in an effect so no render ever shows the stale value.
  const [lastVisible, setLastVisible] = useState(visible);
  if (lastVisible !== visible) {
    setLastVisible(visible);
    setCurrentPin('');
    setPin('');
    setConfirmPin('');
    setLocalError(null);
  }

  useEffect(() => {
    if (!visible) {
      return;
    }
    const subscription = AppState.addEventListener(
      'change',
      (nextState: AppStateStatus) => {
        if (nextState === 'background' || nextState === 'inactive') {
          setCurrentPin('');
          setPin('');
          setConfirmPin('');
          setLocalError(null);
        }
      },
    );
    return () => subscription.remove();
  }, [visible]);

  const handleSubmit = useCallback(() => {
    if (mode === 'change' && !currentPin) {
      setLocalError('Enter your current PIN.');
      return;
    }

    if (needsConfirmation) {
      const check = validatePin(pin);
      if (!check.valid) {
        setLocalError(check.message);
        return;
      }
      if (pin !== confirmPin) {
        setLocalError('The two PINs do not match.');
        return;
      }
    } else if (!pin) {
      setLocalError('Enter your PIN.');
      return;
    }

    setLocalError(null);
    void onSubmit(mode === 'change' ? { pin, currentPin } : { pin });
  }, [confirmPin, currentPin, mode, needsConfirmation, onSubmit, pin]);

  const visibleError = localError ?? errorMessage;

  return (
    <Portal>
      <Dialog visible={visible} onDismiss={onDismiss} dismissable={dismissable}>
        <Dialog.Title>{title ?? defaultTitle[mode]}</Dialog.Title>
        <Dialog.Content>
          {description ? (
            <Text variant="bodyMedium" style={styles.body}>
              {description}
            </Text>
          ) : null}
          {mode === 'change' ? (
            <TextInput
              label="Current PIN"
              value={currentPin}
              onChangeText={setCurrentPin}
              mode="outlined"
              secureTextEntry
              keyboardType="number-pad"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="off"
              contextMenuHidden
              editable={!busy}
              style={styles.field}
              accessibilityLabel="Current PIN"
            />
          ) : null}
          <TextInput
            label={needsConfirmation ? 'New PIN' : 'PIN'}
            value={pin}
            onChangeText={setPin}
            mode="outlined"
            secureTextEntry
            keyboardType="number-pad"
            autoCapitalize="none"
            autoCorrect={false}
            autoComplete="off"
            contextMenuHidden
            editable={!busy}
            style={styles.field}
            accessibilityLabel={needsConfirmation ? 'New PIN' : 'PIN'}
          />
          {needsConfirmation ? (
            <TextInput
              label="Confirm new PIN"
              value={confirmPin}
              onChangeText={setConfirmPin}
              mode="outlined"
              secureTextEntry
              keyboardType="number-pad"
              autoCapitalize="none"
              autoCorrect={false}
              autoComplete="off"
              contextMenuHidden
              editable={!busy}
              style={styles.field}
              accessibilityLabel="Confirm new PIN"
            />
          ) : null}
          {visibleError ? (
            <HelperText type="error" visible>
              {visibleError}
            </HelperText>
          ) : null}
        </Dialog.Content>
        <Dialog.Actions>
          <Button onPress={onDismiss} disabled={busy}>
            {cancelLabel}
          </Button>
          <Button
            mode="contained"
            onPress={handleSubmit}
            loading={busy}
            disabled={busy}
            accessibilityLabel={submitLabel}
          >
            {submitLabel}
          </Button>
        </Dialog.Actions>
      </Dialog>
    </Portal>
  );
};

export default PinEntryDialog;
