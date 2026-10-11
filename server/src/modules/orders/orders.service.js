// Buyer orders: create, confirm (reserves material, optionally drafts purchase orders), cancel, requirements and tracking links.
import { withTx } from '../../db/tx.js';
import { AppError, must } from '../../utils/errors.js';
import { audit } from '../../utils/audit.js';
import { nextNumber } from '../../utils/numbering.js';
import { randomCode } from '../../utils/otp.js';
import { paged, where } from '../../utils/paginate.js';
import { round3 } from '../../utils/money.js';
import { env } from '../../config/env.js';
import { hidePrices } from '../../middleware/rbac.js';
import { bus } from '../../events/bus.js';
import { explode, summarize } from '../catalog/bom.service.js';
import { reserveFifo, releaseReservations } from '../inventory/inventory.core.js';
import { autoDraftPos } from '../procurement/procurement.service.js';
import { applyStatus, PRE_PRODUCTION } from './orderStatus.js';
import { BUCKETS } from './orders.summary.js';

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

async function priceStripped(ctx, rows) {
  return rows.map((r) => hidePrices(ctx, r));
}

// ---------- create ----------

// what the mill sells; fibre, dye, packing and scrap are inputs and can never be on a buyer's order
const SELLABLE_KINDS = ['yarn', 'grey_fabric', 'finished_fabric', 'garment'];

// `at` (optional, seed only) back-dates the order; HTTP never passes it
export async function createOrder(ctx, input, { at = null } = {}) {
  // the mill records the order for one of its buyer contacts
  if (input.deadline < new Date(at ?? Date.now()).toISOString().slice(0, 10)) throw new AppError(422, 'VALIDATION_FAILED', 'Deadline is in the past');

  const itemIds = input.lines.map((l) => l.item_id);

  const order = await withTx(async (db) => {
    must((await db.query(`select 1 from contacts where id = $1 and type = 'buyer'`, [input.buyer_contact_id])).rows[0], 'Buyer contact');
    const { rows: items } = await db.query('select id, name, kind from items where id = any($1) and active', [itemIds]);
    const names = new Map(items.map((i) => [i.id, i.name]));
    for (const l of input.lines) if (!names.has(l.item_id)) throw new AppError(422, 'VALIDATION_FAILED', 'One of the items is not available for order');
    const unsellable = items.find((i) => !SELLABLE_KINDS.includes(i.kind));
    if (unsellable) throw new AppError(422, 'VALIDATION_FAILED', `${unsellable.name} is a ${unsellable.kind.replaceAll('_', ' ')}: buyers can only order yarn, fabric or garments`);

    const orderNo = await nextNumber(db, 'ORD');
    const { rows: [o] } = await db.query(
      `insert into orders (order_no, buyer_contact_id, buyer_ref, deadline, priority,
                           delivery_address, notes, status, created_by, created_at, order_date)
       values ($1,$2,$3,$4,$5,$6,$7,'draft',$8, coalesce($9::timestamptz, now()),
               coalesce(($9::timestamptz at time zone 'Asia/Kolkata')::date, current_date)) returning *`,
      [orderNo, input.buyer_contact_id, input.buyer_ref ?? null, input.deadline, input.priority,
       input.delivery_address ?? null, input.notes ?? null, ctx.userId, at]);
    for (const l of input.lines) {
      await db.query(
        `insert into order_lines (order_id, item_id, colour, description, qty, uom, rate)
         values ($1,$2,$3,$4,$5,$6,$7)`,
        [o.id, l.item_id, l.colour ?? null, l.description ?? names.get(l.item_id), l.qty, l.uom, l.rate]);
    }
    await db.query(
      `insert into order_events (order_id, event, created_by, created_at) values ($1,'created',$2, coalesce($3, now()))`,
      [o.id, ctx.userId, at]);
    await audit(db, ctx, { action: 'create', table: 'orders', id: o.id, after: { order_no: o.order_no } });
    return o;
  });

  bus.emit('order.created', { orderId: order.id });
  return getOrder(ctx, order.id);
}

// ---------- read ----------

