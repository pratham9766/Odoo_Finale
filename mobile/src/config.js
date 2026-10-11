// Build-time configuration, read once. Expo inlines EXPO_PUBLIC_* values at bundle time, so they must be written out literally.
// There are deliberately NO defaults: a wrong guessed address would look like a broken server, so a missing value is reported instead.

export const API_URL = (process.env.EXPO_PUBLIC_API_URL || '').trim().replace(/\/+$/, '');
export const SUPABASE_URL = (process.env.EXPO_PUBLIC_SUPABASE_URL || '').trim();
export const SUPABASE_ANON_KEY = (process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '').trim();

// The UI preview (sample data, no server) exists for development only: it can never be switched on in a release build.
export const PREVIEW_ENABLED = typeof __DEV__ !== 'undefined' && __DEV__ && process.env.EXPO_PUBLIC_PREVIEW === '1';

/** Names (never values) of the settings the app needs but does not have. */
export function missingConfig() {
  return [
    ['EXPO_PUBLIC_API_URL', API_URL],
    ['EXPO_PUBLIC_SUPABASE_URL', SUPABASE_URL],
    ['EXPO_PUBLIC_SUPABASE_ANON_KEY', SUPABASE_ANON_KEY],
  ].filter(([, value]) => !value).map(([name]) => name);
}

/** http://localhost / 127.0.0.1 can never work from a phone; say so instead of showing "cannot reach the server". */
export const apiPointsAtThisDevice = () => /^https?:\/\/(localhost|127\.0\.0\.1)(:|\/|$)/i.test(API_URL);
