// Stock views, goods receipts (draft, post, cancel) and stock adjustments (request, approve, reject).
import { withTx } from '../../db/tx.js';
import { AppError, must, notFound } from '../../utils/errors.js';
import { audit } from '../../utils/audit.js';
import { nextNumber } from '../../utils/numbering.js';
import { paged, where } from '../../utils/paginate.js';
import { round3 } from '../../utils/money.js';
import { hidePrices } from '../../middleware/rbac.js';
import { bus } from '../../events/bus.js';
import { freeLots } from './inventory.core.js';

// ---------- stock views ----------

export const listStock = (ctx, q) =>
  withTx(async (db) => {
    const w = where().add('kind = ?', q.kind).add('is_low = ?', q.low);
    if (q.q) w.raw('name ilike ?', `%${q.q}%`);
    const { rows, meta } = await paged(db, `select * from v_stock ${w.sql}`, w.params, q, 'name');
    return { data: rows, meta };
  });

export const listLots = (ctx, q) =>
  withTx(async (db) => {
    const w = where().add('l.item_id = ?', q.item_id);
    const having = q.in_stock ? 'where on_hand > 0' : '';
    const { rows, meta } = await paged(
      db,
      `select * from (
         select l.id, l.item_id, i.name as item_name, i.uom, l.lot_no, l.unit_cost, l.dye_batch, l.received_at,
                l.supplier_contact_id, coalesce(m.q, 0) as on_hand, coalesce(r.q, 0) as reserved
           from stock_lots l join items i on i.id = l.item_id
           left join (select lot_id, sum(qty) q from stock_movements group by lot_id) m on m.lot_id = l.id
           left join (select lot_id, sum(qty) q from reservations where status = 'active' group by lot_id) r on r.lot_id = l.id
           ${w.sql}) t ${having}`,
      w.params, q, 'received_at desc');
    return { data: rows.map((r) => hidePrices(ctx, r)), meta };
  });

export const listMovements = (ctx, q) =>
  withTx(async (db) => {
    const w = where().add('m.item_id = ?', q.item_id).add('m.lot_id = ?', q.lot_id).add('m.type = ?', q.type)
      .add('m.created_at >= ?', q.from).add('m.created_at < (?::date + 1)', q.to);
    const { rows, meta } = await paged(
      db,
      `select m.id, m.item_id, i.name as item_name, i.uom, m.lot_id, l.lot_no, m.type, m.qty, m.ref_type, m.ref_id, m.reason, m.created_at
         from stock_movements m join items i on i.id = m.item_id left join stock_lots l on l.id = m.lot_id ${w.sql}`,
      w.params, q, 'created_at desc');
    return { data: rows, meta };
  });

export const finishedStock = (_ctx) =>
  withTx(async (db) => (await db.query('select * from v_finished_stock order by created_at')).rows);

// ---------- goods receipts (GRN) ----------

async function loadReceipt(db, id) {
  const { rows: [g] } = await db.query(
    `select g.*, c.name as supplier_name from goods_receipts g left join contacts c on c.id = g.supplier_contact_id where g.id = $1`, [id]);
  must(g, 'Receipt');
  const { rows: lines } = await db.query(
    `select l.*, i.name as item_name, i.uom from receipt_lines l join items i on i.id = l.item_id where l.receipt_id = $1 order by i.name`, [id]);
  return { ...g, lines };
}

export const listReceipts = (ctx, q) =>
  withTx(async (db) => {
    const w = where().add('g.status = ?', q.status).add('g.supplier_contact_id = ?', q.supplier_contact_id);
    const { rows, meta } = await paged(
      db,
      `select g.id, g.grn_no, g.status, g.posted_at, g.created_at, g.vehicle_no, g.po_id,
              c.name as supplier_name,
              (select count(*)::int from receipt_lines l where l.receipt_id = g.id) as line_count
         from goods_receipts g left join contacts c on c.id = g.supplier_contact_id ${w.sql}`,
      w.params, q, 'created_at desc');
    return { data: rows, meta };
  });

export const getReceipt = (ctx, id) =>
  withTx(async (db) => {
    const g = await loadReceipt(db, id);
    return { ...g, lines: g.lines.map((l) => hidePrices(ctx, l)) };
  });

