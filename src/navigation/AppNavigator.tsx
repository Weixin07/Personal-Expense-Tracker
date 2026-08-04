import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { IconButton } from 'react-native-paper';
import AddTransactionScreen from '../screens/AddTransactionScreen';
import ExportQueueScreen from '../screens/ExportQueueScreen';
import HomeScreen from '../screens/HomeScreen';
import ImportScreen from '../screens/ImportScreen';
import SettingsScreen from '../screens/SettingsScreen';
import ManageCategoriesScreen from '../screens/ManageCategoriesScreen';

export type RootStackParamList = {
  Home: undefined;
  AddTransaction: { transactionId?: number } | undefined;
  Settings: undefined;
  ManageCategories: undefined;
  ExportQueue: undefined;
  Import: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

const AppNavigator: React.FC = () => {
  return (
    <Stack.Navigator>
      <Stack.Screen
        name="Home"
        component={HomeScreen}
        options={({ navigation }) => ({
          title: 'Transactions',
          headerRight: () => (
            <IconButton
              icon="cog"
              onPress={() => navigation.navigate('Settings')}
              accessibilityLabel="Open settings"
            />
          ),
        })}
      />
      <Stack.Screen
        name="AddTransaction"
        component={AddTransactionScreen}
        options={({ route }) => ({
          title: route.params?.transactionId
            ? 'Edit Transaction'
            : 'Add Transaction',
        })}
      />
      <Stack.Screen
        name="Settings"
        component={SettingsScreen}
        options={{ title: 'Settings' }}
      />
      <Stack.Screen
        name="ManageCategories"
        component={ManageCategoriesScreen}
        options={{ title: 'Manage Categories' }}
      />
      <Stack.Screen
        name="ExportQueue"
        component={ExportQueueScreen}
        options={{ title: 'Export Queue' }}
      />
      <Stack.Screen
        name="Import"
        component={ImportScreen}
        options={{ title: 'Import Transactions' }}
      />
    </Stack.Navigator>
  );
};

export default AppNavigator;
