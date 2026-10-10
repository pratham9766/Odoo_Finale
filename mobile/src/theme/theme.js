import { MD3LightTheme as DefaultTheme } from 'react-native-paper';

export const theme = {
  ...DefaultTheme,
  colors: {
    ...DefaultTheme.colors,
    primary: '#007780', // Teal
    secondary: '#14243E', // Navy
    background: '#F5F7F9', // Light neutral background
    surface: '#FFFFFF',
    error: '#E53935',
    text: '#182B45',
    onSurface: '#182B45',
    onPrimary: '#FFFFFF',
    onSecondary: '#FFFFFF',
    elevation: {
      level0: 'transparent',
      level1: '#FFFFFF',
      level2: '#FFFFFF',
      level3: '#FFFFFF',
      level4: '#FFFFFF',
      level5: '#FFFFFF',
    },
  },
  roundness: 8,
};
