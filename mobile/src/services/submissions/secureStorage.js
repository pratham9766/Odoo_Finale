import * as SecureStore from 'expo-secure-store';

// The storage behind pendingStore on a real phone. SecureStore is already used for the login session, survives app restarts and is
// private to the app. Entries are tiny (a key, a path, a small body), so no chunking is needed.
export const secureStorage = {
  get: (key) => SecureStore.getItemAsync(key),
  set: (key, value) => SecureStore.setItemAsync(key, value),
  remove: (key) => SecureStore.deleteItemAsync(key),
};
