// Low-stock alerts: items below their reorder level → one notification per item per day.

import { bus } from '../events/bus.js';
import { withTx } from '../db/tx.js';
import { formatQty } from '../utils/textile.js';
import { notifyOnceToday } from './notifyOnce.js';

const LINK_PREFIX = '/app/inventory/stock?item=';

/**
 * Notify about the low items that have not been alerted today (IST). Runs inside a transaction.
 * Pass `itemIds` to look only at those items. It does not emit anything because the caller's transaction is
 * still open: call emitLowStock() after commit.
 * @returns {Promise<Array<{ item_id: string, name: string }>>} the items alerted just now
 */
export async function alertLowStock(db, itemIds) {
  const { rows: low } = await db.query(
    `select item_id, name, uom, available, reorder_level from v_low_stock where $1::uuid[] is null or item_id = any($1) order by name`, [itemIds ?? null]);

  const alerted = [];
  for (const item of low) {
    const created = await notifyOnceToday(db, {
      requiredPermission: 'stock.view', type: 'stock.low', link: `${LINK_PREFIX}${item.item_id}`,
      title: `Low stock: ${item.name}`,
      body: `${formatQty(item.available, item.uom)} available, reorder level ${formatQty(item.reorder_level, item.uom)}`,
    });
    if (created) alerted.push(item);
  }
  return alerted;
}

/** `stock.low` { itemId } for each alerted item. Call after the transaction committed. */
export function emitLowStock(alerted) {
  for (const { item_id: itemId } of alerted) bus.emit('stock.low', { itemId });
}

async function run() {
  const alerted = await withTx((db) => alertLowStock(db));
  emitLowStock(alerted);
  return alerted.length;
}

export const lowStock = { name: 'lowStock', schedule: '0 * * * *', run };
