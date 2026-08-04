import { MD3DarkTheme, MD3LightTheme, type MD3Theme } from 'react-native-paper';

/**
 * Colour applied to income amounts. It accompanies a `+` sign rather than
 * replacing it, so direction never depends on colour alone.
 */
export const INCOME_COLOR_LIGHT = '#1b6b3a';
export const INCOME_COLOR_DARK = '#7fd6a0';

export const lightTheme: MD3Theme = {
  ...MD3LightTheme,
  colors: {
    ...MD3LightTheme.colors,
    primary: '#006d3b',
    secondary: '#005cbb',
  },
};

export const darkTheme: MD3Theme = {
  ...MD3DarkTheme,
  colors: {
    ...MD3DarkTheme.colors,
    primary: '#45e084',
    secondary: '#82b6ff',
  },
};

export type AppTheme = MD3Theme;
