import React, { useCallback, useMemo, useState } from 'react';
import { Alert, FlatList, StyleSheet, View } from 'react-native';
import {
  Button,
  Dialog,
  HelperText,
  IconButton,
  List,
  Portal,
  Surface,
  Text,
  TextInput,
} from 'react-native-paper';
import { useExpenseData } from '../context/AppContext';

const ManageCategoriesScreen: React.FC = () => {
  const {
    state: { categories, expenses },
    actions: { createCategory, updateCategory, deleteCategory },
  } = useExpenseData();

  const sortedCategories = useMemo(
    () => [...categories].sort((a, b) => a.name.localeCompare(b.name)),
    [categories],
  );

  const usageCount = useMemo(() => {
    const counts = new Map<number, number>();
    expenses.forEach(expense => {
      if (expense.categoryId != null) {
        counts.set(expense.categoryId, (counts.get(expense.categoryId) ?? 0) + 1);
      }
    });
    return counts;
  }, [expenses]);

  const [dialogVisible, setDialogVisible] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const resetDialogState = useCallback(() => {
    setDialogVisible(false);
    setEditingId(null);
    setName('');
    setError(null);
    setSubmitting(false);
  }, []);

  const openCreateDialog = () => {
    setEditingId(null);
    setName('');
    setError(null);
    setDialogVisible(true);
  };

  const openEditDialog = (categoryId: number) => {
    const category = categories.find(item => item.id === categoryId);
    if (!category) {
      return;
    }
    setEditingId(categoryId);
    setName(category.name);
    setError(null);
    setDialogVisible(true);
  };

  const validateName = useCallback(
    (value: string, excludeId: number | null) => {
      const trimmed = value.trim();
      if (!trimmed) {
        return 'Category name is required.';
      }
      const exists = categories.some(
        category =>
          category.id !== excludeId && category.name.trim().toLowerCase() === trimmed.toLowerCase(),
      );
      if (exists) {
        return 'Category name must be unique.';
      }
      return null;
    },
    [categories],
  );

  const handleSave = useCallback(async () => {
    const validationError = validateName(name, editingId);
    if (validationError) {
      setError(validationError);
      return;
    }

    setSubmitting(true);
    try {
      if (editingId != null) {
        await updateCategory({ id: editingId, name: name.trim() });
      } else {
        await createCategory({ name: name.trim() });
      }
      resetDialogState();
    } catch (err) {
      setError(err instanceof Error ? err.message : 'Failed to save category.');
      setSubmitting(false);
    }
  }, [createCategory, editingId, name, resetDialogState, updateCategory, validateName]);

  const handleDelete = useCallback(
    (categoryId: number) => {
      const category = categories.find(item => item.id === categoryId);
      if (!category) {
        return;
      }

      const inUseCount = usageCount.get(categoryId) ?? 0;
      if (inUseCount > 0) {
        Alert.alert(
          'Cannot delete category',
          `This category is used by ${inUseCount} expense${inUseCount === 1 ? '' : 's'}. Move those expenses to another category before deleting.`,
        );
        return;
      }

      Alert.alert(
        'Delete category',
        `Delete "${category.name}"?`,
        [
          { text: 'Cancel', style: 'cancel' },
          {
            text: 'Delete',
            style: 'destructive',
            onPress: async () => {
              try {
                await deleteCategory(categoryId);
              } catch (err) {
                Alert.alert('Delete failed', err instanceof Error ? err.message : 'Unable to delete category.');
              }
            },
          },
        ],
      );
    },
    [categories, deleteCategory, usageCount],
  );

  const renderItem = useCallback(
    ({ item }: { item: (typeof sortedCategories)[number] }) => {
      const usage = usageCount.get(item.id) ?? 0;
      return (
        <List.Item
          title={item.name}
          titleStyle={styles.listTitle}
          description={usage > 0 ? `${usage} expense${usage === 1 ? '' : 's'}` : 'Unused'}
          descriptionStyle={styles.listDescription}
          right={() => (
            <View style={styles.actions}>
              <IconButton
                icon="pencil"
                accessibilityLabel={`Rename ${item.name}`}
                onPress={() => openEditDialog(item.id)}
              />
              <IconButton
                icon="delete"
                accessibilityLabel={`Delete ${item.name}`}
                onPress={() => handleDelete(item.id)}
              />
            </View>
          )}
        />
      );
    },
    [handleDelete, openEditDialog, sortedCategories, usageCount],
  );

  return (
    <Surface style={styles.container}>
      <FlatList
        data={sortedCategories}
        keyExtractor={item => item.id.toString()}
        renderItem={renderItem}
        ItemSeparatorComponent={Divider}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <View style={styles.header}>
            <Button mode="contained" onPress={openCreateDialog} accessibilityLabel="Add category">
              Add category
            </Button>
            <Text variant="bodySmall" style={styles.helperText}>
              Categories help you group expenses. Names must be unique.
            </Text>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text variant="titleMedium">No categories yet</Text>
            <Text variant="bodyMedium" style={styles.emptyBody}>
              Create your first category to organise expenses.
            </Text>
            <Button mode="contained" onPress={openCreateDialog}>
              Create category
            </Button>
          </View>
        }
      />

      <Portal>
        <Dialog visible={dialogVisible} onDismiss={resetDialogState} accessibilityLabel="Category dialog">
          <Dialog.Title accessibilityRole="header">
            {editingId != null ? 'Rename category' : 'New category'}
          </Dialog.Title>
          <Dialog.Content>
            <TextInput
              label="Category name"
              value={name}
              onChangeText={text => {
                setName(text);
                if (error) {
                  setError(null);
                }
              }}
              autoFocus
              accessibilityLabel="Category name"
              mode="outlined"
              error={Boolean(error)}
            />
            <HelperText type="error" visible={Boolean(error)}>
              {error}
            </HelperText>
          </Dialog.Content>
          <Dialog.Actions>
            <Button onPress={resetDialogState} accessibilityLabel="Cancel category dialog">
              Cancel
            </Button>
            <Button
              mode="contained"
              onPress={handleSave}
              loading={submitting}
              disabled={submitting}
              accessibilityLabel={editingId != null ? 'Save category name' : 'Create category'}
            >
              {editingId != null ? 'Save' : 'Create'}
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
  listContent: {
    paddingBottom: 24,
  },
  header: {
    paddingHorizontal: 16,
    paddingTop: 16,
    gap: 8,
  },
  helperText: {
    color: '#6b6b6b',
  },
  listTitle: {
    fontWeight: '600',
  },
  listDescription: {
    color: '#6b6b6b',
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
  },
  emptyState: {
    padding: 24,
    alignItems: 'center',
    gap: 12,
  },
  emptyBody: {
    textAlign: 'center',
    color: '#6b6b6b',
  },
});

export default ManageCategoriesScreen;