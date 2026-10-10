import { withTenant } from '../../db/withTenant.js';
import { AppError, must, notFound } from '../../utils/errors.js';
import { audit } from '../../utils/audit.js';
import { nextNumber } from '../../utils/numbering.js';
import { paged, where } from '../../utils/paginate.js';
import { hidePrices } from '../../middleware/rbac.js';
import { bus } from '../../events/bus.js';
import { isSupplierOf, arePartners } from '../partners/partners.service.js';
import { createTripForDispatch } from '../transport/trips.core.js';

const PO_STATUS_FLOW = { accept: 'accepted', partial: 'partially_accepted', reject: 'rejected' };

// ---------- shared insert (used by createPO and order auto-drafting) ----------

export async function insertPo(db, ctx, { supplier_org_id = null, supplier_contact_id = null, for_order_id = null, need_by = null, notes = null, lines }) {
  if (supplier_org_id && !(await isSupplierOf(db, supplier_org_id, ctx.orgId))) {
    throw new AppError(403, 'NOT_PARTNERS', 'This supplier is not connected to you');
  }
  if (supplier_contact_id) must((await db.query('select 1 from contacts where id = $1', [supplier_contact_id])).rows[0], 'Supplier contact');
  const { rows: items } = await db.query('select id, name from items where id = any($1)', [lines.map((l) => l.item_id)]);
  const names = new Map(items.map((i) => [i.id, i.name]));
  for (const l of lines) if (!names.has(l.item_id)) throw notFound('Item');

  const poNo = await nextNumber(db, ctx.orgId, 'PO');
  const { rows: [po] } = await db.query(
    `insert into purchase_orders (po_no, buyer_org_id, supplier_org_id, supplier_contact_id, for_order_id, need_by, notes, created_by)
     values ($1,$2,$3,$4,$5,$6,$7,$8) returning id, po_no`,
    [poNo, ctx.orgId, supplier_org_id, supplier_contact_id, for_order_id, need_by, notes, ctx.userId ?? null]);
  for (const l of lines) {
    await db.query(
      `insert into po_lines (po_id, buyer_org_id, supplier_org_id, item_id, description, supplier_item_ref, qty, uom, rate)
       select $1,$2,$3,$4,$5,$6,$7, i.uom, $8 from items i where i.id = $4`,
      [po.id, ctx.orgId, supplier_org_id, l.item_id, names.get(l.item_id), l.supplier_item_ref ?? null, l.qty, l.rate ?? 0]);
  }
  return po;
}

// shortages -> one draft PO per preferred supplier; items without a usable supplier are returned for manual handling
export async function autoDraftPos(db, ctx, { orderId, buyList, needBy }) {
  const groups = new Map();
  const unassigned = [];
  for (const b of buyList) {
    const org = b.preferred_supplier_org_id; const contact = b.preferred_supplier_contact_id;
    if (!org && !contact) { unassigned.push(b); continue; }
    if (org && !(await isSupplierOf(db, org, ctx.orgId))) { unassigned.push(b); continue; }
    const key = org ? `o:${org}` : `c:${contact}`;
    if (!groups.has(key)) groups.set(key, { supplier_org_id: org ?? null, supplier_contact_id: org ? null : contact, lines: [] });
    groups.get(key).lines.push({ item_id: b.item_id, qty: b.qty, rate: b.est_rate ?? 0 });
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
    `select p.*, coalesce(so.name, c.name) as supplier_name, bo.name as buyer_name, o.order_no as for_order_no
       from purchase_orders p
       left join organizations so on so.id = p.supplier_org_id
       left join organizations bo on bo.id = p.buyer_org_id
       left join contacts c on c.id = p.supplier_contact_id
       left join orders o on o.id = p.for_order_id
      where p.id = $1`, [id]);
  must(po, 'Purchase order');
  const { rows: lines } = await db.query('select * from po_lines where po_id = $1 order by description', [id]);
  return { ...po, lines };
}

export const listPos = (ctx, q) =>
  withTenant(ctx, async (db) => {
    const w = where().add('p.for_order_id = ?', q.for_order_id);
    w.raw(q.side === 'incoming' ? 'p.supplier_org_id = ?' : 'p.buyer_org_id = ?', ctx.orgId);
    if (q.status) w.raw('p.status = any(?::text[])', q.status.split(','));
    const { rows, meta } = await paged(
      db,
      `select p.id, p.po_no, p.status, p.need_by, p.promise_date, p.created_at, p.for_order_id,
              coalesce(so.name, c.name) as supplier_name, bo.name as buyer_name,
              (select count(*)::int from po_lines l where l.po_id = p.id) as line_count,
              (select coalesce(sum(l.qty * l.rate), 0) from po_lines l where l.po_id = p.id) as total
         from purchase_orders p left join organizations so on so.id = p.supplier_org_id
         left join organizations bo on bo.id = p.buyer_org_id left join contacts c on c.id = p.supplier_contact_id ${w.sql}`,
      w.params, q, 'created_at desc');
    return { data: rows.map((r) => hidePrices(ctx, r)), meta };
  });

