// Low-stock alerts (backend plan §14): items below their reorder level → one notification per item per day.

import { bus } from '../events/bus.js';
import { formatQty } from '../utils/textile.js';
import { forEachActiveOrg } from './forEachActiveOrg.js';
import { notifyOnceToday } from './notifyOnce.js';

const LINK_PREFIX = '/app/inventory/stock?item=';

/**
 * Notify about the org's low items that have not been alerted today (IST). Runs inside withSystem(orgId).
 * Pass `itemIds` to look only at those items: the grn.posted listener does, with the items just received.
 * It does not emit anything because the caller's transaction is still open: call emitLowStock() after commit.
 * @returns {Promise<Array<{ item_id: string, name: string }>>} the items alerted just now
 */
export async function alertLowStock(db, orgId, itemIds) {
  const { rows: low } = await db.query(
    `select item_id, name, uom, available, reorder_level from v_low_stock where $1::uuid[] is null or item_id = any($1) order by name`, [itemIds ?? null]);

  const alerted = [];
  for (const item of low) {
    const created = await notifyOnceToday(db, {
      orgId, requiredPermission: 'stock.view', type: 'stock.low', link: `${LINK_PREFIX}${item.item_id}`,
      title: `Low stock: ${item.name}`,
      body: `${formatQty(item.available, item.uom)} available, reorder level ${formatQty(item.reorder_level, item.uom)}`,
    });
    if (created) alerted.push(item);
  }
  return alerted;
}

/** `stock.low` { orgId, itemId } for each alerted item (backend plan §12). Call after the transaction committed. */
export function emitLowStock(orgId, alerted) {
  for (const { item_id: itemId } of alerted) bus.emit('stock.low', { orgId, itemId });
}

async function run() {
  const { ok } = await forEachActiveOrg('lowStock', (db, orgId) => alertLowStock(db, orgId));
  for (const { orgId, result } of ok) emitLowStock(orgId, result);
  return ok.reduce((total, { result }) => total + result.length, 0);
}

export const lowStock = { name: 'lowStock', schedule: '0 * * * *', run };
