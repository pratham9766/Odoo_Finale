// Purchase orders: create, approve, send, record the supplier's answer, cancel, and draft POs for an order's shortage.
import { withTx } from '../../db/tx.js';
import { AppError, must, notFound } from '../../utils/errors.js';
import { audit } from '../../utils/audit.js';
import { nextNumber } from '../../utils/numbering.js';
import { paged, where } from '../../utils/paginate.js';
import { hidePrices } from '../../middleware/rbac.js';

const PO_STATUS_FLOW = { accept: 'accepted', partial: 'partially_accepted', reject: 'rejected' };

// ---------- shared insert (used by createPO and order auto-drafting) ----------

export async function insertPo(db, ctx, { supplier_contact_id = null, for_order_id = null, need_by = null, notes = null, lines, at = null }) {
  if (supplier_contact_id) must((await db.query(`select 1 from contacts where id = $1 and type = 'supplier'`, [supplier_contact_id])).rows[0], 'Supplier contact');
  const { rows: items } = await db.query('select id, name from items where id = any($1)', [lines.map((l) => l.item_id)]);
  const names = new Map(items.map((i) => [i.id, i.name]));
  for (const l of lines) if (!names.has(l.item_id)) throw notFound('Item');

  const poNo = await nextNumber(db, 'PO');
  const { rows: [po] } = await db.query(
    `insert into purchase_orders (po_no, supplier_contact_id, for_order_id, need_by, notes, created_by, created_at)
     values ($1,$2,$3,$4,$5,$6, coalesce($7, now())) returning id, po_no`,
    [poNo, supplier_contact_id, for_order_id, need_by, notes, ctx.userId ?? null, at]);
  for (const l of lines) {
    await db.query(
      `insert into po_lines (po_id, item_id, description, supplier_item_ref, qty, uom, rate)
       select $1,$2,$3,$4,$5, i.uom, $6 from items i where i.id = $2`,
      [po.id, l.item_id, names.get(l.item_id), l.supplier_item_ref ?? null, l.qty, l.rate ?? 0]);
  }
  return po;
}

// shortages -> one draft PO per preferred supplier; items without a usable supplier are returned for manual handling
export async function autoDraftPos(db, ctx, { orderId, buyList, needBy }) {
  const groups = new Map();
  const unassigned = [];
  for (const b of buyList) {
    const contact = b.preferred_supplier_contact_id;
    if (!contact) { unassigned.push(b); continue; }
    if (!groups.has(contact)) groups.set(contact, { supplier_contact_id: contact, lines: [] });
    groups.get(contact).lines.push({ item_id: b.item_id, qty: b.qty, rate: b.est_rate ?? 0 });
  }
  const pos = [];
  for (const g of groups.values()) {
    const po = await insertPo(db, ctx, { ...g, for_order_id: orderId, need_by: needBy ?? null, notes: 'Auto-drafted from order shortage' });
    pos.push(po);
  }
  return { pos, unassigned };
}

// ---------- queries ----------

async function loadPo(db, id) {
  const { rows: [po] } = await db.query(
    `select p.*, c.name as supplier_name, o.order_no as for_order_no
       from purchase_orders p
       left join contacts c on c.id = p.supplier_contact_id
       left join orders o on o.id = p.for_order_id
      where p.id = $1`, [id]);
  must(po, 'Purchase order');
  const { rows: lines } = await db.query('select * from po_lines where po_id = $1 order by description', [id]);
  return { ...po, lines };
}

export const listPos = (ctx, q) =>
  withTx(async (db) => {
    const w = where().add('p.for_order_id = ?', q.for_order_id);
    if (q.status) w.raw('p.status = any(?::text[])', q.status.split(','));
    const { rows, meta } = await paged(
      db,
      `select p.id, p.po_no, p.status, p.need_by, p.promise_date, p.created_at, p.for_order_id,
              c.name as supplier_name, o.order_no as for_order_no,
              (select count(*)::int from po_lines l where l.po_id = p.id) as line_count,
              (select coalesce(sum(l.qty * l.rate), 0) from po_lines l where l.po_id = p.id) as total
         from purchase_orders p left join contacts c on c.id = p.supplier_contact_id left join orders o on o.id = p.for_order_id ${w.sql}`,
      w.params, q, 'created_at desc');
    return { data: rows.map((r) => hidePrices(ctx, r)), meta };
  });

export const getPo = (ctx, id) =>
  withTx(async (db) => {
    const po = await loadPo(db, id);
    return { ...po, lines: po.lines.map((l) => hidePrices(ctx, l)) };
  });

// ---------- lifecycle ----------

