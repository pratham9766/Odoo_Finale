import { Platform } from 'react-native';
import { MD3LightTheme as DefaultTheme } from 'react-native-paper';

// The mill palette, the same as the web app (client/src/main.jsx colorPrimary, client/src/styles/index.css --sidebar-bg / --bg-app):
// forest green #103C32, cream and thread gold. (#216457 is not used anywhere in this project.)
// Text and status colours are checked for at least 4.5:1 contrast on the surface they sit on (white, bg or their own tint).
export const palette = {
  forest: '#103C32',
  forestSoft: '#1B5446',
  gold: '#8A6420',          // text-safe gold (5.4:1 on white); fills use goldBright
  goldBright: '#D5AC64',
  ink: '#152C29',
  cream: '#F5F0E4',
  linen: '#E7DFCC',
  sage: '#93A89B',
  bg: '#F8F7F3',
  surface: '#FFFFFF',
  textSecondary: '#5F6B63',
  textMuted: '#66706A',
  ok: '#256B49', okBg: '#E6F1EA',
  risk: '#7A5600', riskBg: '#FBF0D6',
  danger: '#A32D20', dangerBg: '#FBE7E4',
  info: '#2F5D8A', infoBg: '#E5EEF7',
  muted: '#5F6B63', mutedBg: '#EEEBE3',
};
palette.primary = palette.forest;

export const radius = { sm: 8, md: 12, lg: 16, pill: 999 };
export const space = { xs: 4, sm: 8, md: 12, lg: 16, xl: 24, xxl: 32 };
export const serif = Platform.select({ ios: 'Georgia', android: 'serif', default: 'Georgia, serif' });

/** Smallest comfortable touch target (dp) for the controls a person uses with gloves or in a hurry. */
export const TOUCH = 48;
/** Page side padding. */
export const SCREEN_PAD = space.lg;
/** On tablets (and the web preview) content is capped and centred instead of stretching across the screen. */
export const CONTENT_MAX = 760;
export const TABLET_MIN_WIDTH = 700;
/** Text may grow with the phone's font setting, but never so far that layouts break. */
export const MAX_FONT_SCALE = 1.6;

// One type scale for the whole app. Sizes are minimums; they scale with the system font size.
export const type = {
  h1: { fontSize: 26, lineHeight: 32, fontFamily: serif, fontWeight: '700', color: palette.forest, letterSpacing: -0.3 },
  h2: { fontSize: 20, lineHeight: 26, fontWeight: '700', color: palette.forest },
  h3: { fontSize: 17, lineHeight: 23, fontWeight: '700', color: palette.ink },
  body: { fontSize: 16, lineHeight: 23, color: palette.ink },
  bodyStrong: { fontSize: 16, lineHeight: 23, fontWeight: '700', color: palette.ink },
  small: { fontSize: 14, lineHeight: 20, color: palette.textSecondary },
  caption: { fontSize: 13, lineHeight: 18, color: palette.textMuted },
  label: { fontSize: 14, lineHeight: 20, fontWeight: '700', color: palette.ink },
  eyebrow: { fontSize: 12, lineHeight: 16, letterSpacing: 1.2, fontWeight: '700', color: palette.gold },
};

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
