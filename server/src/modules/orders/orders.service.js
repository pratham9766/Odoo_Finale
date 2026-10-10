import { withTenant, withSystem } from '../../db/withTenant.js';
import { AppError, must } from '../../utils/errors.js';
import { audit } from '../../utils/audit.js';
import { nextNumber } from '../../utils/numbering.js';
import { randomCode } from '../../utils/otp.js';
import { paged, where } from '../../utils/paginate.js';
import { round3 } from '../../utils/money.js';
import { env } from '../../config/env.js';
import { hidePrices } from '../../middleware/rbac.js';
import { bus } from '../../events/bus.js';
import { isBuyerOf } from '../partners/partners.service.js';
import { explode, summarize } from '../catalog/bom.service.js';
import { reserveFifo, releaseReservations } from '../inventory/inventory.core.js';
import { autoDraftPos } from '../procurement/procurement.service.js';
import { applyStatus, PRE_PRODUCTION } from './orderStatus.js';

// ---------- helpers ----------

// quantity of an order line expressed in the item's own unit (BOMs are written in the item's uom)
function toItemUom(line, item) {
  if (line.uom === item.uom) return line.qty;
  if (line.uom === 'm' && item.uom === 'kg' && item.width_m && item.gsm) return round3((line.qty * item.width_m * item.gsm) / 1000);
  if (line.uom === 'kg' && item.uom === 'm' && item.width_m && item.gsm) return round3((line.qty * 1000) / (item.width_m * item.gsm));
  if (line.uom === 'roll' && item.uom === 'm' && item.roll_length_m) return round3(line.qty * item.roll_length_m);
  throw new AppError(422, 'VALIDATION_FAILED', `Cannot convert ${line.uom} to ${item.uom} for "${item.name}" (set width, GSM or roll length on the item)`);
}

async function loadOrderRow(db, id, { lock = false } = {}) {
  const { rows: [o] } = await db.query(`select * from orders where id = $1 ${lock ? 'for update' : ''}`, [id]);
  return must(o, 'Order');
}

const assertSeller = (ctx, o) => {
  if (o.seller_org_id !== ctx.orgId) throw new AppError(403, 'FORBIDDEN', 'Only the selling mill can do this');
};

async function priceStripped(ctx, rows) {
  return rows.map((r) => hidePrices(ctx, r));
}

// ---------- create ----------