export const listOrders = (ctx, q) =>
  withTx(async (db) => {
    const w = where().add('o.risk = ?', q.risk);
    if (q.status) w.raw('o.status = any(?::text[])', q.status.split(','));
    if (q.priority) w.raw('o.priority = any(?::text[])', q.priority.split(','));
    if (q.bucket) w.raw(BUCKETS[q.bucket]);
    if (q.q) w.raw('(o.order_no ilike ? or c.name ilike ?)', `%${q.q}%`, `%${q.q}%`);
    const { rows, meta } = await paged(
      db,
      `select o.id, o.order_no, o.status, o.priority, o.deadline, o.progress_pct, o.current_stage, o.expected_completion,
              o.risk, o.order_date, o.created_at, o.buyer_ref, o.buyer_contact_id,
              c.name as buyer_name,
              (select coalesce(sum(l.qty), 0) from order_lines l where l.order_id = o.id) as total_qty,
              (select min(l.uom) from order_lines l where l.order_id = o.id) as uom,
              (select i.name from order_lines l join items i on i.id = l.item_id where l.order_id = o.id order by l.qty desc limit 1) as fabric_name,
              (select l.colour from order_lines l where l.order_id = o.id order by l.qty desc limit 1) as fabric_colour,
              (select coalesce(sum(l.qty * l.rate), 0) from order_lines l where l.order_id = o.id) as total
         from orders o left join contacts c on c.id = o.buyer_contact_id ${w.sql}`,
      w.params, q, 'deadline, created_at desc');
    return { data: rows.map((r) => hidePrices(ctx, r)), meta };
  });

