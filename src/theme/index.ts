import { MD3DarkTheme, MD3LightTheme, type MD3Theme } from 'react-native-paper';

/**
 * Colour applied to income amounts. It accompanies a `+` sign rather than
 * replacing it, so direction never depends on colour alone.
 */
export const INCOME_COLOR_LIGHT = '#1b6b3a';
export const INCOME_COLOR_DARK = '#7fd6a0';

/**
 * Colour applied to a negative total, under the same sign-plus-colour rule.
 * Kept off-hue from the error colours, which mark faults the user must act on.
 */
export const NEGATIVE_COLOR_LIGHT = '#8c2f22';
export const NEGATIVE_COLOR_DARK = '#f0a094';

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
