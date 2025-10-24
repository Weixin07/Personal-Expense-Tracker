import React, { useMemo, useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
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
import { findCurrencyName } from '../constants/currencyOptions';
import { useExpenseData } from '../context/AppContext';
import type { RootStackParamList } from '../navigation/AppNavigator';

const SettingsScreen: React.FC = () => {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const {
    state: { settings, isLoading, exportQueue },
    actions: { setBiometricGateEnabled, setBaseCurrency, setDriveFolderId, uploadQueuedExports },
  } = useExpenseData();

  const [currencyDialogVisible, setCurrencyDialogVisible] = useState(false);
  const [isUploading, setIsUploading] = useState(false);
  const [driveDialogVisible, setDriveDialogVisible] = useState(false);
  const [driveFolderValue, setDriveFolderValue] = useState(settings.driveFolderId ?? '');
  const [savingDriveFolder, setSavingDriveFolder] = useState(false);

  const toggleBiometricGate = () => {
    void setBiometricGateEnabled(!settings.biometricGateEnabled);
  };

  const openCurrencyDialog = () => setCurrencyDialogVisible(true);
  const closeCurrencyDialog = () => setCurrencyDialogVisible(false);

  const handleCurrencySelect = async (option: { code: string }) => {
    try {
      await setBaseCurrency(option.code);
      closeCurrencyDialog();
    } catch {
      // keep dialog open so the user can retry
    }
  };

  const baseCurrencyName = findCurrencyName(settings.baseCurrency);
  const pendingCount = exportQueue.filter(item => item.status === 'pending').length;
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
        Alert.alert('Upload in progress', 'Another upload is still running. Please try again shortly.');
        return;
      }
      if (result.requiresAuth) {
        Alert.alert('Sign in required', 'Please sign in to Google Drive and try again.');
        return;
      }
      if (result.attempted === 0) {
        Alert.alert('Nothing to upload', 'There are no pending exports to upload.');
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
          description="Create, rename, or delete categories"
          right={() => <List.Icon icon="chevron-right" />}
          onPress={() => navigation.navigate('ManageCategories')}
          accessibilityRole="button"
          accessibilityLabel="Manage categories"
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
          title="Drive backup folder"
          description={driveFolderDescription}
          right={() => (
            <List.Icon icon={settings.driveFolderId ? 'check-circle-outline' : 'cloud-outline'} />
          )}
          onPress={openDriveFolderDialog}
          accessibilityRole="button"
          accessibilityLabel="Change Drive backup folder"
        />
        <List.Item
          title="Biometric lock"
          description="Require biometric or device credential after idle period"
          right={() => (
            <Switch
              value={settings.biometricGateEnabled}
              onValueChange={toggleBiometricGate}
              disabled={isLoading}
              accessibilityLabel="Toggle biometric lock"
            />
          )}
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
              Enter a Google Drive folder ID to reuse an existing folder. Leave blank to let the app
              create a new &ldquo;Expense Tracker Backups&rdquo; folder during the next export.
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
              This must correspond to a folder accessible to the Google account you use for exports.
            </HelperText>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={closeDriveFolderDialog} disabled={savingDriveFolder}>
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