// `at` (optional, seed only) back-dates PO events; HTTP never passes it
export const createPo = (ctx, input, { at = null } = {}) =>
  withTx(async (db) => {
    const po = await insertPo(db, ctx, {
      supplier_contact_id: input.supplier_contact_id,
      for_order_id: input.for_order_id, need_by: input.need_by, notes: input.notes, lines: input.lines, at,
    });
    await audit(db, ctx, { action: 'create', table: 'purchase_orders', id: po.id, after: { po_no: po.po_no } });
    return loadPo(db, po.id);
  });

export const approvePo = (ctx, id) =>
  withTx(async (db) => {
    const { rows: [po] } = await db.query('select * from purchase_orders where id = $1 for update', [id]);
    must(po, 'Purchase order');
    if (po.status !== 'draft') throw new AppError(409, 'INVALID_STATE_TRANSITION', `PO is already ${po.status}`);
    await db.query('update purchase_orders set approved_by = $2, approved_at = now() where id = $1', [id, ctx.userId]);
    await audit(db, ctx, { action: 'approve', table: 'purchase_orders', id });
    return loadPo(db, id);
  });

export async function sendPo(ctx, id, { at = null } = {}) {
  const po = await withTx(async (db) => {
    const { rows: [p] } = await db.query('select * from purchase_orders where id = $1 for update', [id]);
    must(p, 'Purchase order');
    if (p.status !== 'draft') throw new AppError(409, 'INVALID_STATE_TRANSITION', `PO is already ${p.status}`);
    if (ctx.settings?.po_approval_required === true && !p.approved_by) {
      throw new AppError(409, 'INVALID_STATE_TRANSITION', 'This PO needs approval before it can be sent');
    }
    await db.query(`update purchase_orders set status = 'sent', sent_at = coalesce($2, now()) where id = $1`, [id, at]);
    await audit(db, ctx, { action: 'send', table: 'purchase_orders', id });
    return loadPo(db, id);
  });
  return po;
}

export async function respondPo(ctx, id, input, { at = null } = {}) {
  const po = await withTx(async (db) => {
    const { rows: [p] } = await db.query('select * from purchase_orders where id = $1 for update', [id]);
    must(p, 'Purchase order');
    // the mill records the supplier's answer (suppliers are contacts, they don't log in)
    if (p.status !== 'sent') throw new AppError(409, 'INVALID_STATE_TRANSITION', `PO is ${p.status}, expected sent`);

    const { rows: lines } = await db.query('select id, qty from po_lines where po_id = $1', [id]);
    const accepted = new Map(lines.map((l) => [l.id, input.action === 'accept' ? l.qty : 0]));
    if (input.action === 'partial') {
      for (const a of input.lines) {
        const line = lines.find((l) => l.id === a.po_line_id);
        if (!line) throw new AppError(422, 'VALIDATION_FAILED', 'Unknown PO line');
        if (a.accepted_qty > line.qty) throw new AppError(422, 'QTY_EXCEEDS_ORDER', 'Accepted quantity is more than ordered');
        accepted.set(a.po_line_id, a.accepted_qty);
      }
    }
    for (const [lineId, q] of accepted) await db.query('update po_lines set accepted_qty = $2 where id = $1', [lineId, q]);
    let status = PO_STATUS_FLOW[input.action];
    if (status === 'partially_accepted' && lines.every((l) => accepted.get(l.id) >= l.qty)) status = 'accepted';
    if (status === 'partially_accepted' && lines.every((l) => (accepted.get(l.id) ?? 0) === 0)) status = 'rejected';
    await db.query(
      `update purchase_orders set status = $2, promise_date = $3, response_note = $4, responded_at = coalesce($5, now()) where id = $1`,
      [id, status, input.promise_date ?? null, input.note ?? null, at]);
    await audit(db, ctx, { action: 'respond', table: 'purchase_orders', id, after: { status } });
    return loadPo(db, id);
  });
  return { ...po, lines: po.lines.map((l) => hidePrices(ctx, l)) };
}

export const cancelPo = (ctx, id) =>
  withTx(async (db) => {
    const { rows: [p] } = await db.query('select * from purchase_orders where id = $1 for update', [id]);
    must(p, 'Purchase order');
    if (!['draft', 'sent'].includes(p.status)) throw new AppError(409, 'INVALID_STATE_TRANSITION', `A ${p.status} PO cannot be cancelled`);
    await db.query(`update purchase_orders set status = 'cancelled' where id = $1`, [id]);
    await audit(db, ctx, { action: 'cancel', table: 'purchase_orders', id });
    return { id, status: 'cancelled' };
  });
