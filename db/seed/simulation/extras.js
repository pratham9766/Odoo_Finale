// The small things the main story does not touch, so no screen is empty: stock adjustments (one in each state), today's shift
// assignments, a repair that is still in progress, this month's first bills, and the system's own alerts (low stock, orders at risk).
// Everything goes through the real services or jobs; nothing here invents a number the app would not compute.

import { approveAdjustment, createAdjustment, rejectAdjustment } from '../../../server/src/modules/inventory/inventory.service.js';
import { reportBreakdown, startTicket } from '../../../server/src/modules/maintenance/maintenance.service.js';
import { recordPayment } from '../../../server/src/modules/finance/payments.service.js';
import { runJob } from '../../../server/src/jobs/index.js';
import { istParts } from '../../../server/src/utils/time.js';
import { shiftContaining } from '../../../server/src/utils/shifts.js';
import { insertRows } from '../lib/insert.js';

/** Stock counts: a shortage written off (approved), a surplus found (approved), and a request still waiting (pending), one rejected. */
async function stockAdjustments(sim) {
  const lots = await sim.sql(
    `select l.id, l.item_id, l.lot_no, i.name, i.kind, coalesce(sum(m.qty), 0)::float as on_hand
       from stock_lots l join items i on i.id = l.item_id left join stock_movements m on m.lot_id = l.id
      where i.kind in ('yarn', 'fibre', 'dye') group by l.id, i.name, i.kind having coalesce(sum(m.qty), 0) > 50
      order by on_hand desc limit 4`);
  if (lots.length < 4) return;
  const [a, b, c, d] = lots;
  const owner = sim.ctx.store;
  const shortage = await createAdjustment(owner, { item_id: a.item_id, lot_id: a.id, qty: -Math.round(a.on_hand * 0.01 * 10) / 10, reason: 'Cycle count: shortage found in the raw store' });
  await approveAdjustment(owner, shortage.id);
  const surplus = await createAdjustment(owner, { item_id: b.item_id, lot_id: b.id, qty: Math.round(b.on_hand * 0.005 * 10) / 10, reason: 'Cycle count: extra cones found on the rack' });
  await approveAdjustment(owner, surplus.id);
  const rejected = await createAdjustment(owner, { item_id: c.item_id, lot_id: c.id, qty: -Math.round(c.on_hand * 0.2), reason: 'Possible damage in transit (needs a recount)' });
  await rejectAdjustment(owner, rejected.id);
  await createAdjustment(owner, { item_id: d.item_id, lot_id: d.id, qty: -Math.round(d.on_hand * 0.02 * 10) / 10, reason: 'Moisture loss in the monsoon, awaiting approval' });
}

/** Who is on which machine in the shift running right now (the register the supervisor keeps). */
async function todaysAssignments(sim) {
  const running = shiftContaining(sim.shifts, sim.now) ?? { shift: sim.shifts[0] };
  const date = istParts(sim.now).date;
  const rows = [];
  for (const stage of sim.stages) {
    for (const machine of sim.machinesOfStage(stage.id).slice(0, 2)) {
      const pool = sim.roster.get(`${machine.stage_id}|${running.shift.id}`) ?? [];
      const worker = pool[sim.machinesOfStage(stage.id).indexOf(machine) % Math.max(pool.length, 1)];
      if (worker && !rows.some((r) => r.worker_id === worker.id)) {
        rows.push({ date, shift_id: running.shift.id, worker_id: worker.id, machine_id: machine.id, created_by: sim.ctx.prod.userId });
      }
    }
  }
  await insertRows(sim.admin, 'assignments', rows);
}

/** A repair someone has started but not finished: the maintenance screen shows work in progress as well as history. */
async function openRepair(sim) {
  // an idle machine that has been idle for a while, so the breakdown does not start before its last status change
  const [machine] = await sim.sql(
    `select id from machines where active and status = 'idle' and status_since < $1 order by code desc limit 1`, [sim.after(sim.now, -6 * 60)]);
  if (!machine) return;
  const ticket = await reportBreakdown(sim.ctx.prod, machine.id, { reason: 'Circulation pump seal leaking', priority: 'normal' }, { at: sim.after(sim.now, -5 * 60) });
  await startTicket(sim.ctx.maint, ticket.id, { at: sim.after(sim.now, -4 * 60) });
}

/** This month's bills so far (the rest are booked on the 5th of next month by the monthly run). */
async function billsThisMonth(sim) {
  const today = istParts(sim.now).date;
  const month = today.slice(0, 7);
  const bills = [
    ['power', 'Electricity (DGVCL), meter reading to date', true, sim.rng.stepped(160_000, 240_000, 1000)],
    ['maintenance', 'Spares and servicing', true, sim.rng.stepped(12_000, 30_000, 500)],
    ['other', 'Packing material and courier', false, sim.rng.stepped(6_000, 14_000, 500)],
  ];
  await insertRows(sim.admin, 'expenses', bills.map(([category, note, paid, amount]) => ({
    category, amount, date: today, note: `${note} · ${month}`, paid, created_at: sim.after(sim.now, -90), created_by: sim.ctx.accounts.userId,
  })));
}

/** A buyer that settles early: two invoices paid in full and one part-paid, a day or two after delivery (the rest follow the 30-day terms). */
async function earlyPayments(sim) {
  const invoices = await sim.sql(
    `select i.id, i.total::float as total from invoices i join dispatches d on d.id = i.dispatch_id
      where d.status = 'delivered' and not exists (select 1 from payments p where p.invoice_id = i.id)
      order by d.delivered_at limit 3`);
  for (const [n, inv] of invoices.entries()) {
    const at = sim.after(sim.now, -(n + 1) * 1440);
    await recordPayment(sim.ctx.accounts, {
      invoice_id: inv.id, amount: n === 2 ? Math.round(inv.total * 50) / 100 : inv.total,
      mode: ['bank', 'upi', 'cheque'][n], ref_no: `UTR${sim.rng.int(100000, 999999)}`, paid_at: istParts(at).date,
    }, { at });
  }
}

/** The owner has opened a couple of the alerts already; the rest stay unread. */
async function someRead(sim) {
  await sim.sql(
    `insert into notification_reads (notification_id, user_id) select id, $1 from notifications where user_id is null order by created_at limit 2 on conflict do nothing`,
    [sim.ctx.store.userId]);
}

export async function extras(sim) {
  await stockAdjustments(sim);
  await todaysAssignments(sim);
  await openRepair(sim);
  await billsThisMonth(sim);
  // the alerts the scheduler would have raised by now: low stock and orders at risk (built from the data, not typed in)
  await runJob('lowStock');
  await runJob('deadlineRisk');
  await earlyPayments(sim);
  await someRead(sim);
}
