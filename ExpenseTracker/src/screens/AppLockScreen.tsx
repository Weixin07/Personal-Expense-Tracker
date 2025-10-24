import React, { useContext, useState } from 'react';
import { View, StyleSheet } from 'react-native';
import { Button, Text, useTheme } from 'react-native-paper';
import { AppContext } from '../context/AppContext';
import Icon from 'react-native-vector-icons/MaterialCommunityIcons';

const AppLockScreen: React.FC = () => {
  const { unlockApp } = useContext(AppContext);
  const theme = useTheme();
  const [isLoading, setIsLoading] = useState(false);

  const handleUnlock = async () => {
    if (isLoading) {
      return;
    }
    setIsLoading(true);
    try {
      await unlockApp();
      // On success, the conditional rendering in App.tsx will handle swapping the screen.
    } catch (error) {
      // You could add user-facing error feedback here if desired.
      console.error('Unlock failed:', error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <View
      style={[
        styles.container,
        { backgroundColor: theme.colors.background },
      ]}
    >
      <Icon name="lock" size={48} color={theme.colors.primary} />
      <Text variant="headlineMedium" style={styles.title}>
        App Locked
      </Text>
      <Text variant="bodyLarge" style={styles.subtitle}>
        Please unlock to continue
      </Text>
      <Button
        mode="contained"
        onPress={handleUnlock}
        style={styles.button}
        loading={isLoading}
        disabled={isLoading}
        icon="lock-open-variant"
      >
        Unlock
      </Button>
    </View>
  );
};

const styles = StyleSheet.create({
  container: {
    flex: 1,
    justifyContent: 'center',
    alignItems: 'center',
    padding: 20,
  },
  title: {
    marginTop: 24,
    marginBottom: 8,
  },
  subtitle: {
    marginBottom: 32,
    color: 'gray',
  },
  button: {
    width: '60%',
    paddingVertical: 8,
  },
});

export default AppLockScreen;
