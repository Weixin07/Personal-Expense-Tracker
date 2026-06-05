import React from 'react';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import AddExpenseScreen from '../screens/AddExpenseScreen';
import ExportQueueScreen from '../screens/ExportQueueScreen';
import HomeScreen from '../screens/HomeScreen';
import SettingsScreen from '../screens/SettingsScreen';
import ManageCategoriesScreen from '../screens/ManageCategoriesScreen';

export type RootStackParamList = {
  Home: undefined;
  AddExpense: { expenseId?: number } | undefined;
  Settings: undefined;
  ManageCategories: undefined;
  ExportQueue: undefined;
  DriveFolderPicker: undefined;
};

const Stack = createNativeStackNavigator<RootStackParamList>();

const AppNavigator: React.FC = () => {
  return (
    <Stack.Navigator>
      <Stack.Screen
        name="Home"
        component={HomeScreen}
        options={{ title: 'Expenses' }}
      />
      <Stack.Screen
        name="AddExpense"
        component={AddExpenseScreen}
        options={({ route }) => ({
          title: route.params?.expenseId ? 'Edit Expense' : 'Add Expense',
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
    </Stack.Navigator>
  );
};

export default AppNavigator;
