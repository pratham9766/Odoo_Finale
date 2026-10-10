// Replay `days` of Everest's history through the real services, leave a believable "now", then
// recompute every order and check the books. Deterministic for a given seed and `now` date.

import { recomputeOrderStatus } from '../../../server/src/modules/orders/orderStatus.js';
import { reportBreakdown } from '../../../server/src/modules/maintenance/maintenance.service.js';
import { addDays, atIST, istParts, monthStart } from '../../../server/src/utils/time.js';
import { PATTERNS, SIM, BUYERS } from './config.js';
import { placeOrder } from './adapters.js';
import { dailyProcurement, openingStock, provisionOrder } from './procurement.js';
import { produceOrder, scheduleBreakdowns } from './production.js';
import { qcRolls, shipOrder } from './sales.js';
import { approveOvertime, attendanceDay, monthlyExpenses, wageRun } from './people.js';
import { extras } from './extras.js';
import { loadWorld } from './world.js';

const DOWN_MACHINE = 'W-5';              // the machine that is broken down right now

function orderLines(sim, { rush = false } = {}) {
  const fabrics = Object.values(sim.item).filter((i) => i.kind === 'finished_fabric');
  const count = rush ? 1 : sim.rng.chance(0.3) ? 2 : 1;
  return sim.rng.shuffle(fabrics).slice(0, count).map((f) => ({
    sku: f.sku,
    qty: rush ? 600 : sim.rng.stepped(SIM.orderMetres.min, SIM.orderMetres.max, SIM.orderMetres.step),
    rate: Math.round(f.std_rate * (1.08 + sim.rng.next() * 0.17)),
  }));
}

/** One order from the buyer's request to the money: placed, provisioned, produced, inspected, shipped, paid (as far as "now" allows). */
async function runOrder(sim, { at, rush = false }) {
  const buyer = sim.rng.weighted(Object.entries(BUYERS).map(([name, b]) => [name, b.weight]));
  const lines = orderLines(sim, { rush });
  const deadline = istParts(sim.after(at, (rush ? 3 : sim.rng.int(SIM.deadlineDays.min, SIM.deadlineDays.max)) * 1440)).date;
  const orderId = await placeOrder(sim, { buyer, lines, deadline, priority: rush ? 'urgent' : sim.rng.pick(['normal', 'normal', 'high']), at });
  const readyAt = await provisionOrder(sim, orderId, lines, at);
  const made = await produceOrder(sim, orderId, readyAt);
  const { passed, pending } = await qcRolls(sim, made.rolls);
  if (made.complete && !pending) await shipOrder(sim, { orderId, buyer, passed });
  else if (passed.length && sim.rng.chance(0.4)) await shipOrder(sim, { orderId, buyer, passed });   // partial shipment of what is ready
  sim.stats.orders++;
  sim.stats.rolls += made.rolls.length;
}

/**
 * Orders that cannot make their deadline (§17: 3 orders at red risk): the active orders with the most work left get a deadline
 * tomorrow. The status engine then computes the risk itself from the remaining work and the machine capacity.
 */
async function planRedRisk(sim) {
  const rows = await sim.sql(
    `select o.id from orders o
       join work_orders w on w.order_id = o.id and not w.is_rework
      where o.status in ('in_production','material_ready','waiting_material','confirmed')
      group by o.id order by sum(w.target_qty - w.produced_qty) desc, o.id limit $1`, [PATTERNS.redRiskOrders]);
  if (!rows.length) return;
  await sim.sql(`update orders set deadline = $2 where id = any($1::uuid[])`, [rows.map((r) => r.id), istParts(sim.after(sim.now, 24 * 60)).date]);
}

/** The planted "now": the broken machine, a yarn running low, orders that will be late. */
async function nowState(sim) {
  const machine = sim.machines.find((m) => m.code === DOWN_MACHINE);
  if (machine) {
    const ticket = await reportBreakdown(sim.ctx.prod, machine.id, { reason: 'Main drive motor burnt out', priority: 'urgent' }, { at: machine.downFrom });
    void ticket;   // left open on purpose: the technician demo starts it (the machine shows as breakdown until then)
  }
  await planRedRisk(sim);
  const yarn = sim.item[PATTERNS.nearReorderYarn];
  const [s] = await sim.sql(`select coalesce(sum(qty), 0)::float as on_hand from stock_movements where item_id = $1`, [yarn.id]);
  const [r] = await sim.sql(`select coalesce(sum(qty), 0)::float as reserved from reservations where item_id = $1 and status = 'active'`, [yarn.id]);
  const target = Math.round(yarn.reorder_level * 0.6);
  const excess = s.on_hand - r.reserved - target;
  if (excess > 0) {
    // consumed by sample weaving that was never booked against an order: written off at the last stock count
    const lots = await sim.sql(
      `select l.id, coalesce(sum(m.qty), 0)::float as q from stock_lots l left join stock_movements m on m.lot_id = l.id
        where l.item_id = $1 group by l.id having coalesce(sum(m.qty), 0) > 0 order by l.received_at desc`, [yarn.id]);
    let left = excess;
    for (const lot of lots) {
      if (left <= 0) break;
      const take = Math.min(left, lot.q);
      await sim.sql(
        `insert into stock_movements (item_id, lot_id, type, qty, ref_type, reason, created_at, created_by)
         values ($1, $2, 'adjust', $3, 'adjustment', 'Cycle count: sample weaving not booked', $4, $5)`,
        [yarn.id, lot.id, -Math.round(take * 1000) / 1000, sim.after(sim.now, -26 * 60), sim.ctx.store.userId]);
      left -= take;
    }
  }
}