// `at` (optional, seed only) back-dates the order; HTTP never passes it
export async function createOrder(ctx, input, { at = null } = {}) {
  const isBuyerPlacing = input.seller_org_id !== ctx.orgId;
  const sellerOrgId = input.seller_org_id;
  const buyerOrgId = isBuyerPlacing ? ctx.orgId : input.buyer_org_id ?? null;
  if (!isBuyerPlacing && !buyerOrgId && !input.buyer_contact_id) {
    throw new AppError(422, 'VALIDATION_FAILED', 'Choose a connected buyer or an offline buyer contact');
  }
  if (buyerOrgId && input.buyer_contact_id) throw new AppError(422, 'VALIDATION_FAILED', 'Use either a connected buyer or a contact');
  if (input.deadline < new Date(at ?? Date.now()).toISOString().slice(0, 10)) throw new AppError(422, 'VALIDATION_FAILED', 'Deadline is in the past');

  // item names for the order lines (a buyer cannot read the seller's items, so the snapshot is taken here)
  const itemIds = input.lines.map((l) => l.item_id);
  const loadItems = (db) => db.query(`select id, name from items where id = any($1) and active ${isBuyerPlacing ? 'and sellable' : ''}`, [itemIds]);

  const order = await withTenant(ctx, async (db) => {
    if (buyerOrgId && !(await isBuyerOf(db, buyerOrgId, sellerOrgId))) {
      throw new AppError(403, 'NOT_PARTNERS', 'You are not connected with this organization');
    }
    const items = isBuyerPlacing ? (await withSystem(sellerOrgId, loadItems)).rows : (await loadItems(db)).rows;
    const names = new Map(items.map((i) => [i.id, i.name]));
    for (const l of input.lines) if (!names.has(l.item_id)) throw new AppError(422, 'VALIDATION_FAILED', 'One of the items is not available for order');

    // the seller owns order numbers; a buyer-placed order carries a temporary REQ- number until the mill confirms
    const orderNo = isBuyerPlacing ? `REQ-${Date.now().toString(36).toUpperCase()}${randomCode(2).toUpperCase()}` : await nextNumber(db, ctx.orgId, 'ORD');
    const { rows: [o] } = await db.query(
      `insert into orders (order_no, seller_org_id, buyer_org_id, buyer_contact_id, buyer_ref, deadline, priority,
                           delivery_address, notes, status, created_by, created_at, order_date)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,'draft',$10, coalesce($11::timestamptz, now()),
               coalesce(($11::timestamptz at time zone 'Asia/Kolkata')::date, current_date)) returning *`,
      [orderNo, sellerOrgId, buyerOrgId, input.buyer_contact_id ?? null, input.buyer_ref ?? null, input.deadline, input.priority,
       input.delivery_address ?? null, input.notes ?? null, ctx.userId, at]);
    for (const l of input.lines) {
      await db.query(
        `insert into order_lines (order_id, seller_org_id, buyer_org_id, item_id, colour, description, qty, uom, rate)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9)`,
        [o.id, sellerOrgId, buyerOrgId, l.item_id, l.colour ?? null, l.description ?? names.get(l.item_id), l.qty, l.uom, l.rate]);
    }
    await db.query(
      `insert into order_events (order_id, seller_org_id, buyer_org_id, event, created_by, created_at) values ($1,$2,$3,'created',$4, coalesce($5, now()))`,
      [o.id, sellerOrgId, buyerOrgId, ctx.userId, at]);
    await audit(db, ctx, { action: 'create', table: 'orders', id: o.id, after: { order_no: o.order_no } });
    return o;
  });

  bus.emit('order.created', { orderId: order.id, sellerOrgId, buyerOrgId, byOrgId: ctx.orgId });
  return getOrder(ctx, order.id);
}

// ---------- read ----------

export const listOrders = (ctx, q) =>
  withTenant(ctx, async (db) => {
    const side = q.side ?? (ctx.orgTypes.some((t) => ['manufacturer', 'supplier'].includes(t)) ? 'sales' : 'purchase');
    const w = where().add('o.risk = ?', q.risk);
    w.raw(side === 'sales' ? 'o.seller_org_id = ?' : 'o.buyer_org_id = ?', ctx.orgId);
    if (q.status) w.raw('o.status = any(?::text[])', q.status.split(','));
    if (q.q) w.raw('o.order_no ilike ?', `%${q.q}%`);
    const { rows, meta } = await paged(
      db,
      `select o.id, o.order_no, o.status, o.priority, o.deadline, o.progress_pct, o.current_stage, o.expected_completion,
              o.risk, o.order_date, o.created_at, o.buyer_ref, o.seller_org_id, o.buyer_org_id, o.buyer_contact_id,
              so.name as seller_name, coalesce(bo.name, c.name) as buyer_name,
              (select coalesce(sum(l.qty), 0) from order_lines l where l.order_id = o.id) as total_qty,
              (select min(l.uom) from order_lines l where l.order_id = o.id) as uom,
              (select coalesce(sum(l.qty * l.rate), 0) from order_lines l where l.order_id = o.id) as total
         from orders o join organizations so on so.id = o.seller_org_id
         left join organizations bo on bo.id = o.buyer_org_id left join contacts c on c.id = o.buyer_contact_id ${w.sql}`,
      w.params, q, 'deadline, created_at desc');
    return { data: rows.map((r) => hidePrices(ctx, r)), meta, side };
  }).then(({ data, meta, side }) => ({ data, meta: { ...meta, side } }));

