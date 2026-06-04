import React from 'react';
import {
  DefaultTheme as NavigationDefaultTheme,
  NavigationContainer,
  type Theme as NavigationTheme,
} from '@react-navigation/native';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { StatusBar, StyleSheet, useColorScheme } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { Provider as PaperProvider } from 'react-native-paper';
import AppNavigator from './src/navigation/AppNavigator';
import { AppProvider } from './src/context/AppContext';
import { darkTheme, lightTheme } from './src/theme';

const App: React.FC = () => {
  const colorScheme = useColorScheme();
  const paperTheme = colorScheme === 'dark' ? darkTheme : lightTheme;

  const navigationTheme: NavigationTheme = {
    dark: colorScheme === 'dark',
    fonts: NavigationDefaultTheme.fonts,
    colors: {
      primary: paperTheme.colors.primary,
      background: paperTheme.colors.background,
      card: paperTheme.colors.surface,
      text: paperTheme.colors.onSurface,
      border: paperTheme.colors.outlineVariant ?? paperTheme.colors.outline,
      notification: paperTheme.colors.error,
    },
  };

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <PaperProvider theme={paperTheme}>
          <StatusBar
            barStyle={colorScheme === 'dark' ? 'light-content' : 'dark-content'}
            backgroundColor={paperTheme.colors.background}
          />
          <AppProvider>
            <NavigationContainer theme={navigationTheme}>
              <AppNavigator />
            </NavigationContainer>
          </AppProvider>
        </PaperProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
};

const styles = StyleSheet.create({
  root: { flex: 1 },
});

export default App;