/** Fail loudly when the simulated books do not add up (§17). */
async function consistencyChecks(sim) {
  const problems = [];
  const neg = await sim.sql(
    `select l.lot_no, sum(m.qty)::float as q from stock_movements m join stock_lots l on l.id = m.lot_id
      group by l.lot_no having sum(m.qty) < -0.01`);
  if (neg.length) problems.push(`negative stock in ${neg.length} lot(s): ${neg.slice(0, 3).map((n) => `${n.lot_no}=${n.q}`).join(', ')}`);
  const inv = await sim.sql(
    `select d.dispatch_no, (select coalesce(sum(qty), 0) from invoice_lines il join invoices i on i.id = il.invoice_id
                             where i.dispatch_id = d.id)::float as invoiced,
            (select coalesce(sum(length_m), 0) from dispatch_rolls where dispatch_id = d.id)::float as shipped
       from dispatches d where d.status <> 'packing'`);
  const off = inv.filter((r) => Math.abs(r.invoiced - r.shipped) > 0.01);
  if (off.length) problems.push(`invoice qty ≠ dispatched metres on ${off.length} dispatch(es), e.g. ${off[0].dispatch_no}`);
  const unchecked = await sim.sql(
    `select r.roll_no from dispatch_rolls dr join rolls r on r.id = dr.roll_id
      where not exists (select 1 from qc_inspections q where q.roll_id = r.id and q.result = 'pass')`);
  if (unchecked.length) problems.push(`${unchecked.length} dispatched roll(s) never passed QC, e.g. ${unchecked[0].roll_no}`);
  const wages = await sim.sql(
    `select count(*)::int as n from wage_lines wl join wage_runs wr on wr.id = wl.wage_run_id
      where abs(wl.net - (wl.gross - wl.deductions)) > 0.01`);
  if (wages[0].n) problems.push(`${wages[0].n} wage line(s) where net ≠ gross − deductions`);
  if (problems.length) throw new Error(`Seed consistency checks failed:\n - ${problems.join('\n - ')}`);
}

export async function prepareWorld(admin, { now = new Date(), days = SIM.days, log = () => {} } = {}) {
  const sim = await loadWorld(admin, { now, days, seed: SIM.seed, log });
  sim.stats = { orders: 0, rolls: 0 };
  sim.stockReadyAt = new Map();
  sim.plannedLoss = Object.fromEntries((await sim.sql(
    `select stage_id, weight_loss_pct::float as p from stage_losses`)).map((r) => [r.stage_id, r.p]));
  const down = sim.machines.find((m) => m.code === DOWN_MACHINE);
  if (down) down.downFrom = sim.after(now, -3 * 60);
  return sim;
}

/**
 * @param {{ query: Function }} admin  migration-role connection (bypasses RLS)
 * @param {{ now?: Date, days?: number, log?: Function }} opts
 */
export async function simulate(admin, opts = {}) {
  const sim = await prepareWorld(admin, opts);
  const { now, days, log } = sim;
  scheduleBreakdowns(sim);
  await openingStock(sim);

  const first = istParts(sim.start).date;
  const today = istParts(now).date;
  const started = Date.now();
  for (let d = 0; ; d++) {
    const date = addDays(first, d);
    if (date > today) break;
    await dailyProcurement(sim, d, atIST(date, 0));
    await attendanceDay(sim, date);
    if (d % 7 === 6) await approveOvertime(sim, addDays(date, -2));
    if (date.endsWith('-02') && d > 0) {                         // last month is complete: pay wages, book overheads
      const month = monthStart(addDays(date, -5));
      if (month >= monthStart(first)) { await wageRun(sim, month, { finalise: true }); await monthlyExpenses(sim, month); }
    }

    const rushDays = d >= days - 6 && d < days - 3;                 // three rush orders near "now" end up at red risk
    const count = Math.floor(SIM.ordersPerDay) + (sim.rng.chance(SIM.ordersPerDay % 1) ? 1 : 0);
    const times = Array.from({ length: count }, () => atIST(date, sim.rng.int(10 * 60, 17 * 60))).sort((a, b) => a - b);
    for (const at of times) if (at <= now) await runOrder(sim, { at });
    if (rushDays) { const at = atIST(date, 11 * 60); if (at <= now) await runOrder(sim, { at, rush: true }); }

    const mins = ((Date.now() - started) / 60000).toFixed(1);
    log(`  day ${d + 1}/${days + 1} ${date}: ${sim.stats.orders} orders, ${sim.stats.rolls} rolls so far (${mins} min)`);
  }

  return { ...sim.stats, ...(await finish(sim)) };
}

/** After the history: this month's draft wages, the planted "now" state, status recompute and the books check. */
export async function finish(sim) {
  const { log } = sim;
  const today = istParts(sim.now).date;
  await wageRun(sim, monthStart(today), { finalise: false });        // this month: a draft for HR to review
  await nowState(sim);

  log('Recomputing order status, progress and risk …');
  const orders = await sim.sql(`select id from orders`);
  for (const { id } of orders) await recomputeOrderStatus(id);

  await extras(sim);
  await consistencyChecks(sim);
  return {};
}
