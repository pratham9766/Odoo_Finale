import 'react-native-url-polyfill/auto';
import { createClient } from '@supabase/supabase-js';
import * as SecureStore from 'expo-secure-store';

const CHUNK_SIZE = 2000;

let currentLock = Promise.resolve();

const secureStorageAdapter = {
  getItem: async (key) => {
    return currentLock = currentLock.then(async () => {
      try {
        const generation = await SecureStore.getItemAsync(`${key}_gen`);
        if (!generation) return null;
        
        const countStr = await SecureStore.getItemAsync(`${key}_${generation}_count`);
        if (!countStr) return null;
        
        const count = parseInt(countStr, 10);
        let value = '';
        for (let i = 0; i < count; i++) {
          const chunk = await SecureStore.getItemAsync(`${key}_${generation}_${i}`);
          if (chunk === null) return null;
          value += chunk;
        }
        return value;
      } catch (err) {
        console.error('SecureStore get error:', err);
        return null;
      }
    });
  },
  setItem: async (key, value) => {
    return currentLock = currentLock.then(async () => {
      try {
        const newGen = Date.now().toString();
        const chunkCount = Math.ceil(value.length / CHUNK_SIZE);
        
        for (let i = 0; i < chunkCount; i++) {
          const chunk = value.substring(i * CHUNK_SIZE, (i + 1) * CHUNK_SIZE);
          await SecureStore.setItemAsync(`${key}_${newGen}_${i}`, chunk);
        }
        await SecureStore.setItemAsync(`${key}_${newGen}_count`, chunkCount.toString());
        
        const oldGen = await SecureStore.getItemAsync(`${key}_gen`).catch(() => null);
        await SecureStore.setItemAsync(`${key}_gen`, newGen);
        
        if (oldGen && oldGen !== newGen) {
          const oldCountStr = await SecureStore.getItemAsync(`${key}_${oldGen}_count`).catch(() => null);
          if (oldCountStr) {
            const oldCount = parseInt(oldCountStr, 10);
            for (let i = 0; i < oldCount; i++) {
              await SecureStore.deleteItemAsync(`${key}_${oldGen}_${i}`).catch(() => {});
            }
            await SecureStore.deleteItemAsync(`${key}_${oldGen}_count`).catch(() => {});
          }
        }
      } catch (err) {
        console.error('SecureStore set error:', err);
      }
    });
  },
  removeItem: async (key) => {
    return currentLock = currentLock.then(async () => {
      try {
        const currentGen = await SecureStore.getItemAsync(`${key}_gen`).catch(() => null);
        if (currentGen) {
          const countStr = await SecureStore.getItemAsync(`${key}_${currentGen}_count`).catch(() => null);
          if (countStr) {
            const count = parseInt(countStr, 10);
            for (let i = 0; i < count; i++) {
              await SecureStore.deleteItemAsync(`${key}_${currentGen}_${i}`).catch(() => {});
            }
            await SecureStore.deleteItemAsync(`${key}_${currentGen}_count`).catch(() => {});
          }
          await SecureStore.deleteItemAsync(`${key}_gen`).catch(() => {});
        }
      } catch (err) {
        console.error('SecureStore remove error:', err);
      }
    });
  },
};

const supabaseUrl = process.env.EXPO_PUBLIC_SUPABASE_URL || '';
const supabaseAnonKey = process.env.EXPO_PUBLIC_SUPABASE_ANON_KEY || '';

// Without the two EXPO_PUBLIC_SUPABASE_* values (mobile/.env) createClient throws at import and takes every route down with it.
export const supabase = supabaseUrl && supabaseAnonKey ? createClient(supabaseUrl, supabaseAnonKey, {
  auth: {
    storage: secureStorageAdapter,
    autoRefreshToken: true,
    persistSession: true,
    detectSessionInUrl: false,
  },
}) : null;
