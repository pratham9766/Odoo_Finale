// The goods receipt that waits for a supplier's truck (backend plan §10.9). When the guard logs the vehicle in against a
// supplier dispatch, a draft GRN is made from the dispatch's lots, so the store keeper only checks the quantities and posts it.

import { nextNumber } from '../../utils/numbering.js';

/**
 * One draft GRN per dispatch: a vehicle that is logged twice (or comes back) gets the receipt it already has.
 * Lots the supplier added that are not on a PO line have no item to receive into: they are reported, not guessed.
 * @returns {Promise<{ id: string, grn_no: string, created: boolean, lines?: number, unmatched_lots?: string[] }>}
 */
export async function draftReceiptFromDispatch(db, ctx, { dispatch, entryId, vehicleNo, at }) {
  const { rows: [existing] } = await db.query(
    `select id, grn_no from goods_receipts where org_id = $1 and dispatch_id = $2 and status <> 'cancelled'`, [ctx.orgId, dispatch.id]);
  if (existing) return { ...existing, created: false };

  const { rows: lots } = await db.query(
    `select dl.lot_no, dl.qty, pl.item_id, pl.rate, po.for_order_id
       from dispatch_lots dl
       left join po_lines pl on pl.id = dl.po_line_id left join purchase_orders po on po.id = pl.po_id
      where dl.dispatch_id = $1 order by dl.lot_no`, [dispatch.id]);

  const { rows: [receipt] } = await db.query(
    `insert into goods_receipts (org_id, grn_no, supplier_org_id, po_id, dispatch_id, gate_entry_id, vehicle_no, created_at, created_by)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9) returning id, grn_no`,
    [ctx.orgId, await nextNumber(db, ctx.orgId, 'GRN'), dispatch.from_org_id, dispatch.po_id, dispatch.id, entryId, vehicleNo, at, ctx.userId]);

  const known = lots.filter((l) => l.item_id);
  for (const lot of known) {                                             // received = expected until the store keeper weighs it
    await db.query(
      `insert into receipt_lines (org_id, receipt_id, item_id, lot_no, expected_qty, received_qty, rate, for_order_id)
       values ($1, $2, $3, $4, $5, $5, $6, $7)`,
      [ctx.orgId, receipt.id, lot.item_id, lot.lot_no, lot.qty, lot.rate, lot.for_order_id]);
  }
  return { ...receipt, created: true, lines: known.length, unmatched_lots: lots.filter((l) => !l.item_id).map((l) => l.lot_no) };
}
