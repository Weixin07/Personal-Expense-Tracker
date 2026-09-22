import React, { useEffect, useMemo, useState } from 'react';
import { Alert, ScrollView, StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import {
  Button,
  HelperText,
  List,
  Portal,
  Surface,
  Switch,
  Text,
  TextInput,
  Dialog,
} from 'react-native-paper';
import CurrencyPickerDialog from '../components/CurrencyPickerDialog';
import PinEntryDialog, {
  type PinEntryMode,
  type PinEntrySubmission,
} from '../components/PinEntryDialog';
import { findCurrencyName } from '../constants/currencyOptions';
import {
  autoLockLabel,
  getAutoLockPresets,
} from '../constants/autoLockPresets';
import { isAppLockError } from '../security/appLockError';
import { PIN_MAX_LENGTH, PIN_MIN_LENGTH } from '../utils/validation';
import { useTransactionData } from '../context/AppContext';
import type { RootStackParamList } from '../navigation/AppNavigator';

const SettingsScreen: React.FC = () => {
  const navigation =
    useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const {
    state: { settings, isLoading, exportQueue, transactions },
    actions: {
      setBiometricGateEnabled,
      setAutoLockMinutes,
      setAppPin,
      changeAppPin,
      appPinUsable,
      setBaseCurrency,
      setDriveFolderId,
      uploadQueuedExports,
    },
  } = useTransactionData();

  const [currencyDialogVisible, setCurrencyDialogVisible] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [driveDialogVisible, setDriveDialogVisible] = useState(false);
  const [driveFolderValue, setDriveFolderValue] = useState(
    settings.driveFolderId ?? '',
  );
  const [savingDriveFolder, setSavingDriveFolder] = useState(false);
  const [autoLockDialogVisible, setAutoLockDialogVisible] = useState(false);
  const [pinDialogMode, setPinDialogMode] = useState<PinEntryMode | null>(null);
  const [hasPin, setHasPin] = useState(false);
  const [pinBusy, setPinBusy] = useState(false);
  const [pinError, setPinError] = useState<string | null>(null);

  useEffect(() => {
    void appPinUsable().then(setHasPin);
  }, [appPinUsable, settings.biometricGateEnabled]);

  const closePinDialog = () => {
    setPinDialogMode(null);
    setPinError(null);
  };

  const toggleBiometricGate = () => {
    if (!settings.biometricGateEnabled && !hasPin) {
      // Enrolment first, under the rule on `setBiometricGateEnabled`; the toggle
      // follows in handlePinSubmit.
      setPinDialogMode('enrol');
      return;
    }
    if (settings.biometricGateEnabled) {
      Alert.alert(
        'Turn off the app lock?',
        'Your app PIN will be removed. You will need to set a new one to turn the lock back on.',
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Turn off',
            onPress: () => {
              void setBiometricGateEnabled(false);
            },
          },
        ],
      );
      return;
    }
    void setBiometricGateEnabled(true);
  };

  const handlePinSubmit = async ({ pin, currentPin }: PinEntrySubmission) => {
    setPinBusy(true);
    setPinError(null);
    try {
      if (pinDialogMode === 'change') {
        const changed = await changeAppPin(currentPin ?? '', pin);
        if (!changed) {
          setPinError('Current PIN is incorrect, or too many attempts.');
          return;
        }
      } else {
        await setAppPin(pin);
        await setBiometricGateEnabled(true);
      }
      closePinDialog();
    } catch (error) {
      setPinError(
        isAppLockError(error, 'pin-required')
          ? 'Set a PIN first, then the app lock can be turned on.'
          : error instanceof Error
            ? error.message
            : 'Could not save the PIN.',
      );
    } finally {
      setPinBusy(false);
      void appPinUsable().then(setHasPin);
    }
  };

  const applyAutoLock = async (minutes: number | null) => {
    try {
      await setAutoLockMinutes(minutes);
      setAutoLockDialogVisible(false);
    } catch {
      // keep the dialog open so the user can retry
    }
  };

  const openCurrencyDialog = () => setCurrencyDialogVisible(true);
  const closeCurrencyDialog = () => setCurrencyDialogVisible(false);

  const applyBaseCurrency = async (code: string) => {
    try {
      await setBaseCurrency(code);
      closeCurrencyDialog();
    } catch {
      // keep dialog open so the user can retry
    }
  };

  const handleCurrencySelect = async (option: { code: string }) => {
    const isChange =
      Boolean(settings.baseCurrency) && option.code !== settings.baseCurrency;
    if (isChange && transactions.length > 0) {
      Alert.alert(
        'Change base currency?',
        `Existing transactions keep the base currency and FX rate they were saved with. Only new transactions will use ${option.code}, so totals may be shown separately per base currency.`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Change',
            onPress: () => {
              void applyBaseCurrency(option.code);
            },
          },
        ],
      );
      return;
    }
    await applyBaseCurrency(option.code);
  };

  const baseCurrencyName = findCurrencyName(settings.baseCurrency);
  const pendingCount = exportQueue.filter(
    item => item.status === 'pending',
  ).length;
  const driveFolderDescription = useMemo(() => {
    if (settings.driveFolderId) {
      return `Folder ID: ${settings.driveFolderId}`;
    }
    return 'Will be created automatically on first upload';
  }, [settings.driveFolderId]);

  const handleUploadNow = async () => {
    if (isUploading) {
      return;
    }
    setIsUploading(true);
    try {
      const result = await uploadQueuedExports({ interactive: true });
      if (!result) {
        Alert.alert(
          'Upload in progress',
          'Another upload is still running. Please try again shortly.',
        );
        return;
      }
      if (result.requiresAuth) {
        Alert.alert(
          'Sign in required',
          'Please sign in to Google Drive and try again.',
        );
        return;
      }
      if (result.attempted === 0) {
        Alert.alert(
          'Nothing to upload',
          'There are no pending exports to upload.',
        );
        return;
      }
      if (result.failed > 0) {
        Alert.alert(
          'Upload completed with errors',
          result.errors.join('\n') || 'Some exports failed to upload.',
        );
        return;
      }
      Alert.alert(
        'Upload complete',
        `${result.uploaded} export${result.uploaded === 1 ? '' : 's'} uploaded to Google Drive.`,
      );
    } catch (error) {
      Alert.alert(
        'Upload failed',
        error instanceof Error ? error.message : 'Unable to upload exports.',
      );
    } finally {
      setIsUploading(false);
    }
  };

  const openDriveFolderDialog = () => {
    setDriveFolderValue(settings.driveFolderId ?? '');
    setDriveDialogVisible(true);
  };

  const closeDriveFolderDialog = () => {
    if (!savingDriveFolder) {
      setDriveDialogVisible(false);
    }
  };

  const submitDriveFolder = async (rawValue: string) => {
    if (savingDriveFolder) {
      return;
    }
    setDriveFolderValue(rawValue);
    setSavingDriveFolder(true);
    try {
      const trimmed = rawValue.trim();
      await setDriveFolderId(trimmed.length ? trimmed : null);
      setDriveDialogVisible(false);
      Alert.alert(
        'Drive folder updated',
        trimmed.length
          ? 'Future exports will upload to the specified Google Drive folder.'
          : 'The folder will be recreated on the next successful export.',
      );
    } catch (error) {
      Alert.alert(
        'Unable to update folder',
        error instanceof Error ? error.message : 'Please try again later.',
      );
    } finally {
      setSavingDriveFolder(false);
    }
  };

  const handleSaveDriveFolder = async () => submitDriveFolder(driveFolderValue);

  const handleClearDriveFolder = async () => {
    await submitDriveFolder('');
  };

  return (
    <Surface style={styles.container}>
      <ScrollView contentContainerStyle={styles.content}>
        <List.Section>
          <List.Subheader>Preferences</List.Subheader>
          <List.Item
            title="Base currency"
            description={
              settings.baseCurrency
                ? `${settings.baseCurrency} - ${baseCurrencyName ?? 'Unknown currency'}`
                : 'Select a currency'
            }
            right={() => <List.Icon icon="chevron-right" />}
            onPress={openCurrencyDialog}
            accessibilityRole="button"
            accessibilityLabel="Change base currency"
          />
          <List.Item
            title="Categories"
            description="Create, rename, or delete categories and set what each is used for"
            right={() => <List.Icon icon="chevron-right" />}
            onPress={() => navigation.navigate('ManageCategories')}
            accessibilityRole="button"
            accessibilityLabel="Manage categories"
          />
          <List.Item
            title="Funds"
            description="Create, rename, or delete the pots you set money aside in"
            right={() => <List.Icon icon="chevron-right" />}
            onPress={() => navigation.navigate('ManageFunds')}
            accessibilityRole="button"
            accessibilityLabel="Manage funds"
          />
          <List.Item
            title="Export queue"
            description="Review pending exports and retry uploads"
            right={() => <List.Icon icon="chevron-right" />}
            onPress={() => navigation.navigate('ExportQueue')}
            accessibilityRole="button"
            accessibilityLabel="Open export queue"
          />
          <List.Item
            title="Import transactions"
            description="Load transactions from a CSV file or Drive backup"
            right={() => <List.Icon icon="chevron-right" />}
            onPress={() => navigation.navigate('Import')}
            accessibilityRole="button"
            accessibilityLabel="Import transactions"
          />
          <List.Item
            title="Drive backup folder"
            description={driveFolderDescription}
            right={() => (
              <List.Icon
                icon={
                  settings.driveFolderId
                    ? 'check-circle-outline'
                    : 'cloud-outline'
                }
              />
            )}
            onPress={openDriveFolderDialog}
            accessibilityRole="button"
            accessibilityLabel="Change Drive backup folder"
          />
          <List.Item
            title="Biometric lock"
            description="Require biometric, device credential, or app PIN after idle period"
            right={() => (
              <Switch
                value={settings.biometricGateEnabled}
                onValueChange={toggleBiometricGate}
                disabled={isLoading}
                accessibilityLabel="Toggle biometric lock"
              />
            )}
          />
          <List.Item
            title="App PIN"
            description={
              hasPin
                ? 'Change the PIN used when biometrics are unavailable'
                : 'Set a PIN to use when biometrics are unavailable'
            }
            right={() => <List.Icon icon="chevron-right" />}
            onPress={() => setPinDialogMode(hasPin ? 'change' : 'enrol')}
            disabled={isLoading}
            accessibilityRole="button"
            accessibilityLabel={hasPin ? 'Change app PIN' : 'Set app PIN'}
          />
          <List.Item
            title="Auto-lock"
            description={autoLockLabel(settings.autoLockMinutes)}
            right={() => <List.Icon icon="chevron-right" />}
            onPress={() => setAutoLockDialogVisible(true)}
            disabled={isLoading}
            accessibilityRole="button"
            accessibilityLabel="Change auto-lock timing"
          />
        </List.Section>
        <View style={styles.footer}>
          <Text variant="bodySmall" style={styles.helperText}>
            Pending exports: {pendingCount}
          </Text>
          <Button
            mode="contained"
            onPress={handleUploadNow}
            loading={isUploading}
            disabled={isUploading || pendingCount === 0}
            accessibilityLabel="Upload pending exports to Google Drive"
          >
            Upload pending exports
          </Button>
        </View>
      </ScrollView>
      <PinEntryDialog
        visible={pinDialogMode !== null}
        mode={pinDialogMode ?? 'enrol'}
        onDismiss={closePinDialog}
        onSubmit={handlePinSubmit}
        description={`${PIN_MIN_LENGTH} to ${PIN_MAX_LENGTH} digits. Avoid runs and repeats.`}
        busy={pinBusy}
        errorMessage={pinError}
      />
      <Portal>
        <Dialog
          visible={autoLockDialogVisible}
          onDismiss={() => setAutoLockDialogVisible(false)}
        >
          <Dialog.Title>Auto-lock</Dialog.Title>
          <Dialog.Content>
            <Text variant="bodyMedium" style={styles.dialogBody}>
              How long the app may sit in the background before it locks. It
              always locks when reopened from scratch.
            </Text>
            {getAutoLockPresets().map(preset => (
              <List.Item
                key={preset.storageToken}
                title={preset.label}
                right={() =>
                  preset.minutes === settings.autoLockMinutes ? (
                    <List.Icon icon="check" />
                  ) : null
                }
                onPress={() => void applyAutoLock(preset.minutes)}
                accessibilityRole="button"
                accessibilityLabel={preset.label}
              />
            ))}
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={() => setAutoLockDialogVisible(false)}>
              Cancel
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
      <CurrencyPickerDialog
        visible={currencyDialogVisible}
        onDismiss={closeCurrencyDialog}
        onSelect={handleCurrencySelect}
        title="Choose base currency"
        description="Select the currency you want to use for totals and conversions."
      />
      <Portal>
        <Dialog visible={driveDialogVisible} onDismiss={closeDriveFolderDialog}>
          <Dialog.Title>Drive backup folder</Dialog.Title>
          <Dialog.Content>
            <Text variant="bodyMedium" style={styles.dialogBody}>
              Enter a Google Drive folder ID to reuse an existing folder. Leave
              blank to let the app create a new &ldquo;Expense Tracker
              Backups&rdquo; folder during the next export.
            </Text>
            <TextInput
              label="Folder ID (optional)"
              value={driveFolderValue}
              onChangeText={setDriveFolderValue}
              mode="outlined"
              autoCapitalize="none"
              accessibilityLabel="Google Drive folder identifier"
              editable={!savingDriveFolder}
            />
            <HelperText type="info" visible>
              This must correspond to a folder accessible to the Google account
              you use for exports.
            </HelperText>
          </Dialog.Content>
          <Dialog.Actions>
            <Button
              onPress={closeDriveFolderDialog}
              disabled={savingDriveFolder}
            >
              Cancel
            </Button>
            <Button
              onPress={handleClearDriveFolder}
              disabled={savingDriveFolder}
              accessibilityLabel="Reset Drive folder"
            >
              Use default
            </Button>
            <Button
              mode="contained"
              onPress={handleSaveDriveFolder}
              loading={savingDriveFolder}
              disabled={savingDriveFolder}
              accessibilityLabel="Save Drive folder"
            >
              Save
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>
    </Surface>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  content: {
    flexGrow: 1,
    padding: 16,
    justifyContent: 'space-between',
  },
  footer: {
    gap: 8,
  },
  helperText: {
    color: '#6b6b6b',
  },
  dialogBody: {
    marginBottom: 12,
  },
});

export default SettingsScreen;
