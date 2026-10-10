import { on } from '../bus.js';
import { withSystem } from '../../db/withTenant.js';
import { recomputeOrderStatus } from '../../modules/orders/orderStatus.js';

// Events that can change an order's derived status (§11.14). Hrishikesh's modules just emit; no direct calls.
const DEBOUNCE_MS = 5000;
const timers = new Map();

function debounced(key, fn) {
  clearTimeout(timers.get(key));
  timers.set(key, setTimeout(() => { timers.delete(key); fn().catch((e) => console.error('[statusEngine]', e)); }, DEBOUNCE_MS));
}

async function orderIdFromDispatch(orgId, dispatchId) {
  return withSystem(orgId, async (db) => (await db.query('select order_id from dispatches where id = $1', [dispatchId])).rows[0]?.order_id);
}

async function orderIdFromTrip(orgId, tripId) {
  return withSystem(orgId, async (db) =>
    (await db.query('select d.order_id from trips t join dispatches d on d.id = t.dispatch_id where t.id = $1', [tripId])).rows[0]?.order_id);
}

export function register() {
  // payloads carry the mill's org id as orgId / sellerOrgId plus an orderId (or enough to find it)
  const direct = async ({ orgId, sellerOrgId, orderId }) => orderId && recomputeOrderStatus(sellerOrgId ?? orgId, orderId);
  for (const ev of ['order.confirmed', 'workorder.started', 'workorder.finished', 'qc.done']) on(ev, direct);

  on('production.logged', ({ orgId, orderId }) => orderId && debounced(`prod:${orderId}`, () => recomputeOrderStatus(orgId, orderId)));

  on('dispatch.confirmed', async (p) => {
    const orgId = p.sellerOrgId ?? p.orgId;
    const orderId = p.orderId ?? (await orderIdFromDispatch(orgId, p.dispatchId));
    if (orderId) await recomputeOrderStatus(orgId, orderId);
  });
  on('trip.delivered', async (p) => {
    const orgId = p.requesterOrgId ?? p.sellerOrgId;
    const orderId = p.orderId ?? (await orderIdFromTrip(orgId, p.tripId));
    if (orderId) await recomputeOrderStatus(orgId, orderId);
  });
  on('dispatch.received', async (p) => {
    const orgId = p.sellerOrgId ?? p.fromOrgId;
    const orderId = p.orderId ?? (await orderIdFromDispatch(orgId, p.dispatchId));
    if (orderId) await recomputeOrderStatus(orgId, orderId);
  });
}