export const getPo = (ctx, id) =>
  withTenant(ctx, async (db) => {
    const po = await loadPo(db, id);
    return { ...po, lines: po.lines.map((l) => hidePrices(ctx, l)) };
  });

// ---------- lifecycle ----------

export const createPo = (ctx, input) =>
  withTenant(ctx, async (db) => {
    const po = await insertPo(db, ctx, {
      supplier_org_id: input.supplier_org_id, supplier_contact_id: input.supplier_contact_id,
      for_order_id: input.for_order_id, need_by: input.need_by, notes: input.notes, lines: input.lines,
    });
    await audit(db, ctx, { action: 'create', table: 'purchase_orders', id: po.id, after: { po_no: po.po_no } });
    return loadPo(db, po.id);
  });

export const approvePo = (ctx, id) =>
  withTenant(ctx, async (db) => {
    const { rows: [po] } = await db.query('select * from purchase_orders where id = $1 for update', [id]);
    must(po, 'Purchase order');
    if (po.buyer_org_id !== ctx.orgId) throw new AppError(403, 'FORBIDDEN', 'Only the buyer can approve a PO');
    if (po.status !== 'draft') throw new AppError(409, 'INVALID_STATE_TRANSITION', `PO is already ${po.status}`);
    await db.query('update purchase_orders set approved_by = $2, approved_at = now() where id = $1', [id, ctx.userId]);
    await audit(db, ctx, { action: 'approve', table: 'purchase_orders', id });
    return loadPo(db, id);
  });

export async function sendPo(ctx, id) {
  const po = await withTenant(ctx, async (db) => {
    const { rows: [p] } = await db.query('select * from purchase_orders where id = $1 for update', [id]);
    must(p, 'Purchase order');
    if (p.buyer_org_id !== ctx.orgId) throw new AppError(403, 'FORBIDDEN', 'Only the buyer can send a PO');
    if (p.status !== 'draft') throw new AppError(409, 'INVALID_STATE_TRANSITION', `PO is already ${p.status}`);
    if (ctx.settings?.po_approval_required === true && !p.approved_by) {
      throw new AppError(409, 'INVALID_STATE_TRANSITION', 'This PO needs approval before it can be sent');
    }
    await db.query(`update purchase_orders set status = 'sent', sent_at = now() where id = $1`, [id]);
    await audit(db, ctx, { action: 'send', table: 'purchase_orders', id });
    return loadPo(db, id);
  });
  bus.emit('po.sent', { poId: id, poNo: po.po_no, buyerOrgId: po.buyer_org_id, supplierOrgId: po.supplier_org_id });
  return po;
}

export async function respondPo(ctx, id, input) {
  const po = await withTenant(ctx, async (db) => {
    const { rows: [p] } = await db.query('select * from purchase_orders where id = $1 for update', [id]);
    must(p, 'Purchase order');
    const asSupplier = p.supplier_org_id === ctx.orgId;
    const asBuyerForOffline = p.buyer_org_id === ctx.orgId && !p.supplier_org_id; // the mill records an offline supplier's answer
    if (!asSupplier && !asBuyerForOffline) throw new AppError(403, 'FORBIDDEN', 'You are not the supplier of this PO');
    if (asSupplier && !ctx.permissions.has('po.respond')) throw new AppError(403, 'FORBIDDEN', 'Missing permission: po.respond');
    if (asBuyerForOffline && !ctx.permissions.has('po.create')) throw new AppError(403, 'FORBIDDEN', 'Missing permission: po.create');
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
      `update purchase_orders set status = $2, promise_date = $3, response_note = $4, responded_at = now() where id = $1`,
      [id, status, input.promise_date ?? null, input.note ?? null]);
    await audit(db, ctx, { action: 'respond', table: 'purchase_orders', id, after: { status } });
    return loadPo(db, id);
  });
  bus.emit('po.responded', { poId: id, poNo: po.po_no, buyerOrgId: po.buyer_org_id, supplierOrgId: po.supplier_org_id, status: po.status });
  return { ...po, lines: po.lines.map((l) => hidePrices(ctx, l)) };
}

