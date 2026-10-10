// The parts of the story that belong to Vipul's modules (orders, purchase orders, goods receipts), run through the real services
// with the timestamp the story needs (`{ at }`). Going through confirmOrder matters: it reserves the stock that work-order starts
// issue from (issueForWorkOrder only takes reserved stock).

import { withTx } from '../../../server/src/db/tx.js';
import { explode } from '../../../server/src/modules/catalog/bom.service.js';
import { createOrder, confirmOrder } from '../../../server/src/modules/orders/orders.service.js';
import { createPo, respondPo, sendPo } from '../../../server/src/modules/procurement/procurement.service.js';
import { createReceipt, postReceipt } from '../../../server/src/modules/inventory/inventory.service.js';
import { round2 } from '../../../server/src/utils/money.js';
import { istParts } from '../../../server/src/utils/time.js';

/** A confirmed order of one or more fabric lines for an offline buyer (stock reserved at confirm). @returns {Promise<string>} the order id */
export async function placeOrder(sim, { buyer, lines, deadline, priority = 'normal', at }) {
  const contact = sim.contact[buyer];
  const [address] = await sim.sql(`select address, city from contacts where id = $1`, [contact.id]);
  const order = await createOrder(sim.ctx.sales, {
    buyer_contact_id: contact.id, deadline, priority,
    delivery_address: [address.address, address.city].filter(Boolean).join(', '),
    lines: lines.map((l) => ({ item_id: sim.item[l.sku].id, qty: l.qty, uom: sim.item[l.sku].uom, rate: l.rate, colour: l.colour })),
  }, { at });
  await confirmOrder(sim.ctx.sales, order.id, {}, { at: sim.after(at, 30) });
  return order.id;
}

/** Where the order stands while the story runs (dispatch checks it). The status engine recomputes the real value at the end. */
export const setOrderStatus = (sim, orderId, status) => sim.sql(`update orders set status = $2 where id = $1`, [orderId, status]);

const RAW_KINDS = ['fibre', 'yarn', 'dye'];

/**
 * What an order's lines need from the raw store beyond what is already reserved. `buy`: Map(item id → qty). `touched`: every raw
 * item the order draws on, bought or not, so a lot still on its way can hold the order back.
 */
export function materialPlan(sim, lines) {
  return withTx(async (db) => {
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

let lotSeq = 0;

/**
 * A supplier's delivery, received through the real flow: purchase order sent and accepted (offline supplier: the mill records the
 * answer), GRN created and posted (lots with the supplier on them, ledger, reservations for `forOrderId`), plus the draft supplier
 * bill an offline supplier leaves behind (normally written by the grn.posted listener, which the seed does not run).
 * @param {{ supplier: string, lines: Array<{ sku: string, qty: number, rate: number }>, at: Date, forOrderId?: string }} delivery
 */
export async function receiveGoods(sim, { supplier, lines, at, forOrderId = null }) {
  const supplierId = sim.contact[supplier].id;
  const ordered = sim.after(at, -3 * 1440);
  const po = await createPo(sim.ctx.purchase, {
    supplier_contact_id: supplierId, for_order_id: forOrderId ?? undefined, need_by: istParts(at).date,
    lines: lines.map((l) => ({ item_id: sim.item[l.sku].id, qty: l.qty, rate: l.rate })),
  }, { at: ordered });
  await sendPo(sim.ctx.purchase, po.id, { at: sim.after(ordered, 20) });
  await respondPo(sim.ctx.purchase, po.id, { action: 'accept', promise_date: istParts(at).date }, { at: sim.after(ordered, 240) });

  const [warehouse] = await sim.sql(`select id from warehouses where kind = 'raw'`);
  const lineOf = new Map(po.lines.map((l) => [l.item_id, l.id]));
  const day = istParts(at).date.replace(/-/g, '').slice(2);
  const grn = await createReceipt(sim.ctx.store, {
    po_id: po.id,
    lines: lines.map((l) => ({
      item_id: sim.item[l.sku].id, lot_no: `${l.sku}-${day}-${++lotSeq}`, expected_qty: l.qty, received_qty: l.qty, rate: l.rate,
      warehouse_id: warehouse.id, po_line_id: lineOf.get(sim.item[l.sku].id), for_order_id: forOrderId ?? undefined,
    })),
  }, { at: sim.after(at, -10) });
  await postReceipt(sim.ctx.store, grn.id, { at });

  await sim.sql(
    `insert into expenses (category, amount, date, note, paid, created_at, created_by) values ('supplier_bill', $1, $2, $3, false, $4, $5)`,
    [round2(lines.reduce((n, l) => n + l.qty * l.rate, 0)), istParts(at).date, `${supplier} · ${grn.grn_no}`, at, sim.ctx.store.userId]);

  const lots = await sim.sql(
    `select l.id as "lotId", i.sku, l.lot_no from stock_lots l join items i on i.id = l.item_id where l.receipt_id = $1`, [grn.id]);
  return { grnNo: grn.grn_no, lots };
}