// `at` (optional, seed only) back-dates the receipt; HTTP never passes it
export const createReceipt = (ctx, i, { at = null } = {}) =>
  withTx(async (db) => {
    if (i.po_id) {
      const { rows: [po] } = await db.query('select supplier_contact_id from purchase_orders where id = $1', [i.po_id]);
      if (!po) throw notFound('Purchase order');
      i.supplier_contact_id ??= po.supplier_contact_id ?? undefined;
    }
    const grnNo = await nextNumber(db, 'GRN');
    const { rows: [g] } = await db.query(
      `insert into goods_receipts (grn_no, supplier_contact_id, po_id, vehicle_no, notes, created_by, created_at)
       values ($1,$2,$3,$4,$5,$6, coalesce($7, now())) returning id`,
      [grnNo, i.supplier_contact_id ?? null, i.po_id ?? null, i.vehicle_no ?? null, i.notes ?? null, ctx.userId, at]);
    for (const l of i.lines) {
      await db.query(
        `insert into receipt_lines (receipt_id, item_id, lot_no, warehouse_id, po_line_id, expected_qty, received_qty, rate, dye_batch, for_order_id)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10)`,
        [g.id, l.item_id, l.lot_no, l.warehouse_id ?? null, l.po_line_id ?? null, l.expected_qty ?? null,
         l.received_qty, l.rate, l.dye_batch ?? null, l.for_order_id ?? null]);
    }
    await audit(db, ctx, { action: 'create', table: 'goods_receipts', id: g.id, after: { grn_no: grnNo } });
    return loadReceipt(db, g.id);
  });

// §11.6 — one transaction: lots, ledger, order reservations, PO progress
export async function postReceipt(ctx, id, { at = null } = {}) {
  const out = await withTx(async (db) => {
    const { rows: [g] } = await db.query('select * from goods_receipts where id = $1 for update', [id]);
    must(g, 'Receipt');
    if (g.status !== 'draft') throw new AppError(409, 'INVALID_STATE_TRANSITION', `Receipt is already ${g.status}`);
    const { rows: lines } = await db.query('select * from receipt_lines where receipt_id = $1', [id]);
    const live = lines.filter((l) => l.received_qty > 0);
    if (!live.length) throw new AppError(422, 'VALIDATION_FAILED', 'Nothing received: all quantities are 0');

    let value = 0;
    for (const l of live) {
      const { rows: [lot] } = await db.query(
        `insert into stock_lots (item_id, warehouse_id, lot_no, unit_cost, supplier_contact_id, receipt_id, dye_batch, created_by, received_at, created_at)
         values ($1,$2,$3,$4,$5,$6,$7,$8, coalesce($9, now()), coalesce($9, now()))
         on conflict (item_id, lot_no) do update set
           unit_cost = case when stock_lots.unit_cost = 0 then excluded.unit_cost else stock_lots.unit_cost end
         returning id`,
        [l.item_id, l.warehouse_id, l.lot_no, l.rate, g.supplier_contact_id, id, l.dye_batch, ctx.userId, at]);
      await db.query(
        `insert into stock_movements (item_id, lot_id, type, qty, ref_type, ref_id, created_by, created_at)
         values ($1,$2,'in',$3,'grn',$4,$5, coalesce($6, now()))`, [l.item_id, lot.id, l.received_qty, id, ctx.userId, at]);
      if (l.for_order_id) {
        await db.query(
          `insert into reservations (item_id, lot_id, order_id, qty, created_by, created_at) values ($1,$2,$3,$4,$5, coalesce($6, now()))`,
          [l.item_id, lot.id, l.for_order_id, l.received_qty, ctx.userId, at]);
      }
      if (l.po_line_id) await db.query('update po_lines set received_qty = received_qty + $2 where id = $1', [l.po_line_id, l.received_qty]);
      value += l.received_qty * l.rate;
    }
    await db.query(`update goods_receipts set status = 'posted', posted_at = coalesce($2, now()) where id = $1`, [id, at]);

    if (g.po_id) {
      const { rows: [{ open_lines }] } = await db.query(
        `select count(*)::int as open_lines from po_lines where po_id = $1 and received_qty < coalesce(accepted_qty, qty) - 0.0005`, [g.po_id]);
      if (open_lines === 0) await db.query(`update purchase_orders set status = 'received' where id = $1 and status in ('accepted','partially_accepted','dispatched')`, [g.po_id]);
    }
    await audit(db, ctx, { action: 'post', table: 'goods_receipts', id, after: { grn_no: g.grn_no, value: Math.round(value * 100) / 100 } });
    const receipt = await loadReceipt(db, id);
    return { receipt, itemIds: [...new Set(live.map((l) => l.item_id))], value };
  });
  bus.emit('grn.posted', { receiptId: id, grnNo: out.receipt.grn_no, itemIds: out.itemIds, value: out.value });
  return { ...out.receipt, lines: out.receipt.lines.map((l) => hidePrices(ctx, l)) };
}