export const getOrder = (ctx, id) =>
  withTenant(ctx, async (db) => {
    const { rows: [o] } = await db.query(
      `select o.*, so.name as seller_name, coalesce(bo.name, c.name) as buyer_name
         from orders o join organizations so on so.id = o.seller_org_id
         left join organizations bo on bo.id = o.buyer_org_id left join contacts c on c.id = o.buyer_contact_id where o.id = $1`, [id]);
    must(o, 'Order');
    const isSeller = o.seller_org_id === ctx.orgId;
    const { rows: lines } = await db.query('select * from order_lines where order_id = $1 order by description', [id]);
    const { rows: events } = await db.query(
      `select id, event, visible_to_buyer, data, created_at from order_events where order_id = $1 ${isSeller ? '' : 'and visible_to_buyer'} order by created_at`, [id]);
    const { rows: dispatches } = await db.query(
      `select id, dispatch_no, kind, status, confirmed_at, delivered_at, transporter_org_id from dispatches where order_id = $1 order by created_at`, [id]);

    const out = { ...o, is_seller_view: isSeller, lines: await priceStripped(ctx, lines), events, dispatches };
    if (!isSeller) delete out.tracking_token;
    if (isSeller) {
      out.rolls = (await db.query(`select status, count(*)::int as count, coalesce(sum(length_m), 0) as length_m from rolls where order_id = $1 group by status`, [id])).rows;
      if (ctx.permissions.has('production.view')) {
        out.work_orders = (await db.query(`select status, count(*)::int as count from work_orders where order_id = $1 group by status`, [id])).rows;
      }
      out.reservations = (await db.query(`select coalesce(sum(qty), 0) as reserved_qty, count(*)::int as lines from reservations where order_id = $1 and status = 'active'`, [id])).rows[0];
    }
    if (ctx.permissions.has('invoice.view')) {
      out.invoices = await priceStripped(ctx, (await db.query(
        `select id, invoice_no, kind, status, total, paid_amount, due_date from invoices where order_id = $1 order by created_at`, [id])).rows);
    }
    return out;
  });

// ---------- material: requirements / reserve ----------

// explode every line with ONE shared allocation map so a yarn used by two lines is never netted twice
async function explodeOrder(db, orderId) {
  const { rows: lines } = await db.query(
    `select l.*, i.name as item_name, i.uom as item_uom, i.width_m, i.gsm, i.roll_length_m
       from order_lines l join items i on i.id = l.item_id where l.order_id = $1`, [orderId]);
  const alloc = new Map();
  const trees = [];
  for (const l of lines) {
    const qty = toItemUom(l, { uom: l.item_uom, width_m: l.width_m, gsm: l.gsm, roll_length_m: l.roll_length_m, name: l.item_name });
    trees.push({ line_id: l.id, tree: await explode(db, l.item_id, qty, { netStock: true, alloc }) });
  }
  return trees;
}

async function combinedSummary(db, trees) {
  const merged = { buy_list: new Map(), produce_list: [], material_cost_estimate: 0 };
  for (const { tree } of trees) {
    const s = await summarize(db, tree);
    for (const b of s.buy_list) {
      const cur = merged.buy_list.get(b.item_id);
      if (cur) { cur.qty = round3(cur.qty + b.qty); cur.est_cost = Math.round((cur.est_cost + b.est_cost) * 100) / 100; } else merged.buy_list.set(b.item_id, { ...b });
    }
    merged.produce_list.push(...s.produce_list);
    merged.material_cost_estimate += s.material_cost_estimate;
  }
  return { buy_list: [...merged.buy_list.values()], produce_list: merged.produce_list, material_cost_estimate: Math.round(merged.material_cost_estimate * 100) / 100 };
}

