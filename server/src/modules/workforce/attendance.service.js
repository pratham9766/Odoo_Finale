// Attendance: the supervisor's grid, the today board, the monthly register, OT approval.

import { withTx } from '../../db/tx.js';
import { isInScope } from '../../middleware/rbac.js';
import { audit } from '../../utils/audit.js';
import { Filter, assertExists, invalid } from '../../utils/crud/index.js';
import { AppError } from '../../utils/errors.js';
import { publish } from '../../utils/publish.js';
import { shiftWindow } from '../../utils/shifts.js';
import { todayIST } from '../../utils/time.js';
import { loadShifts } from '../mill/mill.service.js';
import { dayFromTimes } from './attendance.rules.js';
import { buildRegister } from './register.js';

const WORKED = ['present', 'late', 'half_day'];

/** The "today" numbers the supervisor board shows: workers present / absent / late / on leave and OT hours, all shifts. */
export async function todayCounts(db, date = todayIST()) {
  const { rows: [c] } = await db.query(
    `select coalesce(sum(present), 0)::int as present, coalesce(sum(absent), 0)::int as absent, coalesce(sum(late), 0)::int as late,
            coalesce(sum(on_leave), 0)::int as on_leave, coalesce(sum(ot_hours), 0)::float as ot_hours
       from v_attendance_daily where date = $1`, [date]);
  return c;
}

/** After commit: the event and the attendance.updated push. */

// ---- supervisor grid ----------------------------------------------------------------------------------------------

/** The workers must exist, be active and sit inside the caller's stages (404 / 422 / 403 otherwise). */
async function checkWorkers(db, ctx, ids) {
  const { rows } = await db.query(`select id, name, stage_id, active from workers where id = any($1::uuid[])`, [ids]);
  if (rows.length !== ids.length) throw new AppError(404, 'NOT_FOUND', 'Worker not found');
  const inactive = rows.filter((w) => !w.active).map((w) => w.name);
  if (inactive.length) throw invalid('entries', `${inactive.join(', ')} ${inactive.length === 1 ? 'is' : 'are'} not active`);
  const outside = rows.filter((w) => !isInScope(ctx, 'stage', w.stage_id)).map((w) => w.name);
  if (outside.length) throw new AppError(403, 'OUT_OF_SCOPE', `Outside your assigned area: ${outside.join(', ')}`);
  return rows;
}

/**
 * The supervisor marks a shift: "all present" then the exceptions; present / late / half-day entries without a check-in
 * start at the shift start.
 */
export async function saveAttendance(ctx, { date, shift_id: shiftId, entries }) {
  await withTx(async (db) => {
    if (date > todayIST()) throw invalid('date', 'Attendance cannot be marked for a future date');
    await assertExists(db, 'shifts', shiftId, 'Shift');
    if (!isInScope(ctx, 'shift', shiftId)) throw new AppError(403, 'OUT_OF_SCOPE', 'This shift is outside your assigned area');
    const { rows: [shift] } = await db.query(`select id, name, start_time, end_time, grace_min from shifts where id = $1`, [shiftId]);
    await checkWorkers(db, ctx, entries.map((e) => e.worker_id));
    const { start } = shiftWindow(shift, date);
    // a card scan already recorded the real arrival time: re-saving the grid without times must not move it to the shift start
    const { rows: scanned } = await db.query(
      `select worker_id, check_in, source from attendance
        where date = $1 and shift_id = $2 and worker_id = any($3::uuid[]) and source <> 'manual' and check_in is not null`,
      [date, shiftId, entries.map((e) => e.worker_id)]);
    const scannedBy = new Map(scanned.map((a) => [a.worker_id, a]));

    for (const e of entries) {
      const scan = !e.check_in && WORKED.includes(e.status) ? scannedBy.get(e.worker_id) : undefined;
      const checkIn = e.check_in ?? scan?.check_in ?? (WORKED.includes(e.status) ? start : null);
      const day = dayFromTimes(shift, date, { check_in: checkIn, check_out: e.check_out, status: e.status });
      await db.query(
        `insert into attendance (worker_id, date, shift_id, check_in, check_out, worked_hours, late_min, early_leave_min, ot_hours, status, needs_correction, source)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, false, $11)
         on conflict (worker_id, date, shift_id) do update set check_in = excluded.check_in, check_out = excluded.check_out, worked_hours = excluded.worked_hours,
           late_min = excluded.late_min, early_leave_min = excluded.early_leave_min, ot_hours = excluded.ot_hours, status = excluded.status,
           corrected_by = case when attendance.needs_correction and excluded.check_out is not null then $12::uuid else attendance.corrected_by end,
           corrected_at = case when attendance.needs_correction and excluded.check_out is not null then now() else attendance.corrected_at end,
           correction_reason = case when attendance.needs_correction and excluded.check_out is not null then 'Corrected in the attendance grid' else attendance.correction_reason end,
           needs_correction = case when excluded.check_out is not null then false else attendance.needs_correction end, source = excluded.source`,
        [e.worker_id, date, shiftId, day.check_in, day.check_out, day.worked_hours, day.late_min, day.early_leave_min, day.ot_hours, day.status,
          scan?.source ?? 'manual', ctx.userId]);
    }
  });
  await publish('attendance.updated', (db) => todayCounts(db, date));
  return listDay(ctx, { date, shift_id: shiftId });
}

