import { registerNotifier } from './notifier.js';
import { registerSocketEmitter } from './socketEmitter.js';

// Listener files are loaded if present so each owner can add theirs without editing this file:
//   statusEngine, inventoryReactions (Vipul) · dispatchReactions, attendanceReactions (Hrishikesh)
const OPTIONAL = ['statusEngine', 'inventoryReactions', 'dispatchReactions', 'attendanceReactions'];

export async function registerListeners() {
  registerNotifier();
  registerSocketEmitter();
  for (const f of OPTIONAL) {
    try {
      const mod = await import(`./${f}.js`);
      mod.register?.();
    } catch (err) {
      if (err.code !== 'ERR_MODULE_NOT_FOUND' || !String(err.message).includes(`${f}.js`)) throw err;
    }
  }
}