// what the order needs, ignoring the order's own reservations (computed in a rolled-back savepoint)
export const requirements = (ctx, id) =>
  withTenant(ctx, async (db) => {
    const o = await loadOrderRow(db, id);
    assertSeller(ctx, o);
    await db.query('savepoint preview');
    try {
      await releaseReservations(db, id);
      const trees = await explodeOrder(db, id);
      const summary = await combinedSummary(db, trees);
      const canSeeCost = ctx.permissions.has('orders.view_price') || ctx.permissions.has('po.create');
      if (!canSeeCost) { delete summary.material_cost_estimate; summary.buy_list.forEach((b) => { delete b.est_rate; delete b.est_cost; }); }
      return { order_id: id, lines: trees, summary, ready: summary.buy_list.length === 0 };
    } finally {
      await db.query('rollback to savepoint preview');
    }
  });

// release + re-reserve; idempotent, so it serves confirm, the manual "reserve" button and the GRN listener
async function reserveOrderMaterial(db, ctx, orderId, at = null) {
  await releaseReservations(db, orderId);
  const trees = await explodeOrder(db, orderId);
  const short = new Map(); // item_id -> extra qty that could not be reserved (concurrent consumption)
  const walk = async (n) => {
    if (n.from_stock > 0) {
      const got = await reserveFifo(db, ctx, { orderId, itemId: n.item.id, qty: n.from_stock, at });
      if (got < n.from_stock - 0.0005) short.set(n.item.id, round3((short.get(n.item.id) ?? 0) + n.from_stock - got));
    }
    for (const c of n.children) await walk(c);
  };
  for (const { tree } of trees) await walk(tree);
  const summary = await combinedSummary(db, trees);
  for (const [itemId, qty] of short) {
    const cur = summary.buy_list.find((b) => b.item_id === itemId);
    if (cur) cur.qty = round3(cur.qty + qty);
    else summary.buy_list.push({ item_id: itemId, name: '', qty, uom: '' });
  }
  return { trees, summary, ready: summary.buy_list.length === 0 };
}

export const reserve = (ctx, id, { at = null } = {}) => runReserve(ctx, id, at);

async function runReserve(ctx, id, at = null) {
  const res = await withTenant(ctx, async (db) => {
    const o = await loadOrderRow(db, id, { lock: true });
    assertSeller(ctx, o);
    if (!PRE_PRODUCTION.includes(o.status)) throw new AppError(409, 'INVALID_STATE_TRANSITION', `Material is already committed (order is ${o.status})`);
    const r = await reserveOrderMaterial(db, ctx, id, at);
    const change = await applyStatus(db, id, r.ready ? 'material_ready' : 'waiting_material', { visibleToBuyer: r.ready, at });
    return { order: o, summary: r.summary, ready: r.ready, change };
  });
  if (res.change.changed) {
    bus.emit('order.status_changed', { orderId: id, sellerOrgId: ctx.orgId, buyerOrgId: res.order.buyer_org_id, orderNo: res.order.order_no, ...res.change });
    bus.emit('order.updated', { orderId: id, sellerOrgId: ctx.orgId, buyerOrgId: res.order.buyer_org_id, ...res.change });
  }
  return { ready: res.ready, status: res.change.to, buy_list: res.summary.buy_list };
}

// a GRN arrived: give waiting orders (oldest first) another chance at the new stock
export async function recheckWaitingOrders(orgId) {
  const ids = await withSystem(orgId, async (db) =>
    (await db.query(`select id from orders where seller_org_id = $1 and status = 'waiting_material' order by created_at`, [orgId])).rows.map((r) => r.id));
  for (const id of ids) {
    await runReserve({ orgId, userId: null, permissions: new Set(), orgTypes: [] }, id)
      .catch((e) => console.error(`[recheck order ${id}]`, e.message));
  }
}

// ---------- confirm / cancel / tracking ----------

