// The parts of the story that belong to Vipul's modules (orders, purchase orders, goods receipts, stock lots) written as plain SQL
// against the §5 schema. Each function does what the service does, with the timestamp the story needs. When Vipul's services accept
// `{ at }`, swap the bodies for calls to them: nothing else in the simulation touches those tables.

import { withTenant } from '../../../server/src/db/withTenant.js';
import { explode } from '../../../server/src/modules/catalog/bom.service.js';
import { nextNumber } from '../../../server/src/utils/numbering.js';
import { round2 } from '../../../server/src/utils/money.js';
import { istParts } from '../../../server/src/utils/time.js';

/** A confirmed order of one or more fabric lines for an offline buyer. @returns {Promise<string>} the order id */
export function placeOrder(sim, { buyer, lines, deadline, priority = 'normal', at }) {
  const ctx = sim.ctx.sales;
  return withTenant(ctx, async (db) => {
    const contact = sim.contact[buyer];
    const { rows: [address] } = await db.query(`select address, city from contacts where id = $1`, [contact.id]);
    const { rows: [order] } = await db.query(
      `insert into orders (order_no, seller_org_id, buyer_contact_id, order_date, deadline, priority, status, delivery_address, created_at, created_by)
       values ($1, $2, $3, $4, $5, $6, 'confirmed', $7, $8, $9) returning id`,
      [await nextNumber(db, ctx.orgId, 'ORD'), ctx.orgId, contact.id, istParts(at).date, deadline, priority,
       [address.address, address.city].filter(Boolean).join(', '), at, ctx.userId]);
    for (const l of lines) {
      const item = sim.item[l.sku];
      await db.query(
        `insert into order_lines (order_id, seller_org_id, item_id, description, colour, qty, uom, rate) values ($1, $2, $3, $4, $5, $6, $7, $8)`,
        [order.id, ctx.orgId, item.id, item.name, l.colour ?? null, l.qty, item.uom, l.rate]);
    }
    await db.query(
      `insert into order_events (order_id, seller_org_id, event, visible_to_buyer, data, created_at, created_by) values ($1, $2, 'confirmed', true, '{}', $3, $4)`,
      [order.id, ctx.orgId, at, ctx.userId]);
    return order.id;
  });
}

/** Where the order stands. The status engine recomputes the real value at the end; the story needs it while it runs (dispatch checks it). */
export const setOrderStatus = (sim, orderId, status) => sim.sql(`update orders set status = $2 where id = $1`, [orderId, status]);

const RAW_KINDS = ['fibre', 'yarn', 'dye'];

/**
 * What an order's lines need from the raw store. `buy`: what stock does not cover, Map(item id → qty). `touched`: every raw item the
 * order will draw on, bought or not, so a lot still on its way can hold the order back.
 */
export function materialPlan(sim, lines) {
  return withTenant(sim.ctx.store, async (db) => {
    const alloc = new Map(), buy = new Map(), touched = new Set();
    const walk = (node) => {
      if (node.action === 'buy') buy.set(node.item.id, (buy.get(node.item.id) ?? 0) + node.to_make);
      if (node.required > 0 && RAW_KINDS.includes(sim.itemById[node.item.id]?.kind)) touched.add(node.item.id);
      node.children.forEach(walk);
    };
    for (const l of lines) walk(await explode(db, sim.item[l.sku].id, l.qty, { netStock: true, alloc }));
    return { buy, touched };
  });
}

/**
 * A supplier's delivery, received: purchase order, posted GRN, stock lots (with the supplier on them, which is how a bad batch
 * is traced back), the ledger movements, and the draft supplier bill an offline supplier leaves behind.
 * @param {{ supplier: string, lines: Array<{ sku: string, qty: number, rate: number }>, at: Date, forOrderId?: string }} delivery
 */
export function receiveGoods(sim, { supplier, lines, at, forOrderId = null }) {
  const ctx = sim.ctx.store;
  return withTenant(ctx, async (db) => {
    const supplierId = sim.contact[supplier].id;
    const { rows: [warehouse] } = await db.query(`select id from warehouses where org_id = $1 and kind = 'raw'`, [ctx.orgId]);

    const { rows: [po] } = await db.query(
      `insert into purchase_orders (po_no, buyer_org_id, supplier_contact_id, for_order_id, need_by, status, created_at, created_by)
       values ($1, $2, $3, $4, $5, 'received', $6, $7) returning id`,
      [await nextNumber(db, ctx.orgId, 'PO'), ctx.orgId, supplierId, forOrderId, istParts(at).date, sim.after(at, -3 * 24 * 60), ctx.userId]);
    const { rows: [grn] } = await db.query(
      `insert into goods_receipts (org_id, grn_no, supplier_contact_id, po_id, status, posted_at, created_at, created_by)
       values ($1, $2, $3, $4, 'posted', $5, $6, $7) returning id, grn_no`,
      [ctx.orgId, await nextNumber(db, ctx.orgId, 'GRN'), supplierId, po.id, sim.after(at, 30), at, ctx.userId]);

    const lots = [];
    for (const [i, l] of lines.entries()) {
      const item = sim.item[l.sku];
      const lotNo = `${grn.grn_no}-${i + 1}`;
      await db.query(
        `insert into po_lines (po_id, buyer_org_id, item_id, qty, accepted_qty, uom, rate) values ($1, $2, $3, $4, $4, $5, $6)`, [po.id, ctx.orgId, item.id, l.qty, item.uom, l.rate]);
      await db.query(
        `insert into receipt_lines (org_id, receipt_id, item_id, lot_no, expected_qty, received_qty, rate, for_order_id) values ($1, $2, $3, $4, $5, $5, $6, $7)`,
        [ctx.orgId, grn.id, item.id, lotNo, l.qty, l.rate, forOrderId]);
      const { rows: [lot] } = await db.query(
        `insert into stock_lots (org_id, item_id, warehouse_id, lot_no, unit_cost, supplier_contact_id, receipt_id, received_at, created_at, created_by)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $8, $9) returning id`,
        [ctx.orgId, item.id, warehouse.id, lotNo, l.rate, supplierId, grn.id, at, ctx.userId]);
      await db.query(
        `insert into stock_movements (org_id, item_id, lot_id, type, qty, ref_type, ref_id, created_at, created_by) values ($1, $2, $3, 'in', $4, 'grn', $5, $6, $7)`,
        [ctx.orgId, item.id, lot.id, l.qty, grn.id, at, ctx.userId]);
      lots.push({ sku: l.sku, lotId: lot.id, qty: l.qty });
    }
    await db.query(
      `insert into expenses (org_id, category, amount, date, note, paid, created_at, created_by) values ($1, 'supplier_bill', $2, $3, $4, false, $5, $6)`,
      [ctx.orgId, round2(lines.reduce((n, l) => n + l.qty * l.rate, 0)), istParts(at).date, `${supplier} · ${grn.grn_no}`, at, ctx.userId]);
    return { grnNo: grn.grn_no, lots };
  });
}