export const cancelPo = (ctx, id) =>
  withTenant(ctx, async (db) => {
    const { rows: [p] } = await db.query('select * from purchase_orders where id = $1 for update', [id]);
    must(p, 'Purchase order');
    if (p.buyer_org_id !== ctx.orgId) throw new AppError(403, 'FORBIDDEN', 'Only the buyer can cancel a PO');
    if (!['draft', 'sent'].includes(p.status)) throw new AppError(409, 'INVALID_STATE_TRANSITION', `A ${p.status} PO cannot be cancelled`);
    await db.query(`update purchase_orders set status = 'cancelled' where id = $1`, [id]);
    await audit(db, ctx, { action: 'cancel', table: 'purchase_orders', id });
    return { id, status: 'cancelled' };
  });

// ---------- supplier dispatch (supplier ships accepted PO lines to the mill) ----------

export async function dispatchPo(ctx, id, input) {
  const res = await withTenant(ctx, async (db) => {
    const { rows: [po] } = await db.query('select * from purchase_orders where id = $1 for update', [id]);
    must(po, 'Purchase order');
    if (po.supplier_org_id !== ctx.orgId) throw new AppError(403, 'FORBIDDEN', 'Only the supplier can dispatch this PO');
    if (!['accepted', 'partially_accepted', 'dispatched'].includes(po.status)) {
      throw new AppError(409, 'INVALID_STATE_TRANSITION', `PO is ${po.status}; accept it before dispatching`);
    }
    const { rows: lines } = await db.query(
      `select l.id, l.description, l.uom, coalesce(l.accepted_qty, 0) as accepted,
              coalesce((select sum(dl.qty) from dispatch_lots dl where dl.po_line_id = l.id), 0) as shipped
         from po_lines l where l.po_id = $1`, [id]);
    const byId = new Map(lines.map((l) => [l.id, l]));
    const planned = new Map();
    for (const lot of input.lots) {
      const line = byId.get(lot.po_line_id);
      if (!line) throw new AppError(422, 'VALIDATION_FAILED', 'Lot refers to a line of another PO');
      const total = (planned.get(lot.po_line_id) ?? 0) + lot.qty;
      planned.set(lot.po_line_id, total);
      if (line.shipped + total > line.accepted + 0.0005) {
        throw new AppError(409, 'QTY_EXCEEDS_ORDER', `${line.description}: only ${line.accepted - line.shipped} left to dispatch`);
      }
    }
    const dispatchNo = await nextNumber(db, ctx.orgId, 'DSP');
    const { rows: [d] } = await db.query(
      `insert into dispatches (dispatch_no, from_org_id, to_org_id, kind, po_id, transporter_org_id, vehicle_no, driver_name, driver_phone,
                               status, confirmed_at, created_by)
       values ($1,$2,$3,'supply',$4,$5,$6,$7,$8,'confirmed', now(), $9) returning *`,
      [dispatchNo, ctx.orgId, po.buyer_org_id, id, input.transporter_org_id ?? null, input.vehicle_no ?? null,
       input.driver_name ?? null, input.driver_phone ?? null, ctx.userId]);
    for (const lot of input.lots) {
      await db.query(
        `insert into dispatch_lots (dispatch_id, from_org_id, to_org_id, po_line_id, lot_no, colour, qty, uom)
         values ($1,$2,$3,$4,$5,$6,$7,$8)`,
        [d.id, ctx.orgId, po.buyer_org_id, lot.po_line_id, lot.lot_no, lot.colour ?? null, lot.qty, byId.get(lot.po_line_id).uom]);
    }
    let trip = null;
    if (input.transporter_org_id) {
      if (!(await arePartners(db, ctx.orgId, input.transporter_org_id))) throw new AppError(403, 'NOT_PARTNERS', 'Transporter is not connected to you');
      trip = await createTripForDispatch(db, ctx, { dispatch: d, transporterOrgId: input.transporter_org_id });
    } else {
      await db.query(`update dispatches set status = 'in_transit' where id = $1`, [d.id]);
    }
    await db.query(`update purchase_orders set status = 'dispatched' where id = $1`, [id]);
    await audit(db, ctx, { action: 'dispatch', table: 'dispatches', id: d.id, after: { dispatch_no: dispatchNo, po: po.po_no } });
    return { dispatch: d, po, trip };
  });
  res.trip?.emitRequested();
  bus.emit('supply.dispatched', { dispatchId: res.dispatch.id, dispatchNo: res.dispatch.dispatch_no, poId: id, poNo: res.po.po_no,
    supplierOrgId: ctx.orgId, buyerOrgId: res.po.buyer_org_id, otp: res.trip?.otp });
  return { ...res.dispatch, trip: res.trip?.trip ?? null };
}
