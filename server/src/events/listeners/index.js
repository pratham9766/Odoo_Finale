import { readdir } from 'node:fs/promises';
import { registerNotifier } from './notifier.js';
import { registerSocketEmitter } from './socketEmitter.js';

// Every other file in this folder is a listener module exporting register()/register<Name>(): statusEngine, inventoryReactions,
// dispatchReactions, attendanceReactions, financeReactions, gateReactions, qualityReactions, ... Owners add files; no edit here.
const CORE = new Set(['index.js', 'notifier.js', 'socketEmitter.js']);

let registered = false;

export async function registerListeners() {
  if (registered) return; // tests and the server may both call this
  registered = true;
  registerNotifier();
  registerSocketEmitter();
  const files = (await readdir(new URL('.', import.meta.url))).filter((f) => f.endsWith('.js') && !CORE.has(f)).sort();
  for (const f of files) {
    const mod = await import(`./${f}`);
    // convention: register() or register<Name>() (e.g. registerDispatchReactions)
    const fns = Object.entries(mod).filter(([name, fn]) => /^register/.test(name) && typeof fn === 'function');
    if (!fns.length) throw new Error(`events/listeners/${f} must export register() or register<Name>()`);
    for (const [, fn] of fns) await fn();
  }
}
