import { Platform } from 'react-native';
import { MD3LightTheme as DefaultTheme } from 'react-native-paper';

// The web app's mill palette (client/src/styles/index.css): forest green, cream and thread gold.
export const palette = {
  forest: '#103C32',
  forestSoft: '#1B5446',
  gold: '#A57A2C',
  goldBright: '#D5AC64',
  ink: '#152C29',
  cream: '#F5F0E4',
  linen: '#E7DFCC',
  sage: '#93A89B',
  bg: '#F8F7F3',
  surface: '#FFFFFF',
  textSecondary: '#5F6B63',
  textMuted: '#8C948E',
  ok: '#2F7A55', okBg: '#E6F1EA',
  risk: '#B8860B', riskBg: '#FBF0D6',
  danger: '#C0392B', dangerBg: '#FBE7E4',
  info: '#2F5D8A', infoBg: '#E5EEF7',
  muted: '#5F6B63', mutedBg: '#EEEBE3',
};

export const radius = { sm: 8, md: 12, lg: 16, pill: 999 };
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24 };
export const serif = Platform.select({ ios: 'Georgia', android: 'serif', default: 'Georgia, serif' });

export const theme = {
  ...DefaultTheme,
  roundness: radius.sm,
  colors: {
    ...DefaultTheme.colors,
    primary: palette.forest,
    onPrimary: '#FFFFFF',
    primaryContainer: palette.cream,
    onPrimaryContainer: palette.forest,
    secondary: palette.gold,
    onSecondary: '#FFFFFF',
    secondaryContainer: palette.cream,
    onSecondaryContainer: palette.forest,
    background: palette.bg,
    surface: palette.surface,
    surfaceVariant: palette.cream,
    onSurface: palette.ink,
    onSurfaceVariant: palette.textSecondary,
    outline: palette.linen,
    outlineVariant: palette.linen,
    error: palette.danger,
    text: palette.ink,
    elevation: { level0: 'transparent', level1: '#fff', level2: '#fff', level3: '#fff', level4: '#fff', level5: '#fff' },
  },
};
