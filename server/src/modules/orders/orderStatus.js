// Order status engine (§11.14). Production-driven statuses are derived from work orders, rolls and
// dispatches; the pre-production statuses (confirmed / waiting_material / material_ready) are owned by
// the reservation flow in orders.service.js and are only preserved here.
import { withSystem } from '../../db/withTenant.js';
import { bus } from '../../events/bus.js';
import { round2 } from '../../utils/money.js';

export const PRE_PRODUCTION = ['confirmed', 'waiting_material', 'material_ready'];
const FROZEN = ['draft', 'cancelled', 'closed'];
const PRODUCTION_HOURS_PER_DAY = 20;

const isoDate = (d) => d.toISOString().slice(0, 10);
const daysBetween = (a, b) => Math.round((new Date(b) - new Date(a)) / 86400000);

// remaining quantity ÷ machine capacity, stages in sequence, parallel machines inside a stage
export async function estimateCompletion(db, orderId) {
  const { rows } = await db.query(
    `select s.sequence,
            max(greatest(wo.target_qty - wo.produced_qty, 0) / nullif(coalesce(m.capacity_per_hour, sm.avg_cap), 0)) as hours
       from work_orders wo
       join stages s on s.id = wo.stage_id
       left join machines m on m.id = wo.machine_id
       left join lateral (select avg(capacity_per_hour) as avg_cap from machines where stage_id = wo.stage_id and active) sm on true
      where wo.order_id = $1 and wo.status in ('planned','running','paused') and not wo.is_rework
      group by s.sequence`, [orderId]);
  if (!rows.length) return null;
  const total = rows.reduce((t, r) => t + (r.hours ?? 0), 0);
  const d = new Date();
  d.setDate(d.getDate() + Math.ceil(total / PRODUCTION_HOURS_PER_DAY));
  return isoDate(d);
}

// writes the status + order event inside the caller's transaction; returns { changed, from, to }
// `at` (optional) back-dates the order event; the seed replays history with it
export async function applyStatus(db, orderId, to, { visibleToBuyer = true, at = null } = {}) {
  const { rows: [o] } = await db.query('select status from orders where id = $1 for update', [orderId]);
  if (!o || o.status === to) return { changed: false, from: o?.status, to };
  await db.query('update orders set status = $2 where id = $1', [orderId, to]);
  await db.query(
    `insert into order_events (order_id, seller_org_id, buyer_org_id, event, visible_to_buyer, created_at)
     select id, seller_org_id, buyer_org_id, $2, $3, coalesce($4, now()) from orders where id = $1`, [orderId, to, visibleToBuyer, at]);
  return { changed: true, from: o.status, to };
}

export async function recomputeOrderStatus(sellerOrgId, orderId) {
  const result = await withSystem(sellerOrgId, async (db) => {
    const { rows: [s] } = await db.query(
      `with o as (select * from orders where id = $1),
       lines as (select coalesce(sum(qty), 0) as ordered from order_lines where order_id = $1),
       wos as (select count(*) as total,
                      count(*) filter (where status = 'done') as done,
                      count(*) filter (where status in ('running','paused')) as active,
                      coalesce(sum(produced_qty), 0) as produced, coalesce(sum(target_qty), 0) as target
                 from work_orders where order_id = $1 and not is_rework and status <> 'cancelled'),
       rl as (select coalesce(sum(length_m) filter (where status in ('passed','packed')), 0) as passed_m,
                     count(*) filter (where status = 'pending_qc') as pending
                from rolls where order_id = $1),
       dsp as (select coalesce(sum(dr.length_m), 0) as dispatched_m,
                      coalesce(bool_and(d.status = 'delivered'), false) as all_delivered, count(distinct d.id) as n
                 from dispatches d join dispatch_rolls dr on dr.dispatch_id = d.id
                where d.order_id = $1 and d.status in ('confirmed','in_transit','delivered'))
       select o.status, o.deadline, o.buyer_org_id, o.order_no, lines.ordered, wos.total, wos.done, wos.active,
              wos.produced, wos.target, rl.passed_m, rl.pending, dsp.dispatched_m, dsp.all_delivered, dsp.n,
              (select st.name from work_orders w join stages st on st.id = w.stage_id
                where w.order_id = $1 and w.status in ('running','paused') order by st.sequence desc limit 1) as current_stage
         from o, lines, wos, rl, dsp`, [orderId]);
    if (!s || FROZEN.includes(s.status)) return null;

    let status;
    if (s.n > 0 && s.dispatched_m >= s.ordered * 0.98 && s.all_delivered) status = 'delivered';
    else if (s.dispatched_m >= s.ordered * 0.98) status = 'dispatched';
    else if (s.dispatched_m > 0) status = 'partially_dispatched';
    else if (s.passed_m >= s.ordered * 0.98) status = 'ready_to_ship';
    else if (s.total > 0 && s.done === s.total && s.pending > 0) status = 'in_qc';
    else if (s.active > 0 || s.done > 0) status = 'in_production';
    else status = PRE_PRODUCTION.includes(s.status) ? s.status : 'material_ready';

    const shipped = ['ready_to_ship', 'partially_dispatched', 'dispatched', 'delivered'].includes(status);
    const progress = shipped ? 100 : s.target > 0 ? Math.min(100, (100 * s.produced) / s.target) : 0;
    const expected = shipped ? null : await estimateCompletion(db, orderId);
    const today = isoDate(new Date());
    let risk = 'green';
    if (!shipped) {
      if (expected) risk = expected > s.deadline ? 'red' : daysBetween(expected, s.deadline) <= 1 ? 'amber' : 'green';
      else if (s.deadline < today) risk = 'red';
    }

    const change = await applyStatus(db, orderId, status);
    await db.query(
      `update orders set progress_pct = $2, current_stage = $3, expected_completion = $4, risk = $5 where id = $1`,
      [orderId, round2(progress), s.current_stage, expected, risk]);
    return { orderId, sellerOrgId, buyerOrgId: s.buyer_org_id, orderNo: s.order_no, progress_pct: round2(progress), risk, ...change };
  });
  if (!result) return null;
  bus.emit('order.updated', result);
  if (result.changed) bus.emit('order.status_changed', result);
  return result;
}
