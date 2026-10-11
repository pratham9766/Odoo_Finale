import assert from 'assert';

// Mock Expo SecureStore
const store = new Map();
let errorOnSet = false;
let errorOnSetCount = 0;

const SecureStore = {
  getItemAsync: async (k) => {
    // Simulate async delay
    await new Promise(r => setTimeout(r, 5));
    return store.has(k) ? store.get(k) : null;
  },
  setItemAsync: async (k, v) => {
    await new Promise(r => setTimeout(r, 5));
    if (errorOnSet) {
      errorOnSetCount++;
      throw new Error("Simulated write error");
    }
    store.set(k, v);
  },
  deleteItemAsync: async (k) => {
    await new Promise(r => setTimeout(r, 5));
    store.delete(k);
  },
  _dump: () => Object.fromEntries(store.entries()),
  _clear: () => store.clear(),
};

const CHUNK_SIZE = 10;
let currentLock = Promise.resolve();

// The adapter under test
const adapter = {
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
        return null;
      }
    });
  },
  setItem: async (key, value) => {
    return currentLock = currentLock.then(async () => {
      try {
        const newGen = Date.now().toString() + Math.random().toString();
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
        // error logged
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
        // error logged
      }
    });
  },
};

async function runTests() {
  console.log("Starting Session Storage Tests");
  const key = 'test_session';
  SecureStore._clear();

  // Test 1: Normal write and read
  await adapter.setItem(key, "ABCDEFGHIJKLMNOPQRSTUVWXYZ");
  let val = await adapter.getItem(key);
  assert.strictEqual(val, "ABCDEFGHIJKLMNOPQRSTUVWXYZ", "Normal read/write failed");

  // Test 2: Shorter session replaces longer session
  await adapter.setItem(key, "SHORT");
  val = await adapter.getItem(key);
  assert.strictEqual(val, "SHORT", "Shorter session replacement failed");
  // verify old chunks cleaned up (there should be only 1 chunk for 'SHORT')
  const keys = Object.keys(SecureStore._dump());
  assert.ok(keys.length === 3, "Shorter session cleanup left stale keys"); // gen, count, chunk0

  // Test 3: Interrupted write
  const previousState = SecureStore._dump();
  errorOnSet = true;
  await adapter.setItem(key, "NEWLONGDATA");
  errorOnSet = false;
  val = await adapter.getItem(key);
  assert.strictEqual(val, "SHORT", "Interrupted write should not corrupt previous data");

  // Test 4: Missing chunk (simulated corruption of current gen)
  const gen = await SecureStore.getItemAsync(`${key}_gen`);
  await SecureStore.deleteItemAsync(`${key}_${gen}_0`);
  val = await adapter.getItem(key);
  assert.strictEqual(val, null, "Missing chunk should fail safely and return null");

  // Test 5: Concurrent write and logout
  // Setup fresh state
  await adapter.setItem(key, "VALID_SESSION");
  
  // start a write that will take some time
  const writePromise = adapter.setItem(key, "PENDING_LONG_WRITE_THAT_IS_DELAYED_BY_AWAIT");
  // immediately start logout (removeItem)
  const removePromise = adapter.removeItem(key);
  
  await Promise.all([writePromise, removePromise]);
  
  // Since both use currentLock, they serialize. The removeItem is queued AFTER the setItem.
  // Therefore, the final state MUST be null (logout wins over earlier set).
  val = await adapter.getItem(key);
  assert.strictEqual(val, null, "Logout did not successfully wipe an earlier concurrent write");

  console.log("All tests passed.");
}

runTests().catch(console.error);
