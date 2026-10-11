// POST /work-orders/:id/logs: an operator adds output (backend plan §11.7).

import { withTx } from '../../db/tx.js';
import { assertExists, invalid } from '../../utils/crud/index.js';
import { shiftContaining, shiftDateFor, shiftMinutes } from '../../utils/shifts.js';
import { minutesBetween } from '../../utils/time.js';
import { loadShifts } from '../mill/mill.service.js';
import { assertUsableMachine } from './machineRules.js';
import { announce, lockWorkOrder, notRunning } from './workOrderSupport.js';
import { assertOutputWithin } from './outputLimits.js';

/** The shift this log belongs to: the one given, else the one running now. */
async function logShift(db, ctx, shiftId, at) {
  const shifts = await loadShifts(db);
  if (shiftId) {
    await assertExists(db, 'shifts', shiftId, 'Shift');
    const shift = shifts.find((s) => s.id === shiftId);
    return { shift, date: shiftDateFor(shift, at) };
  }
  const running = shiftContaining(shifts, at);
  if (!running) throw invalid('shift_id', 'No shift is running at this time; pick the shift this output belongs to');
  return running;
}

/** Whoever is assigned to this machine for the shift (the earliest assignment if there are helpers). */
async function assignedWorker(db, ctx, machineId, shiftId, date) {
  const { rows: [a] } = await db.query(
    `select worker_id from assignments where machine_id = $1 and shift_id = $2 and date = $3
      order by created_at limit 1`, [machineId, shiftId, date]);
  return a?.worker_id ?? null;
}

/** Minutes the machine ran since the previous log (or since it was started), never more than one shift. */
async function runMinutes(db, machine, shift, at) {
  const { rows: [prev] } = await db.query(`select max(logged_at) as at from production_logs where machine_id = $1`, [machine.id]);
  const since = prev?.at && prev.at > machine.status_since ? prev.at : machine.status_since;
  return Math.min(Math.max(minutesBetween(since, at), 0), shiftMinutes(shift));
}

/** @returns {{ log, work_order: { produced_qty, target_qty } }} */
export async function logProduction(ctx, id, { qty, worker_id, shift_id }, { at = new Date() } = {}) {
  const { wo, ...result } = await withTx(async (db) => {
    const wo = await lockWorkOrder(db, ctx, id);
    if (wo.status !== 'running') throw notRunning(wo, 'log production');
    assertOutputWithin(wo, { adding: qty });
    const machine = await assertUsableMachine(db, ctx, wo.machine_id);

    const { shift, date } = await logShift(db, ctx, shift_id, at);
    if (worker_id) await assertExists(db, 'workers', worker_id, 'Worker');
    const worker = worker_id ?? await assignedWorker(db, ctx, machine.id, shift.id, date);

    const { rows: [log] } = await db.query(
      `insert into production_logs (work_order_id, machine_id, shift_id, worker_id, qty, run_minutes, logged_at, created_by)
       values ($1, $2, $3, $4, $5, $6, $7, $8) returning *`,
      [wo.id, machine.id, shift.id, worker, qty, await runMinutes(db, machine, shift, at), at, ctx.userId]);
    const { rows: [updated] } = await db.query(
      `update work_orders set produced_qty = produced_qty + $2 where id = $1 returning produced_qty, target_qty`, [wo.id, qty]);
    return { wo, log, work_order: updated };
  });
  await announce(ctx, 'production.logged', wo, { qty });
  return result;
}
