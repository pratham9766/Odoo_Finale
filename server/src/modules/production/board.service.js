// The live machine board (backend plan §7.2 v_machine_board, §13 machine.updated).

import { withTx } from '../../db/tx.js';
import { Filter } from '../../utils/crud/index.js';
import { publish } from '../../utils/publish.js';
import { shiftContaining } from '../../utils/shifts.js';
import { loadShifts } from '../mill/mill.service.js';

/**
 * Board rows with the operator on duty. Scope-filtered: a supervisor sees their stages, an operator their machines.
 * @param {{ machineId?: string, stageId?: string, mine?: boolean, at?: Date }} opts  mine = only machines I am assigned to now
 */
export async function boardRows(db, ctx, { machineId, stageId, mine = false, at = new Date() } = {}) {
  const duty = shiftContaining(await loadShifts(db), at);     // the shift running now, if any
  const [date, shiftId] = [duty?.date ?? null, duty?.shift.id ?? null];

  const f = new Filter()
    .anyOf('m.stage_id', ctx.scope?.stage_ids).anyOf('b.machine_id', ctx.scope?.machine_ids)
    .eq('b.machine_id', machineId).eq('m.stage_id', stageId);
  if (mine) {
    f.where(`exists (select 1 from assignments a join workers w on w.id = a.worker_id
                      where a.machine_id = b.machine_id and a.date = ? and a.shift_id = ? and w.user_id = ?)`, date, shiftId, ctx.userId);
  }

  const params = f.params;
  const bind = (value) => `$${params.push(value)}`;
  const { rows } = await db.query(
    `select b.machine_id, b.code, b.status, b.status_since, b.stage, m.stage_id, b.sequence, m.capacity_uom as uom,
            b.work_order_id, b.wo_no, b.order_no, b.target_qty, b.produced_qty, b.pct, b.today_qty,
            (select w.name from assignments a join workers w on w.id = a.worker_id
              where a.machine_id = b.machine_id and a.date = ${bind(date)} and a.shift_id = ${bind(shiftId)}
              order by a.created_at limit 1) as operator
       from v_machine_board b join machines m on m.id = b.machine_id
      where ${f.sql}
      order by b.sequence, length(b.code), b.code`, params);
  return rows;
}

const STATUSES = ['running', 'idle', 'breakdown', 'maintenance'];

/** Cards plus the KPI strip: machines per status, today's output per unit (kg and m must not be added), live utilisation. */
export function summariseBoard(machines) {
  const kpis = { total: machines.length, today: {} };
  for (const status of STATUSES) kpis[status] = machines.filter((m) => m.status === status).length;
  for (const m of machines) kpis.today[m.uom] = (kpis.today[m.uom] ?? 0) + Number(m.today_qty);
  kpis.utilisation_pct = machines.length ? Math.round((1000 * kpis.running) / machines.length) / 10 : 0;
  return { machines, kpis };
}

export function getBoard(ctx, query) {
  return withTx(async (db) => summariseBoard(await boardRows(db, ctx, query)));
}

/** machine.updated: push one machine's fresh board row to the mill room (after commit). */
export function publishMachine(machineId) {
  return publish('machine.updated', async (db) => (await boardRows(db, { scope: {} }, { machineId }))[0]);
}
