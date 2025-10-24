import React, { useCallback, useMemo, useState } from 'react';
import { Alert, FlatList, StyleSheet, View } from 'react-native';
import {
  Button,
  Chip,
  Divider,
  IconButton,
  List,
  Surface,
  Text,
} from 'react-native-paper';
import { useExpenseData } from '../context/AppContext';

const statusLabels: Record<string, string> = {
  pending: 'Pending upload',
  uploading: 'Uploading',
  completed: 'Uploaded',
  failed: 'Failed',
};

const ExportQueueScreen: React.FC = () => {
  const {
    state: { exportQueue, settings },
    actions: { queueExport, retryExport, removeExport, clearCompletedExports, uploadQueuedExports },
  } = useExpenseData();

  const [isQueueing, setIsQueueing] = useState(false);
  const [isClearing, setIsClearing] = useState(false);
  const [isUploading, setIsUploading] = useState(false);

  const pendingCount = useMemo(
    () => exportQueue.filter(item => item.status === 'pending').length,
    [exportQueue],
  );

  const handleQueueExport = useCallback(async () => {
    setIsQueueing(true);
    try {
      await queueExport();
    } catch (error) {
      Alert.alert('Export failed', error instanceof Error ? error.message : 'Unable to queue export.');
    } finally {
      setIsQueueing(false);
    }
  }, [queueExport]);

  const handleRetry = useCallback(
    async (id: string) => {
      try {
        await retryExport(id);
      } catch (error) {
        Alert.alert('Retry failed', error instanceof Error ? error.message : 'Unable to retry export.');
      }
    },
    [retryExport],
  );

  const handleRemove = useCallback(
    (id: string) => {
      Alert.alert('Remove export', 'Remove this export from the queue?', [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Remove',
          style: 'destructive',
          onPress: async () => {
            try {
              await removeExport(id);
            } catch (error) {
              Alert.alert('Remove failed', error instanceof Error ? error.message : 'Unable to remove export.');
            }
          },
        },
      ]);
    },
    [removeExport],
  );

  const handleClearCompleted = useCallback(async () => {
    setIsClearing(true);
    try {
      await clearCompletedExports();
    } catch (error) {
      Alert.alert('Clear failed', error instanceof Error ? error.message : 'Unable to clear exports.');
    } finally {
      setIsClearing(false);
    }
  }, [clearCompletedExports]);

  const handleUploadNow = useCallback(async () => {
    if (isUploading) {
      return;
    }
    setIsUploading(true);
    try {
      const result = await uploadQueuedExports({ interactive: true });
      if (!result) {
        Alert.alert('Upload in progress', 'Another upload is already running. Please try again shortly.');
        return;
      }
      if (result.requiresAuth) {
        Alert.alert('Sign in required', 'Please sign in to Google Drive and retry the upload.');
        return;
      }
      if (result.attempted === 0) {
        Alert.alert('Nothing to upload', 'No pending exports are available for upload.');
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
        `${result.uploaded} export${result.uploaded === 1 ? '' : 's'} uploaded successfully.`,
      );
    } catch (error) {
      Alert.alert('Upload failed', error instanceof Error ? error.message : 'Unable to upload exports.');
    } finally {
      setIsUploading(false);
    }
  }, [isUploading, uploadQueuedExports]);

  const renderItem = useCallback(
    ({ item }: { item: typeof exportQueue[number] }) => {
      const created = new Date(item.createdAt).toLocaleString();
      const updated = new Date(item.updatedAt).toLocaleString();
      const statusLabel = statusLabels[item.status] ?? item.status;
      const uploaded = item.uploadedAt ? new Date(item.uploadedAt).toLocaleString() : null;
      const descriptionLines = [`Status: ${statusLabel}`, `Created: ${created}`, `Updated: ${updated}`];
      if (uploaded) {
        descriptionLines.push(`Uploaded: ${uploaded}`);
      }
      if (item.driveFileId) {
        descriptionLines.push(`Drive file ID: ${item.driveFileId}`);
      }

      return (
        <List.Item
          title={item.filename}
          description={descriptionLines.join('\n')}
          descriptionNumberOfLines={5}
          right={() => (
            <View style={styles.rowActions}>
              {item.status === 'failed' ? (
                <IconButton
                  icon="refresh"
                  accessibilityLabel="Retry export"
                  onPress={() => handleRetry(item.id)}
                />
              ) : null}
              <IconButton
                icon="delete"
                accessibilityLabel="Remove export"
                onPress={() => handleRemove(item.id)}
              />
            </View>
          )}
        />
      );
    },
    [handleRemove, handleRetry],
  );

  const keyExtractor = useCallback((item: typeof exportQueue[number]) => item.id, []);

  return (
    <Surface style={styles.container}>
      <FlatList
        data={exportQueue}
        keyExtractor={keyExtractor}
        renderItem={renderItem}
        ItemSeparatorComponent={Divider}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <View style={styles.header}>
            <Text variant="titleLarge">Export queue</Text>
            <Text variant="bodyMedium">Pending exports: {pendingCount}</Text>
            {pendingCount > 5 ? (
              <View style={styles.banner}>
                <Text variant="bodySmall">
                  There are more than five exports waiting to upload. Connect to the internet and upload soon.
                </Text>
              </View>
            ) : null}
            <View style={styles.actionsRow}>
              <Button
                mode="contained"
                onPress={handleQueueExport}
                loading={isQueueing}
                disabled={isQueueing}
                accessibilityLabel="Queue new export"
              >
                Queue new export
              </Button>
              <Button
                mode="contained-tonal"
                onPress={handleUploadNow}
                loading={isUploading}
                disabled={isUploading || pendingCount === 0}
                accessibilityLabel="Upload pending exports to Google Drive"
              >
                Upload pending
              </Button>
              <Chip
                onPress={handleClearCompleted}
                disabled={isClearing}
                accessibilityLabel="Clear completed or failed exports"
              >
                Clear completed
              </Chip>
            </View>
            <Text variant="bodySmall" style={styles.helperText}>
              Exports are stored locally and uploaded when online. Retry failed exports or remove entries that are no longer needed.
            </Text>
            <Text variant="bodySmall" style={styles.helperText}>
              Drive folder ID: {settings.driveFolderId ?? 'Not created yet'}
            </Text>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text variant="titleMedium">Queue is empty</Text>
            <Text variant="bodyMedium" style={styles.emptyBody}>
              Generate a new CSV backup to populate the export queue.
            </Text>
            <Button mode="contained" onPress={handleQueueExport} loading={isQueueing}>
              Queue export
            </Button>
          </View>
        }
      />
    </Surface>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
  },
  listContent: {
    paddingBottom: 24,
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 16,
    gap: 12,
  },
  actionsRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 12,
  },
  helperText: {
    color: '#6b6b6b',
  },
  banner: {
    padding: 12,
    borderRadius: 8,
    backgroundColor: '#fff4e5',
  },
  rowActions: {
    flexDirection: 'row',
    gap: 4,
  },
  emptyState: {
    padding: 24,
    alignItems: 'center',
    gap: 12,
  },
  emptyBody: {
    color: '#6b6b6b',
    textAlign: 'center',
  },
});

export default ExportQueueScreen;