/** The attendance rows of one day with worker, stage and shift names; scope-filtered. Runs inside a transaction. */
async function dayRows(db, ctx, { date, shift_id: shiftId, stage_id: stageId }) {
  const f = new Filter().eq('a.date', date).eq('a.shift_id', shiftId).eq('w.stage_id', stageId)
    .anyOf('w.stage_id', ctx.scope?.stage_ids).anyOf('a.shift_id', ctx.scope?.shift_ids);
  const { rows } = await db.query(
    `select a.*, w.emp_code, w.name as worker, st.name as stage, sh.name as shift
       from attendance a join workers w on w.id = a.worker_id join shifts sh on sh.id = a.shift_id left join stages st on st.id = w.stage_id
      where ${f.sql} order by sh.start_time, st.sequence, w.emp_code`, f.params);
  return rows;
}

export function listDay(ctx, { date = todayIST(), ...filters } = {}) {
  return withTx((db) => dayRows(db, ctx, { date, ...filters }));
}

// ---- today board ----------------------------------------------------------------------------------------------------

/** KPIs, counts per shift × stage (with how many were expected) and the absent list for one day (today unless given). */
export function todayBoard(ctx, { date = todayIST(), shift_id: shiftId, stage_id: stageId } = {}) {
  return withTx(async (db) => {
    const narrowed = (f, stage, shift) => f.anyOf(stage, ctx.scope?.stage_ids).anyOf(shift, ctx.scope?.shift_ids).eq(stage, stageId).eq(shift, shiftId);
    const day = narrowed(new Filter().eq('v.date', date), 'v.stage_id', 'v.shift_id');
    const expected = narrowed(new Filter().eq('w.active', true), 'w.stage_id', 'w.default_shift_id');

    const { rows: counted } = await db.query(
      `select v.shift_id, v.stage_id, v.present, v.absent, v.late, v.on_leave, v.ot_hours from v_attendance_daily v where ${day.sql}`, day.params);
    const { rows: planned } = await db.query(
      `select w.default_shift_id as shift_id, w.stage_id, count(*)::int as expected from workers w where ${expected.sql} group by 1, 2`, expected.params);
    const shifts = await loadShifts(db);
    const { rows: stages } = await db.query(`select id, name, sequence from stages`);

    const groups = new Map();                                   // shift × stage, from either source
    const slot = (shift_id, stage_id) => {
      const key = `${shift_id}:${stage_id}`;
      if (!groups.has(key)) groups.set(key, { shift_id, stage_id, expected: 0, present: 0, absent: 0, late: 0, on_leave: 0, ot_hours: 0 });
      return groups.get(key);
    };
    for (const p of planned) slot(p.shift_id, p.stage_id).expected = p.expected;
    for (const c of counted) Object.assign(slot(c.shift_id, c.stage_id), { present: Number(c.present), absent: Number(c.absent), late: Number(c.late), on_leave: Number(c.on_leave), ot_hours: Number(c.ot_hours) });

    const order = (list, id) => { const i = list.findIndex((x) => x.id === id); return i < 0 ? list.length : i; };
    const sortedStages = [...stages].sort((a, b) => a.sequence - b.sequence);
    const rows = [...groups.values()]
      .map((g) => ({ ...g, shift: shifts.find((s) => s.id === g.shift_id)?.name ?? null, stage: stages.find((s) => s.id === g.stage_id)?.name ?? null }))
      .sort((a, b) => order(shifts, a.shift_id) - order(shifts, b.shift_id) || order(sortedStages, a.stage_id) - order(sortedStages, b.stage_id));

    const sum = (key) => rows.reduce((n, g) => n + g[key], 0);
    const absent = (await dayRows(db, ctx, { date, shift_id: shiftId, stage_id: stageId })).filter((a) => a.status === 'absent');
    return {
      date,
      kpis: { expected: sum('expected'), present: sum('present'), absent: sum('absent'), late: sum('late'), on_leave: sum('on_leave'), ot_hours: sum('ot_hours') },
      groups: rows,
      absent: absent.map((a) => ({ attendance_id: a.id, worker_id: a.worker_id, emp_code: a.emp_code, worker: a.worker, stage: a.stage, shift: a.shift })),
    };
  });
}