export const getOrder = (ctx, id) =>
  withTx(async (db) => {
    const { rows: [o] } = await db.query(
      `select o.*, c.name as buyer_name from orders o left join contacts c on c.id = o.buyer_contact_id where o.id = $1`, [id]);
    must(o, 'Order');
    const { rows: lines } = await db.query('select * from order_lines where order_id = $1 order by description', [id]);
    const { rows: events } = await db.query(
      `select id, event, visible_to_buyer, data, created_at from order_events where order_id = $1 order by created_at`, [id]);
    const { rows: dispatches } = await db.query(
      `select id, dispatch_no, status, confirmed_at, delivered_at from dispatches where order_id = $1 order by created_at`, [id]);

    const out = { ...o, lines: await priceStripped(ctx, lines), events, dispatches };
    out.rolls = (await db.query(`select status, count(*)::int as count, coalesce(sum(length_m), 0) as length_m from rolls where order_id = $1 group by status`, [id])).rows;
    if (ctx.permissions.has('production.view')) {
      out.work_orders = (await db.query(`select status, count(*)::int as count from work_orders where order_id = $1 group by status`, [id])).rows;
    }
    out.reservations = (await db.query(`select coalesce(sum(qty), 0) as reserved_qty, count(*)::int as lines from reservations where order_id = $1 and status = 'active'`, [id])).rows[0];
    if (ctx.permissions.has('invoice.view')) {
      out.invoices = await priceStripped(ctx, (await db.query(
        `select id, invoice_no, status, total, paid_amount, due_date from invoices where order_id = $1 order by created_at`, [id])).rows);
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
  withTx(async (db) => {
    await loadOrderRow(db, id);
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
  const res = await withTx(async (db) => {
    const o = await loadOrderRow(db, id, { lock: true });
    if (!PRE_PRODUCTION.includes(o.status)) throw new AppError(409, 'INVALID_STATE_TRANSITION', `Material is already committed (order is ${o.status})`);
    const r = await reserveOrderMaterial(db, ctx, id, at);
    const change = await applyStatus(db, id, r.ready ? 'material_ready' : 'waiting_material', { visibleToBuyer: r.ready, at });
    return { order: o, summary: r.summary, ready: r.ready, change };
  });
  if (res.change.changed) {
    bus.emit('order.status_changed', { orderId: id, orderNo: res.order.order_no, ...res.change });
    bus.emit('order.updated', { orderId: id, ...res.change });
  }
  return { ready: res.ready, status: res.change.to, buy_list: res.summary.buy_list };
}

// a GRN arrived: give waiting orders (oldest first) another chance at the new stock
export async function recheckWaitingOrders() {
  const ids = await withTx(async (db) =>
    (await db.query(`select id from orders where status = 'waiting_material' order by created_at`)).rows.map((r) => r.id));
  for (const id of ids) {
    await runReserve({ userId: null, permissions: new Set() }, id)
      .catch((e) => console.error(`[recheck order ${id}]`, e.message));
  }
}

// ---------- confirm / cancel / tracking ----------

export async function confirmOrder(ctx, id, { auto_po = false } = {}, { at = null } = {}) {
  const res = await withTx(async (db) => {
    const o = await loadOrderRow(db, id, { lock: true });
    if (o.status !== 'draft') throw new AppError(409, 'INVALID_STATE_TRANSITION', `Order is already ${o.status}`);

    const orderNo = o.order_no;
    await db.query(`update orders set order_no = $2, confirmed_at = coalesce($3, now()) where id = $1`, [id, orderNo, at]);
    const confirmed = await applyStatus(db, id, 'confirmed', { at });

    const r = await reserveOrderMaterial(db, ctx, id, at);
    const material = await applyStatus(db, id, r.ready ? 'material_ready' : 'waiting_material', { visibleToBuyer: r.ready, at });
    let drafts = { pos: [], unassigned: r.summary.buy_list };
    if (auto_po && r.summary.buy_list.length) {
      drafts = await autoDraftPos(db, ctx, { orderId: id, buyList: r.summary.buy_list, needBy: o.deadline });
    }
    await audit(db, ctx, { action: 'confirm', table: 'orders', id, before: { order_no: o.order_no }, after: { order_no: orderNo, ready: r.ready } });
    return { orderNo, confirmed, material, summary: r.summary, ready: r.ready, drafts };
  });

  const base = { orderId: id, orderNo: res.orderNo };
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

/** Change the header of an order (deadline, priority, reference, address, notes) until production has started. */
export async function updateOrder(ctx, id, input) {
  await withTx(async (db) => {
    const o = await loadOrderRow(db, id, { lock: true });
    if (!['draft', ...PRE_PRODUCTION].includes(o.status)) {
      throw new AppError(409, 'INVALID_STATE_TRANSITION', `A ${o.status.replace(/_/g, ' ')} order can no longer be edited`);
    }
    if (input.deadline && input.deadline < new Date().toISOString().slice(0, 10)) throw new AppError(422, 'VALIDATION_FAILED', 'Deadline is in the past');
    const fields = Object.entries(input);
    await db.query(
      `update orders set ${fields.map(([k], i) => `${k} = $${i + 2}`).join(', ')} where id = $1`,
      [id, ...fields.map(([, v]) => v)]);
    await audit(db, ctx, { action: 'update', table: 'orders', id, before: Object.fromEntries(fields.map(([k]) => [k, o[k]])), after: input });
  });
  bus.emit('order.updated', { orderId: id });
  return getOrder(ctx, id);
}

export async function cancelOrder(ctx, id, { reason } = {}) {
  const res = await withTx(async (db) => {
    const o = await loadOrderRow(db, id, { lock: true });
    if (['dispatched', 'partially_dispatched', 'delivered', 'closed', 'cancelled'].includes(o.status)) {
      throw new AppError(409, 'INVALID_STATE_TRANSITION', `A ${o.status.replace(/_/g, ' ')} order cannot be cancelled`);
    }
    const { rows: [{ n }] } = await db.query(`select count(*)::int n from work_orders where order_id = $1 and status in ('running','paused','done')`, [id]);
    if (n) throw new AppError(409, 'INVALID_STATE_TRANSITION', 'Production has started on this order; stop the work orders first');
    await db.query(`update work_orders set status = 'cancelled' where order_id = $1 and status = 'planned'`, [id]);
    await releaseReservations(db, id);
    await db.query(`update orders set cancelled_at = now(), cancel_reason = $2 where id = $1`, [id, reason ?? null]);
    const change = await applyStatus(db, id, 'cancelled');
    await audit(db, ctx, { action: 'cancel', table: 'orders', id, after: { reason } });
    return { order: o, change };
  });
  const p = { orderId: id, orderNo: res.order.order_no, ...res.change };
  bus.emit('order.status_changed', p);
  bus.emit('order.updated', p);
  return { id, status: 'cancelled' };
}

export const trackingLink = (ctx, id) =>
  withTx(async (db) => {
    const o = await loadOrderRow(db, id, { lock: true });
    let token = o.tracking_token;
    if (!token) {
      token = randomCode(24);
      await db.query('update orders set tracking_token = $2 where id = $1', [id, token]);
    }
    return { token, url: `${env.PUBLIC_TRACK_BASE_URL}/${token}` };
  });
