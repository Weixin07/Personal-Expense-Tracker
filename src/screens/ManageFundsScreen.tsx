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
  Surface,
  Text,
  TextInput,
} from 'react-native-paper';
import CurrencyPickerDialog from '../components/CurrencyPickerDialog';
import SelectField from '../components/SelectField';
import { useTransactionData } from '../context/AppContext';
import type { FundBalance } from '../context/AppContext';
import { formatSignedMoney } from '../utils/formatting';
import { isDefaultFund } from '../utils/funds';
import { validateOpeningBalance } from '../utils/validation';
import type { FundRecord } from '../database';

const NO_CURRENCY_LABEL = 'Follows base currency';

const describeBalance = (balance: FundBalance | undefined): string => {
  if (!balance || balance.byCurrency.length === 0) {
    return 'Empty';
  }
  return balance.byCurrency
    .map(figure => formatSignedMoney(figure.balance, figure.currencyCode))
    .join(' · ');
};

const ManageFundsScreen: React.FC = () => {
  const {
    state: { funds, transactions },
    selectors: { fundBalances },
    actions: { createFund, updateFund, deleteFund },
  } = useTransactionData();

  const sortedFunds = useMemo(
    () => [...funds].sort((a, b) => a.name.localeCompare(b.name)),
    [funds],
  );

  const balanceByFundId = useMemo(() => {
    const map = new Map<number, FundBalance>();
    fundBalances.forEach(balance => {
      map.set(balance.fundId, balance);
    });
    return map;
  }, [fundBalances]);

  /** Counts both sides of a transfer: either one blocks deletion. */
  const usageCount = useMemo(() => {
    const counts = new Map<number, number>();
    const bump = (fundId: number) => {
      counts.set(fundId, (counts.get(fundId) ?? 0) + 1);
    };
    transactions.forEach(transaction => {
      bump(transaction.fundId);
      if (transaction.counterpartFundId != null) {
        bump(transaction.counterpartFundId);
      }
    });
    return counts;
  }, [transactions]);

  const [dialogVisible, setDialogVisible] = useState(false);
  const [currencyDialogVisible, setCurrencyDialogVisible] = useState(false);
  const [editingId, setEditingId] = useState<number | null>(null);
  const [name, setName] = useState('');
  const [currencyCode, setCurrencyCode] = useState<string | null>(null);
  const [openingBalance, setOpeningBalance] = useState('0');
  const [error, setError] = useState<string | null>(null);
  const [submitting, setSubmitting] = useState(false);

  const resetDialogState = useCallback(() => {
    setDialogVisible(false);
    setEditingId(null);
    setName('');
    setCurrencyCode(null);
    setOpeningBalance('0');
    setError(null);
    setSubmitting(false);
  }, []);

  const openCreateDialog = () => {
    setEditingId(null);
    setName('');
    setCurrencyCode(null);
    setOpeningBalance('0');
    setError(null);
    setDialogVisible(true);
  };

  const openEditDialog = useCallback(
    (fundId: number) => {
      const fund = funds.find(item => item.id === fundId);
      if (!fund) {
        return;
      }
      setEditingId(fundId);
      setName(fund.name);
      setCurrencyCode(fund.currencyCode);
      setOpeningBalance(String(fund.openingBalance));
      setError(null);
      setDialogVisible(true);
    },
    [funds],
  );

  const validateForm = useCallback(
    (value: string, balance: string, excludeId: number | null) => {
      const trimmed = value.trim();
      if (!trimmed) {
        return 'Fund name is required.';
      }
      const exists = funds.some(
        fund =>
          fund.id !== excludeId &&
          fund.name.trim().toLowerCase() === trimmed.toLowerCase(),
      );
      if (exists) {
        return 'Fund name must be unique.';
      }
      const balanceCheck = validateOpeningBalance(Number(balance.trim()));
      if (!balanceCheck.valid) {
        return balanceCheck.message;
      }
      return null;
    },
    [funds],
  );

  const handleSave = useCallback(async () => {
    const validationError = validateForm(name, openingBalance, editingId);
    if (validationError) {
      setError(validationError);
      return;
    }

    const persist = async () => {
      setSubmitting(true);
      try {
        const payload = {
          name: name.trim(),
          currencyCode,
          openingBalance: Number(openingBalance.trim()),
          notes: null,
        };
        if (editingId != null) {
          await updateFund({ id: editingId, ...payload });
        } else {
          await createFund(payload);
        }
        resetDialogState();
      } catch (err) {
        setError(err instanceof Error ? err.message : 'Failed to save fund.');
        setSubmitting(false);
      }
    };

    const existing =
      editingId != null ? funds.find(item => item.id === editingId) : undefined;
    if (!existing) {
      await persist();
      return;
    }

    const confirmations: string[] = [];
    if (existing.openingBalance !== Number(openingBalance.trim())) {
      confirmations.push(
        'Changing the opening balance restates this fund’s balance for its whole history.',
      );
    }
    if (existing.currencyCode !== currencyCode) {
      confirmations.push(
        'Changing the currency only moves where the opening balance is reported. No stored transaction changes.',
      );
    }

    if (confirmations.length > 0) {
      Alert.alert('Save changes?', confirmations.join('\n\n'), [
        { text: 'Cancel', style: 'cancel' },
        { text: 'Save', onPress: () => void persist() },
      ]);
      return;
    }

    await persist();
  }, [
    createFund,
    currencyCode,
    editingId,
    funds,
    name,
    openingBalance,
    resetDialogState,
    updateFund,
    validateForm,
  ]);

  const handleDelete = useCallback(
    (fundId: number) => {
      const fund = funds.find(item => item.id === fundId);
      if (!fund) {
        return;
      }

      const inUseCount = usageCount.get(fundId) ?? 0;
      if (inUseCount > 0) {
        Alert.alert(
          'Cannot delete fund',
          `This fund is used by ${inUseCount} transaction${inUseCount === 1 ? '' : 's'}. Move those transactions to another fund before deleting.`,
        );
        return;
      }

      Alert.alert('Delete fund', `Delete "${fund.name}"?`, [
        { text: 'Cancel', style: 'cancel' },
        {
          text: 'Delete',
          style: 'destructive',
          onPress: async () => {
            try {
              await deleteFund(fundId);
            } catch (err) {
              Alert.alert(
                'Delete failed',
                err instanceof Error ? err.message : 'Unable to delete fund.',
              );
            }
          },
        },
      ]);
    },
    [deleteFund, funds, usageCount],
  );

  const renderItem = useCallback(
    ({ item }: { item: FundRecord }) => {
      const currencyLabel = item.currencyCode ?? NO_CURRENCY_LABEL;
      // The fallback fund is what every unassigned transaction and import lands
      // in, so it is never offered for deletion rather than refused on tap.
      const protectedFromDeletion = isDefaultFund(funds, item.id);
      return (
        <List.Item
          title={item.name}
          titleStyle={styles.listTitle}
          description={`${currencyLabel} · ${describeBalance(balanceByFundId.get(item.id))}`}
          descriptionStyle={styles.listDescription}
          right={() => (
            <View style={styles.actions}>
              <IconButton
                icon="pencil"
                accessibilityLabel={`Edit ${item.name}`}
                onPress={() => openEditDialog(item.id)}
              />
              {protectedFromDeletion ? null : (
                <IconButton
                  icon="delete"
                  accessibilityLabel={`Delete ${item.name}`}
                  onPress={() => handleDelete(item.id)}
                />
              )}
            </View>
          )}
        />
      );
    },
    [balanceByFundId, funds, handleDelete, openEditDialog],
  );

  return (
    <Surface style={styles.container}>
      <FlatList
        data={sortedFunds}
        keyExtractor={item => item.id.toString()}
        renderItem={renderItem}
        ItemSeparatorComponent={Divider}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          <View style={styles.header}>
            <Button
              mode="contained"
              onPress={openCreateDialog}
              accessibilityLabel="Add fund"
            >
              Add fund
            </Button>
            <Text variant="bodySmall" style={styles.helperText}>
              Funds are pots you set money aside in, such as a travel budget or
              household savings. Names must be unique.
            </Text>
          </View>
        }
      />

      <Portal>
        <Dialog visible={dialogVisible} onDismiss={resetDialogState}>
          <Dialog.Title accessibilityRole="header">
            {editingId != null ? 'Edit fund' : 'New fund'}
          </Dialog.Title>
          <Dialog.Content>
            <TextInput
              label="Fund name"
              value={name}
              onChangeText={text => {
                setName(text);
                if (error) {
                  setError(null);
                }
              }}
              autoFocus
              accessibilityLabel="Fund name"
              mode="outlined"
              error={Boolean(error)}
            />
            <HelperText type="error" visible={Boolean(error)}>
              {error}
            </HelperText>
            <SelectField
              label="Currency"
              value={currencyCode ?? NO_CURRENCY_LABEL}
              onPress={() => setCurrencyDialogVisible(true)}
              accessibilityLabel="Select fund currency"
              accessibilityHint="Opens the currency picker"
            />
            <TextInput
              label="Opening balance"
              value={openingBalance}
              onChangeText={text => {
                setOpeningBalance(text);
                if (error) {
                  setError(null);
                }
              }}
              mode="outlined"
              keyboardType="decimal-pad"
              accessibilityLabel="Fund opening balance"
            />
          </Dialog.Content>
          <Dialog.Actions>
            <Button
              onPress={resetDialogState}
              accessibilityLabel="Cancel fund dialog"
            >
              Cancel
            </Button>
            <Button
              mode="contained"
              onPress={handleSave}
              loading={submitting}
              disabled={submitting}
              accessibilityLabel={
                editingId != null ? 'Save fund' : 'Create fund'
              }
            >
              {editingId != null ? 'Save' : 'Create'}
            </Button>
          </Dialog.Actions>
        </Dialog>
      </Portal>

      <CurrencyPickerDialog
        visible={currencyDialogVisible}
        onDismiss={() => setCurrencyDialogVisible(false)}
        onSelect={option => {
          setCurrencyCode(option.code);
          setCurrencyDialogVisible(false);
        }}
        title="Choose fund currency"
        description="The currency this fund's opening balance is held in. Leave unset to follow your base currency."
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
});

export default ManageFundsScreen;
