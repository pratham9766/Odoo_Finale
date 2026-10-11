// Re-computes an order's status, progress and risk after events that can change them (debounced).
import { on } from '../bus.js';
import { withTx } from '../../db/tx.js';
import { recomputeOrderStatus } from '../../modules/orders/orderStatus.js';

// Events that can change an order's derived status. Modules just emit; no direct calls.
const DEBOUNCE_MS = 5000;
const timers = new Map();

function debounced(key, fn) {
  clearTimeout(timers.get(key));
  timers.set(key, setTimeout(() => { timers.delete(key); fn().catch((e) => console.error('[statusEngine]', e)); }, DEBOUNCE_MS));
}

async function orderIdFromDispatch(dispatchId) {
  return withTx(async (db) => (await db.query('select order_id from dispatches where id = $1', [dispatchId])).rows[0]?.order_id);
}

async function orderIdFromRoll(rollId) {
  return withTx(async (db) => (await db.query('select order_id from rolls where id = $1', [rollId])).rows[0]?.order_id);
}

export function register() {
  const direct = async ({ orderId }) => orderId && recomputeOrderStatus(orderId);
  for (const ev of ['order.confirmed', 'order.planned', 'workorder.started', 'workorder.finished']) on(ev, direct);

  // QC results carry only the roll; a pass can make the order ready_to_ship
  on('qc.done', async ({ rollId, orderId }) => {
    const id = orderId ?? (await orderIdFromRoll(rollId));
    if (id) await recomputeOrderStatus(id);
  });

  on('production.logged', ({ orderId }) => orderId && debounced(`prod:${orderId}`, () => recomputeOrderStatus(orderId)));

  on('dispatch.confirmed', async (p) => {
    const orderId = p.orderId ?? (await orderIdFromDispatch(p.dispatchId));
    if (orderId) await recomputeOrderStatus(orderId);
  });
  on('dispatch.received', async (p) => {
    const orderId = p.orderId ?? (await orderIdFromDispatch(p.dispatchId));
    if (orderId) await recomputeOrderStatus(orderId);
  });
}

// jobs (deadlineRisk) import the engine from here
export { recomputeOrderStatus };