export async function confirmOrder(ctx, id, { auto_po = false } = {}, { at = null } = {}) {
  const res = await withTenant(ctx, async (db) => {
    const o = await loadOrderRow(db, id, { lock: true });
    assertSeller(ctx, o);
    if (o.status !== 'draft') throw new AppError(409, 'INVALID_STATE_TRANSITION', `Order is already ${o.status}`);

    let orderNo = o.order_no;
    if (orderNo.startsWith('REQ-')) orderNo = await nextNumber(db, ctx.orgId, 'ORD'); // the mill's real number
    await db.query(`update orders set order_no = $2, confirmed_at = coalesce($3, now()) where id = $1`, [id, orderNo, at]);
    const confirmed = await applyStatus(db, id, 'confirmed', { at });

    const r = await reserveOrderMaterial(db, ctx, id, at);
    const material = await applyStatus(db, id, r.ready ? 'material_ready' : 'waiting_material', { visibleToBuyer: r.ready, at });
    let drafts = { pos: [], unassigned: r.summary.buy_list };
    if (auto_po && r.summary.buy_list.length) {
      drafts = await autoDraftPos(db, ctx, { orderId: id, buyList: r.summary.buy_list, needBy: o.deadline });
    }
    await audit(db, ctx, { action: 'confirm', table: 'orders', id, before: { order_no: o.order_no }, after: { order_no: orderNo, ready: r.ready } });
    return { orderNo, buyerOrgId: o.buyer_org_id, confirmed, material, summary: r.summary, ready: r.ready, drafts };
  });

  const base = { orderId: id, sellerOrgId: ctx.orgId, buyerOrgId: res.buyerOrgId, orderNo: res.orderNo };
  bus.emit('order.confirmed', base);
  bus.emit('order.status_changed', { ...base, ...res.confirmed });
  if (res.material.changed) bus.emit('order.status_changed', { ...base, ...res.material, from: 'confirmed' });
  bus.emit('order.updated', { ...base, ...res.material });
  return {
    order: await getOrder(ctx, id),
    shortages: res.summary.buy_list,
    draft_pos: res.drafts.pos,
    unassigned_shortages: res.drafts.unassigned,
  };
}

export async function cancelOrder(ctx, id, { reason } = {}) {
  const res = await withTenant(ctx, async (db) => {
    const o = await loadOrderRow(db, id, { lock: true });
    const isSeller = o.seller_org_id === ctx.orgId;
    if (!isSeller && !(o.buyer_org_id === ctx.orgId && o.status === 'draft')) {
      throw new AppError(403, 'FORBIDDEN', 'A buyer can only cancel an order the mill has not confirmed yet');
    }
    if (['dispatched', 'partially_dispatched', 'delivered', 'closed', 'cancelled'].includes(o.status)) {
      throw new AppError(409, 'INVALID_STATE_TRANSITION', `A ${o.status.replace(/_/g, ' ')} order cannot be cancelled`);
    }
    if (isSeller) {
      const { rows: [{ n }] } = await db.query(`select count(*)::int n from work_orders where order_id = $1 and status in ('running','paused','done')`, [id]);
      if (n) throw new AppError(409, 'INVALID_STATE_TRANSITION', 'Production has started on this order; stop the work orders first');
      await db.query(`update work_orders set status = 'cancelled' where order_id = $1 and status = 'planned'`, [id]);
      await releaseReservations(db, id);
    }
    await db.query(`update orders set cancelled_at = now(), cancel_reason = $2 where id = $1`, [id, reason ?? null]);
    const change = await applyStatus(db, id, 'cancelled');
    await audit(db, ctx, { action: 'cancel', table: 'orders', id, after: { reason } });
    return { order: o, change };
  });
  const p = { orderId: id, sellerOrgId: res.order.seller_org_id, buyerOrgId: res.order.buyer_org_id, orderNo: res.order.order_no, ...res.change };
  bus.emit('order.status_changed', p);
  bus.emit('order.updated', p);
  return { id, status: 'cancelled' };
}

export const trackingLink = (ctx, id) =>
  withTenant(ctx, async (db) => {
    const o = await loadOrderRow(db, id, { lock: true });
    assertSeller(ctx, o);
    let token = o.tracking_token;
    if (!token) {
      token = randomCode(24);
      await db.query('update orders set tracking_token = $2 where id = $1', [id, token]);
    }
    return { token, url: `${env.PUBLIC_TRACK_BASE_URL}/${token}` };
  });