// ---- register -------------------------------------------------------------------------------------------------------

/** Workers × days of a month with P / L / H / A / V / W / O, OT marks and totals per worker. `month` is YYYY-MM. */
export function monthlyRegister(ctx, { month, stage_id: stageId, shift_id: shiftId }) {
  return withTx(async (db) => {
    const first = `${month}-01`;
    const f = new Filter().eq('w.stage_id', stageId).eq('w.default_shift_id', shiftId)
      .anyOf('w.stage_id', ctx.scope?.stage_ids).anyOf('w.default_shift_id', ctx.scope?.shift_ids);
    const { rows: workers } = await db.query(
      `select w.id, w.emp_code, w.name from workers w where ${f.sql}
         and (w.active or exists (select 1 from attendance a where a.worker_id = w.id and a.date >= $${f.params.length + 1}::date and a.date < ($${f.params.length + 1}::date + interval '1 month')))
        order by w.emp_code`, [...f.params, first]);
    const { rows } = await db.query(
      `select a.worker_id, a.date, a.status, a.ot_hours, a.late_min from attendance a
        where a.worker_id = any($1::uuid[]) and a.date >= $2::date and a.date < ($2::date + interval '1 month')`,
      [workers.map((w) => w.id), first]);
    return { month, ...buildRegister(month, workers, rows) };
  });
}

// ---- overtime --------------------------------------------------------------------------------------------------------

/** Approve a day's overtime so the wage run pays it. */
export function approveOvertime(ctx, attendanceId) {
  return withTx(async (db) => {
    const { rows: [a] } = await db.query(
      `select a.id, a.ot_hours, w.stage_id from attendance a join workers w on w.id = a.worker_id where a.id = $1 for update of a`, [attendanceId]);
    if (!a) throw new AppError(404, 'NOT_FOUND', 'Attendance record not found');
    if (!isInScope(ctx, 'stage', a.stage_id)) throw new AppError(403, 'OUT_OF_SCOPE', 'This worker is outside your assigned area');
    if (!(Number(a.ot_hours) > 0)) throw new AppError(422, 'VALIDATION_FAILED', 'There is no overtime on this day to approve');
    const { rows: [row] } = await db.query(`update attendance set ot_approved = true, approved_by = $2 where id = $1 returning *`, [a.id, ctx.userId]);
    return row;
  });
}

// ---- unresolved attendance (a card check-in nobody has closed) ---------------------------------------------------------

/** The longest day a correction may describe; anything beyond this is almost certainly a wrong date. */
export const MAX_SHIFT_HOURS = 20;

