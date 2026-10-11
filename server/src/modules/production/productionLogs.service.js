// POST /work-orders/:id/logs: an operator adds output (backend plan §11.7).

import { withTx } from '../../db/tx.js';
import { audit } from '../../utils/audit.js';
import { assertExists, invalid } from '../../utils/crud/index.js';
import { AppError } from '../../utils/errors.js';
import { withIdempotency } from '../../utils/idempotency.js';
import { shiftContaining, shiftDateFor, shiftMinutes } from '../../utils/shifts.js';
import { round3 } from '../../utils/textile.js';
import { minutesBetween } from '../../utils/time.js';
import { loadShifts } from '../mill/mill.service.js';
import { assertUsableMachine } from './machineRules.js';
import { announce, lockWorkOrder, notRunning } from './workOrderSupport.js';
import { overTargetPct, overrideAllowed } from './outputLimits.js';

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

/**
 * An entry that takes a work order past target × (1 + pct / 100) is REFUSED (422, the same answer as before), because a slipped digit would
 * otherwise inflate stock and cost. pct is `settings.production.over_target_pct`, 25 unless the mill changes it.
 * By default nobody can go past the limit. Only if the mill has turned on `settings.production.allow_over_target_override` may someone who
 * plans production resend the entry with `confirm_over_target` and a reason; that is audited. Without that setting the flag is refused (403).
 */
async function checkOverTarget(db, ctx, wo, { qty, confirm_over_target: confirmed, reason }) {
  const pct = overTargetPct(ctx);
  const would = Number(wo.produced_qty) + qty;
  const limit = Number(wo.target_qty) * (1 + pct / 100);
  if (would <= limit + 1e-9) return;
  const allowed = overrideAllowed(ctx);
  const details = { produced_qty: Number(wo.produced_qty), target_qty: Number(wo.target_qty), entry_qty: qty, would_be: round3(would), limit: round3(limit), over_target_pct: pct, override_allowed: allowed };
  if (!confirmed) {
    const message = `That would bring ${wo.wo_no} to ${details.would_be} against a target of ${details.target_qty} (limit ${details.limit}). Check the quantity.${allowed ? ' A supervisor can confirm it.' : ''}`;
    const err = invalid('qty', message);
    err.details.over_target = details;
    throw err;
  }
  if (!allowed) throw new AppError(403, 'FORBIDDEN', 'Logging output above the limit is not enabled for this mill.');
  if (!ctx.permissions.has('production.plan')) throw new AppError(403, 'FORBIDDEN', 'Only a supervisor who plans production can confirm an entry above target');
  if (!reason || reason.trim().length < 3) throw invalid('reason', 'Give a reason for logging more than the target allows');
  await audit(db, ctx, { action: 'production_over_target', table: 'work_orders', id: wo.id, after: { ...details, reason: reason.trim() } });
}

/**
 * @param {{ idempotencyKey?: string }} options  one key per logical submission; a retry with the same key and input returns the
 *   original result and records nothing (see utils/idempotency.js)
 * @returns {{ log, work_order: { produced_qty, target_qty }, replayed: boolean }}
 */
export async function logProduction(ctx, id, input, { at = new Date(), idempotencyKey } = {}) {
  const { qty, worker_id } = input;
  const exec = async (db) => {
    const wo = await lockWorkOrder(db, ctx, id);
    if (wo.status !== 'running') throw notRunning(wo, 'log production');
    const machine = await assertUsableMachine(db, ctx, wo.machine_id);

    const { shift, date } = await logShift(db, ctx, input.shift_id, at);
    if (worker_id) await assertExists(db, 'workers', worker_id, 'Worker');
    await checkOverTarget(db, ctx, wo, input);
    const worker = worker_id ?? await assignedWorker(db, ctx, machine.id, shift.id, date);

    const { rows: [log] } = await db.query(
      `insert into production_logs (work_order_id, machine_id, shift_id, worker_id, qty, run_minutes, logged_at, created_by)
       values ($1, $2, $3, $4, $5, $6, $7, $8) returning *`,
      [wo.id, machine.id, shift.id, worker, qty, await runMinutes(db, machine, shift, at), at, ctx.userId]);
    const { rows: [updated] } = await db.query(
      `update work_orders set produced_qty = produced_qty + $2 where id = $1 returning produced_qty, target_qty`, [wo.id, qty]);
    return { response: { log, work_order: updated }, wo };
  };
  const out = await withTx((db) => (idempotencyKey
    ? withIdempotency(db, ctx, {
      operation: 'production.log', key: idempotencyKey,
      payload: { work_order_id: id, qty, worker_id: worker_id ?? null, shift_id: input.shift_id ?? null, confirm: !!input.confirm_over_target, reason: input.reason ?? null },
    }, exec)
    : exec(db).then((r) => ({ ...r, replayed: false }))));
  if (!out.replayed) await announce(ctx, out.wo, 'production.logged', { qty });
  return { ...out.response, replayed: out.replayed };
}
