import React, { useCallback, useMemo, useState } from 'react';
import { Alert, FlatList, StyleSheet, View } from 'react-native';
import {
  Button,
  Dialog,
  Divider,
  HelperText,
  IconButton,
  List,
  Portal,
  SegmentedButtons,
  Surface,
  Text,
  TextInput,
} from 'react-native-paper';
import { useTransactionData } from '../context/AppContext';
import type { CategoryType } from '../database';

type DirectionUsage = { expense: number; income: number };

const TYPE_OPTIONS = [
  { value: 'expense', label: 'Expense' },
  { value: 'income', label: 'Income' },
  { value: 'both', label: 'Both' },
];

const TYPE_LABELS: Record<CategoryType, string> = {
  expense: 'Expense only',
  income: 'Income only',
  both: 'Expense and income',
};

/**
 * Directions a category would stop covering under `next`. Transactions already
 * filed under those directions keep the category; they simply stop being
 * offered it, so the count is worth stating before the change is applied.
 */
const strandedCount = (usage: DirectionUsage, next: CategoryType): number => {
  if (next === 'both') {
    return 0;
  }
  return next === 'expense' ? usage.income : usage.expense;
};

const ManageCategoriesScreen: React.FC = () => {
  const {
    state: { categories, transactions },
    actions: { createCategory, updateCategory, deleteCategory },
  } = useTransactionData();

  const sortedCategories = useMemo(
    () => [...categories].sort((a, b) => a.name.localeCompare(b.name)),
    [categories],
  );

  const usageCount = useMemo(() => {
    const counts = new Map<number, DirectionUsage>();
    transactions.forEach(transaction => {
      if (transaction.categoryId == null) {
        return;
      }
      const current = counts.get(transaction.categoryId) ?? {
        expense: 0,
        income: 0,
      };
      current[transaction.type] += 1;
      counts.set(transaction.categoryId, current);
    });
    return counts;
  }, [transactions]);

  const [dialogVisible, setDialogVisible] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [type, setType] = useState<CategoryType>('both');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const resetDialogState = useCallback(() => {
    setDialogVisible(false);
    setEditingId(null);
    setName('');
    setType('both');
    setError(null);
    setSubmitting(false);
  }, []);

  const openCreateDialog = () => {
    setEditingId(null);
    setName('');
    setType('both');
    setError(null);
    setDialogVisible(true);
  };

  const openEditDialog = useCallback(
    (categoryId: number) => {
      const category = categories.find(item => item.id === categoryId);
      if (!category) {
        return;
      }
      setEditingId(categoryId);
      setName(category.name);
      setType(category.type);
      setError(null);
      setDialogVisible(true);
    },
    [categories],
  );

  const validateName = useCallback(
    (value: string, excludeId: number | null) => {
      const trimmed = value.trim();
      if (!trimmed) {
        return 'Category name is required.';
      }
      const exists = categories.some(
        category =>
          category.id !== excludeId &&
          category.name.trim().toLowerCase() === trimmed.toLowerCase(),
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

    const persist = async () => {
      setSubmitting(true);
      try {
        if (editingId != null) {
          await updateCategory({ id: editingId, name: name.trim(), type });
        } else {
          await createCategory({ name: name.trim(), type });
        }
        resetDialogState();
      } catch (err) {
        setError(
          err instanceof Error ? err.message : 'Failed to save category.',
        );
        setSubmitting(false);
      }
    };

    const stranded =
      editingId != null
        ? strandedCount(
            usageCount.get(editingId) ?? { expense: 0, income: 0 },
            type,
          )
        : 0;
    if (stranded > 0) {
      Alert.alert(
        'Change category type?',
        `${stranded} transaction${stranded === 1 ? '' : 's'} already use this category in the direction you are removing. They keep it, but it will no longer be offered for them.`,
        [
          { text: 'Cancel', style: 'cancel' },
          { text: 'Change', onPress: () => void persist() },
        ],
      );
      return;
    }

    await persist();
  }, [
    createCategory,
    editingId,
    name,
    resetDialogState,
    type,
    updateCategory,
    usageCount,
    validateName,
  ]);

  const handleDelete = useCallback(
    (categoryId: number) => {
      const category = categories.find(item => item.id === categoryId);
      if (!category) {
        return;
      }

      const usage = usageCount.get(categoryId) ?? { expense: 0, income: 0 };
      const inUseCount = usage.expense + usage.income;
      if (inUseCount > 0) {
        Alert.alert(
          'Cannot delete category',
          `This category is used by ${inUseCount} transaction${inUseCount === 1 ? '' : 's'}. Move those transactions to another category before deleting.`,
        );
        return;
      }

      Alert.alert('Delete category', `Delete "${category.name}"?`, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteCategory(categoryId);
            } catch (err) {
              Alert.alert(
                'Delete failed',
                err instanceof Error
                  ? err.message
                  : 'Unable to delete category.',
              );
            }
          },
        },
      ]);
    },
    [categories, deleteCategory, usageCount],
  );

  const renderItem = useCallback(
    ({ item }: { item: (typeof sortedCategories)[number] }) => {
      const usage = usageCount.get(item.id) ?? { expense: 0, income: 0 };
      const usageParts: string[] = [];
      if (usage.expense > 0) {
        usageParts.push(
          `${usage.expense} expense${usage.expense === 1 ? '' : 's'}`,
        );
      }
      if (usage.income > 0) {
        usageParts.push(`${usage.income} income`);
      }
      return (
        <List.Item
          title={item.name}
          titleStyle={styles.listTitle}
          description={
            usageParts.length
              ? `${TYPE_LABELS[item.type]} · ${usageParts.join(', ')}`
              : `${TYPE_LABELS[item.type]} · Unused`
          }
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
    [handleDelete, openEditDialog, usageCount],
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
            <Button
              mode="contained"
              onPress={openCreateDialog}
              accessibilityLabel="Add category"
            >
              Add category
            </Button>
            <Text variant="bodySmall" style={styles.helperText}>
              Categories help you group transactions. Names must be unique.
            </Text>
          </View>
        }
        ListEmptyComponent={
          <View style={styles.emptyState}>
            <Text variant="titleMedium">No categories yet</Text>
            <Text variant="bodyMedium" style={styles.emptyBody}>
              Create your first category to organise transactions.
            </Text>
            <Button mode="contained" onPress={openCreateDialog}>
              Create category
            </Button>
          </View>
        }
      />

      <Portal>
        <Dialog visible={dialogVisible} onDismiss={resetDialogState}>
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
            <Text variant="bodySmall" style={styles.helperText}>
              Used for
            </Text>
            <SegmentedButtons
              value={type}
              onValueChange={value => setType(value as CategoryType)}
              buttons={TYPE_OPTIONS}
            />
          </Dialog.Content>
          <Dialog.Actions>
            <Button
              onPress={resetDialogState}
              accessibilityLabel="Cancel category dialog"
            >
              Cancel
            </Button>
            <Button
              mode="contained"
              onPress={handleSave}
              loading={submitting}
              disabled={submitting}
              accessibilityLabel={
                editingId != null ? 'Save category name' : 'Create category'
              }
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