/** Rows that still need a person's look, newest first, with whether the month's wage run is already past draft. Scope-filtered. */
export function listUnresolved(ctx, { from, to } = {}) {
  return withTx(async (db) => {
    const f = new Filter().eq('a.needs_correction', true)
      .anyOf('w.stage_id', ctx.scope?.stage_ids).anyOf('a.shift_id', ctx.scope?.shift_ids);
    if (from) f.where('a.date >= ?::date', from);
    if (to) f.where('a.date <= ?::date', to);
    const { rows } = await db.query(
      `select a.id, a.date, a.check_in, a.check_out, a.status, a.late_min, a.source, a.worker_id, w.emp_code, w.name as worker,
              a.shift_id, sh.name as shift, st.name as stage, wr.status as wage_run_status
         from attendance a join workers w on w.id = a.worker_id join shifts sh on sh.id = a.shift_id left join stages st on st.id = w.stage_id
         left join wage_runs wr on wr.month = date_trunc('month', a.date)::date
        where ${f.sql} order by a.date desc, sh.start_time, w.emp_code limit 500`, f.params);
    return rows.map((r) => ({ ...r, payroll_locked: !!r.wage_run_status && r.wage_run_status !== 'draft' }));
  });
}

/**
 * The supervisor closes an unresolved row with explicit times and a reason. Hours, overtime and early leave are recalculated by
 * the same rules as the attendance grid. Refused once the month's wage run is approved or paid, so paid data never changes quietly.
 */
export async function correctAttendance(ctx, id, { check_in: newIn, check_out: out, reason }, { now = new Date() } = {}) {
  const row = await withTx(async (db) => {
    const { rows: [a] } = await db.query(
      `select a.*, w.stage_id, w.name as worker_name from attendance a join workers w on w.id = a.worker_id where a.id = $1 for update of a`, [id]);
    if (!a) throw new AppError(404, 'NOT_FOUND', 'Attendance record not found');
    if (!isInScope(ctx, 'stage', a.stage_id) || !isInScope(ctx, 'shift', a.shift_id)) throw new AppError(403, 'OUT_OF_SCOPE', 'This worker is outside your assigned area');
    if (!a.needs_correction) throw new AppError(409, 'INVALID_STATE_TRANSITION', 'This attendance record does not need a correction');

    const { rows: [run] } = await db.query(`select status from wage_runs where month = date_trunc('month', $1::date)::date`, [a.date]);
    if (run && run.status !== 'draft') throw new AppError(409, 'PAYROLL_LOCKED', `The ${String(a.date).slice(0, 7)} wage run is already ${run.status}; it has to be reopened before this record can change`);

    const checkIn = newIn ?? a.check_in;
    if (!checkIn) throw invalid('check_in', 'This record has no check-in time; give one');
    if (out <= checkIn) throw invalid('check_out', 'Check-out must be after check-in');
    if (out > new Date(now.getTime() + 5 * 60_000)) throw invalid('check_out', 'Check-out cannot be in the future');
    if (checkIn > new Date(now.getTime() + 5 * 60_000)) throw invalid('check_in', 'Check-in cannot be in the future');
    if ((out - checkIn) / 3_600_000 > MAX_SHIFT_HOURS) throw invalid('check_out', `That is more than ${MAX_SHIFT_HOURS} hours after check-in; check the date and time`);

    const { rows: [shift] } = await db.query(`select id, name, start_time, end_time, grace_min from shifts where id = $1`, [a.shift_id]);
    const day = dayFromTimes(shift, a.date, { check_in: checkIn, check_out: out });
    const { rows: [updated] } = await db.query(
      `update attendance set check_in = $2, check_out = $3, worked_hours = $4, late_min = $5, early_leave_min = $6, ot_hours = $7, status = $8,
              needs_correction = false, corrected_by = $9, corrected_at = $10, correction_reason = $11
        where id = $1 returning *`,
      [id, day.check_in, day.check_out, day.worked_hours, day.late_min, day.early_leave_min, day.ot_hours, day.status, ctx.userId, now, reason]);
    await audit(db, ctx, {
      action: 'attendance_correct', table: 'attendance', id,
      before: { check_in: a.check_in, check_out: a.check_out, status: a.status, worked_hours: a.worked_hours },
      after: { check_in: updated.check_in, check_out: updated.check_out, status: updated.status, worked_hours: updated.worked_hours, reason },
    });
    return updated;
  });
  await publish('attendance.updated', (db) => todayCounts(db, row.date));
  return row;
}
