import React, { useState } from 'react';
import { Alert, StyleSheet, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import type { NativeStackNavigationProp } from '@react-navigation/native-stack';
import { Button, List, Surface, Switch, Text } from 'react-native-paper';
import CurrencyPickerDialog from '../components/CurrencyPickerDialog';
import { findCurrencyName } from '../constants/currencyOptions';
import { useExpenseData } from '../context/AppContext';
import type { RootStackParamList } from '../navigation/AppNavigator';

const SettingsScreen: React.FC = () => {
  const navigation = useNavigation<NativeStackNavigationProp<RootStackParamList>>();
  const {
    state: { settings, isLoading, exportQueue },
    actions: { setBiometricGateEnabled, setBaseCurrency, uploadQueuedExports },
  } = useExpenseData();

  const [currencyDialogVisible, setCurrencyDialogVisible] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

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
          description={
            settings.driveFolderId
              ? `Folder ID: ${settings.driveFolderId}`
              : 'Will be created automatically on first upload'
          }
          right={() => (
            <List.Icon icon={settings.driveFolderId ? 'check-circle-outline' : 'cloud-outline'} />
          )}
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
});

export default SettingsScreen;