export const cancelReceipt = (ctx, id) =>
  withTx(async (db) => {
    const { rowCount } = await db.query(`update goods_receipts set status = 'cancelled' where id = $1 and status = 'draft'`, [id]);
    if (!rowCount) throw new AppError(409, 'INVALID_STATE_TRANSITION', 'Only draft receipts can be cancelled');
    return { id };
  });

// ---------- adjustments ----------

export const listAdjustments = (ctx, q) =>
  withTx(async (db) => {
    const w = where().add('a.status = ?', q.status);
    const { rows, meta } = await paged(
      db,
      `select a.*, i.name as item_name, i.uom, l.lot_no from stock_adjustments a join items i on i.id = a.item_id
         left join stock_lots l on l.id = a.lot_id ${w.sql}`,
      w.params, q, 'created_at desc');
    return { data: rows, meta };
  });

export const createAdjustment = (ctx, i) =>
  withTx(async (db) => {
    must((await db.query('select 1 from items where id = $1', [i.item_id])).rows[0], 'Item');
    if (i.lot_id) {
      const { rows: [l] } = await db.query('select item_id from stock_lots where id = $1', [i.lot_id]);
      if (!l || l.item_id !== i.item_id) throw new AppError(422, 'VALIDATION_FAILED', 'Lot does not belong to this item');
    } else if (i.qty < 0) {
      throw new AppError(422, 'VALIDATION_FAILED', 'Choose the lot to reduce');
    }
    const adjNo = await nextNumber(db, 'ADJ');
    const { rows: [a] } = await db.query(
      `insert into stock_adjustments (adj_no, item_id, lot_id, qty, reason, created_by) values ($1,$2,$3,$4,$5,$6) returning *`,
      [adjNo, i.item_id, i.lot_id ?? null, i.qty, i.reason, ctx.userId]);
    await audit(db, ctx, { action: 'request', table: 'stock_adjustments', id: a.id, after: a });
    return a;
  });

async function decide(ctx, id, approve) {
  return withTx(async (db) => {
    const { rows: [a] } = await db.query('select * from stock_adjustments where id = $1 for update', [id]);
    must(a, 'Adjustment');
    if (a.status !== 'pending') throw new AppError(409, 'INVALID_STATE_TRANSITION', `Adjustment is already ${a.status}`);
    if (approve && a.created_by === ctx.userId && ctx.rank < 100) {
      throw new AppError(403, 'FORBIDDEN', 'Someone else must approve your adjustment');
    }
    if (approve) {
      let lotId = a.lot_id;
      if (lotId) {
        const lot = (await freeLots(db, a.item_id)).find((l) => l.id === lotId);
        const free = lot?.free ?? 0;
        if (a.qty < 0 && free + a.qty < -0.0005) throw new AppError(409, 'INSUFFICIENT_STOCK', `Only ${round3(free)} free in this lot (rest is reserved)`);
      } else {
        const { rows: [lot] } = await db.query(
          `insert into stock_lots (item_id, lot_no, created_by) values ($1,$2,$3)
           on conflict (item_id, lot_no) do update set lot_no = excluded.lot_no returning id`,
          [a.item_id, a.adj_no, ctx.userId]);
        lotId = lot.id;
      }
      await db.query(
        `insert into stock_movements (item_id, lot_id, type, qty, ref_type, ref_id, reason, created_by)
         values ($1,$2,'adjust',$3,'adjustment',$4,$5,$6)`, [a.item_id, lotId, a.qty, a.id, a.reason, ctx.userId]);
    }
    const { rows: [u] } = await db.query(
      `update stock_adjustments set status = $2, approved_by = $3, decided_at = now() where id = $1 returning *`,
      [id, approve ? 'approved' : 'rejected', ctx.userId]);
    await audit(db, ctx, { action: approve ? 'approve' : 'reject', table: 'stock_adjustments', id, after: u });
    return u;
  });
}
export const approveAdjustment = (ctx, id) => decide(ctx, id, true);
export const rejectAdjustment = (ctx, id) => decide(ctx, id, false);

// stock primitives live in inventory.core.js; re-exported so modules can import them from the service
export { issueForWorkOrder, produce, reserveFifo, releaseReservations, freeLots } from './inventory.core.js';
