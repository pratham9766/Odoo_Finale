// POST /orders/:id/plan: turn an order into work orders, one per stage and item that has to be made (backend plan §11.4).
//
// explode() nets stock level by level, so each `produce` node's to_make is already grossed up for the loss of
// the stages after it and reduced by what stock covers. Stock reserved for THIS order counts as available to it
// (forOrderId), otherwise confirming would reserve the stock and planning would then make it all over again.

import { withTenant } from '../../db/withTenant.js';
import { bus } from '../../events/bus.js';
import { audit } from '../../utils/audit.js';
import { AppError } from '../../utils/errors.js';
import { nextNumber } from '../../utils/numbering.js';
import { convertQty } from '../../utils/textile.js';
import { explode } from '../catalog/bom.service.js';
import { workOrdersFromTree } from './planTree.js';
import { workOrders } from './workOrders.service.js';

const PLANNABLE = ['confirmed', 'waiting_material', 'material_ready', 'in_production'];

/** Order-line quantity in the item's own unit; a missing roll length or GSM is the user's data to fix, not a server error. */
function lineQty(line) {
  try {
    return convertQty(line.qty, line.uom, { name: line.name, uom: line.item_uom, width_m: line.width_m, gsm: line.gsm, roll_length_m: line.roll_length_m });
  } catch (err) {
    if (err instanceof RangeError) throw new AppError(422, 'VALIDATION_FAILED', err.message);
    throw err;
  }
}

/** → the work orders created by this call (lines that already have work orders are left alone). `at` lets the seed replay history. */
export async function planOrder(ctx, orderId, { at = new Date() } = {}) {
  const createdIds = await withTenant(ctx, async (db) => {
    const { rows: [order] } = await db.query(
      `select id, order_no, status, buyer_org_id from orders where id = $1 and seller_org_id = $2 for update`, [orderId, ctx.orgId]);
    if (!order) throw new AppError(404, 'NOT_FOUND', 'Order not found');
    if (!PLANNABLE.includes(order.status)) {
      throw new AppError(409, 'INVALID_STATE_TRANSITION', `Order ${order.order_no} is ${order.status}; only confirmed orders can be planned`);
    }

    const { rows: lines } = await db.query(
      `select l.id, l.qty, l.uom, i.id as item_id, i.name, i.uom as item_uom, i.width_m, i.gsm, i.roll_length_m
         from order_lines l join items i on i.id = l.item_id
        where l.order_id = $1
          and not exists (select 1 from work_orders w
                           where w.order_line_id = l.id and w.status <> 'cancelled' and not w.is_rework)
        order by i.name, l.colour, l.id`, [orderId]);
    if (!lines.length) throw new AppError(409, 'INVALID_STATE_TRANSITION', `Order ${order.order_no} is already planned`);

    const { rows: stages } = await db.query(`select id, sequence from stages where org_id = $1`, [ctx.orgId]);
    const sequence = new Map(stages.map((s) => [s.id, s.sequence]));

    const alloc = new Map();                      // one stock allocation for the whole order: lines must not both count the same stock
    const specs = [];
    for (const line of lines) {
      const tree = await explode(db, line.item_id, lineQty(line), { netStock: true, alloc, forOrderId: orderId });
      if (tree.action === 'buy') throw new AppError(422, 'BOM_MISSING', `${line.name} has no BOM, so it cannot be planned`);
      specs.push(...workOrdersFromTree(tree).map((w) => ({ ...w, order_line_id: line.id })));
    }
    specs.sort((a, b) => sequence.get(a.stage_id) - sequence.get(b.stage_id));   // upstream stages get the lower numbers (stable sort)

    const ids = [];
    for (const w of specs) {
      const { rows: [row] } = await db.query(
        `insert into work_orders (org_id, wo_no, order_id, order_line_id, stage_id, output_item_id, target_qty, uom, created_at, created_by)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10) returning id`,
        [ctx.orgId, await nextNumber(db, ctx.orgId, 'WO'), orderId, w.order_line_id, w.stage_id, w.output_item_id, w.target_qty, w.uom, at, ctx.userId]);
      ids.push(row.id);
    }

    await db.query(
      `insert into order_events (order_id, seller_org_id, buyer_org_id, event, visible_to_buyer, data, created_at, created_by)
       values ($1, $2, $3, 'production_planned', false, $4, $5, $6)`,
      [orderId, ctx.orgId, order.buyer_org_id, JSON.stringify({ work_orders: ids.length }), at, ctx.userId]);
    await audit(db, ctx, { action: 'plan', table: 'orders', id: orderId, after: { work_orders: ids } });
    return ids;
  });

  bus.emit('order.planned', { orderId, sellerOrgId: ctx.orgId, workOrderIds: createdIds });
  const { rows } = await workOrders.list(ctx, { order_id: orderId });
  return rows.filter((w) => createdIds.includes(w.id));
}
