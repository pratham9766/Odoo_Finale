import { MD3LightTheme as DefaultTheme } from 'react-native-paper';

export const theme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: '#216457',
    secondary: '#182d2a',
    background: '#f5f6f2',
    surface: '#ffffff',
    error: '#B42318', // Used standard error color
    text: '#233b37',
    onSurface: '#233b37',
    onPrimary: '#ffffff',
    onSecondary: '#ffffff',
    outline: '#e3e7df',
    elevation: {
      level0: 'transparent',
      level1: '#ffffff',
      level2: '#ffffff',
      level3: '#ffffff',
      level4: '#ffffff',
      level5: '#ffffff',
    },
  },
  roundness: 8,
};
