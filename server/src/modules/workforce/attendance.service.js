// Attendance (backend plan §11.12): the punch core, the supervisor's grid, the today board, the monthly register, OT approval.
// Punches are never edited: corrections recompute the day from corrected times (corrections.service.js).

import { withTenant } from '../../db/withTenant.js';
import { bus } from '../../events/bus.js';
import { isInScope } from '../../middleware/rbac.js';
import { Filter, assertOwned, invalid } from '../../utils/crud/index.js';
import { AppError } from '../../utils/errors.js';
import { publishToOrg } from '../../utils/publish.js';
import { resolveShift, shiftWindow } from '../../utils/shifts.js';
import { todayIST } from '../../utils/time.js';
import { loadShifts } from '../orgs/orgs.service.js';
import { checkInResult, checkOutResult, dayFromTimes } from './attendance.rules.js';
import { buildRegister } from './register.js';

const DUPLICATE_WINDOW_MS = 60_000;                 // a second scan within a minute is the same person standing there
const WORKED = ['present', 'late', 'half_day'];

// ---- punch -----------------------------------------------------------------------------------------------------

/**
 * One punch for one worker, inside the caller's transaction. The first punch of a shift is the check-in, the next one the check-out.
 * `worker` needs { id, default_shift_id }. Used by the kiosk, and by the seed to replay history.
 * @returns {{ duplicate?: true, type, shift, at, lateMin?, workedHours?, otHours?, status? }}
 */
export async function punch(db, { orgId, worker, at, method, deviceId = null, photoPath = null, byUserId = null }) {
  const found = resolveShift(await loadShifts(db, orgId), worker, at);
  if (!found) throw new AppError(422, 'VALIDATION_FAILED', 'No shift is running at this time for this worker');
  const { shift, date } = found;

  const { rows: [last] } = await db.query(
    `select punch_type, punched_at from attendance_punches where worker_id = $1 order by punched_at desc limit 1`, [worker.id]);
  if (last && Math.abs(at - last.punched_at) < DUPLICATE_WINDOW_MS) {
    return { duplicate: true, type: last.punch_type, at: last.punched_at, shift: shift.name };
  }

  const { rows: [att] } = await db.query(
    `select * from attendance where worker_id = $1 and date = $2 and shift_id = $3 for update`, [worker.id, date, shift.id]);
  const type = !att || !att.check_in ? 'in' : 'out';
  await db.query(
    `insert into attendance_punches (org_id, worker_id, punch_type, punched_at, method, device_id, photo_path, created_by)
     values ($1, $2, $3, $4, $5, $6, $7, $8)`, [orgId, worker.id, type, at, method, deviceId, photoPath, byUserId]);

  if (type === 'in') {
    const { lateMin, status } = checkInResult(shift, date, at);
    await db.query(
      `insert into attendance (org_id, worker_id, date, shift_id, check_in, late_min, status) values ($1, $2, $3, $4, $5, $6, $7)
       on conflict (worker_id, date, shift_id) do update set check_in = excluded.check_in, late_min = excluded.late_min, status = excluded.status`,
      [orgId, worker.id, date, shift.id, at, lateMin, status]);
    return { type, at, shift: shift.name, lateMin, status };
  }
  const out = checkOutResult(att, shift, date, at);
  await db.query(
    `update attendance set check_out = $2, worked_hours = $3, ot_hours = $4, status = $5, early_leave_min = $6, needs_correction = false where id = $1`,
    [att.id, at, out.workedHours, out.otHours, out.status, out.earlyLeaveMin]);
  return { type, at, shift: shift.name, workedHours: out.workedHours, otHours: out.otHours, status: out.status };
}

/** The "today" numbers the supervisor board shows: workers present / absent / late / on leave and OT hours, all shifts. */
export async function todayCounts(db, orgId, date = todayIST()) {
  const { rows: [c] } = await db.query(
    `select coalesce(sum(present), 0)::int as present, coalesce(sum(absent), 0)::int as absent, coalesce(sum(late), 0)::int as late,
            coalesce(sum(on_leave), 0)::int as on_leave, coalesce(sum(ot_hours), 0)::float as ot_hours
       from v_attendance_daily where org_id = $1 and date = $2`, [orgId, date]);
  return c;
}

/** After commit: the event and the attendance.updated push. */
export async function announcePunch(orgId, workerId, type) {
  bus.emit('attendance.punched', { orgId, workerId, type });
  await publishToOrg(orgId, 'attendance.updated', (db) => todayCounts(db, orgId));
}

// ---- supervisor grid ----------------------------------------------------------------------------------------------

/** The workers must exist, be active and sit inside the caller's stages (404 / 422 / 403 otherwise). */
async function checkWorkers(db, ctx, ids) {
  const { rows } = await db.query(`select id, name, stage_id, active from workers where org_id = $1 and id = any($2::uuid[])`, [ctx.orgId, ids]);
  if (rows.length !== ids.length) throw new AppError(404, 'NOT_FOUND', 'Worker not found');
  const inactive = rows.filter((w) => !w.active).map((w) => w.name);
  if (inactive.length) throw invalid('entries', `${inactive.join(', ')} ${inactive.length === 1 ? 'is' : 'are'} not active`);
  const outside = rows.filter((w) => !isInScope(ctx, 'stage', w.stage_id)).map((w) => w.name);
  if (outside.length) throw new AppError(403, 'OUT_OF_SCOPE', `Outside your assigned area: ${outside.join(', ')}`);
  return rows;
}

/**
 * The supervisor marks a shift: "all present" then the exceptions. Entries with times behave like punches (recorded as punches
 * with method 'supervisor'); present / late / half-day entries without a check-in start at the shift start.
 */
export async function saveAttendance(ctx, { date, shift_id: shiftId, entries }) {
  await withTenant(ctx, async (db) => {
    await assertOwned(db, ctx, 'shifts', shiftId, 'Shift');
    if (!isInScope(ctx, 'shift', shiftId)) throw new AppError(403, 'OUT_OF_SCOPE', 'This shift is outside your assigned area');
    const { rows: [shift] } = await db.query(`select id, name, start_time, end_time, grace_min from shifts where id = $1`, [shiftId]);
    await checkWorkers(db, ctx, entries.map((e) => e.worker_id));
    const { start } = shiftWindow(shift, date);

    for (const e of entries) {
      const checkIn = e.check_in ?? (WORKED.includes(e.status) ? start : null);
      const day = dayFromTimes(shift, date, { check_in: checkIn, check_out: e.check_out, status: e.status });
      await db.query(
        `insert into attendance (org_id, worker_id, date, shift_id, check_in, check_out, worked_hours, late_min, early_leave_min, ot_hours, status, needs_correction)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, false)
         on conflict (worker_id, date, shift_id) do update set check_in = excluded.check_in, check_out = excluded.check_out, worked_hours = excluded.worked_hours,
           late_min = excluded.late_min, early_leave_min = excluded.early_leave_min, ot_hours = excluded.ot_hours, status = excluded.status,
           needs_correction = case when excluded.check_out is not null then false else attendance.needs_correction end`,
        [ctx.orgId, e.worker_id, date, shiftId, day.check_in, day.check_out, day.worked_hours, day.late_min, day.early_leave_min, day.ot_hours, day.status]);
      for (const [type, time] of [['in', e.check_in], ['out', e.check_out]]) {
        if (!time) continue;
        await db.query(
          `insert into attendance_punches (org_id, worker_id, punch_type, punched_at, method, created_by)
           select $1, $2, $3, $4, 'supervisor', $5
            where not exists (select 1 from attendance_punches where worker_id = $2 and punch_type = $3 and punched_at = $4)`,
          [ctx.orgId, e.worker_id, type, time, ctx.userId]);
      }
    }
  });
  await publishToOrg(ctx.orgId, 'attendance.updated', (db) => todayCounts(db, ctx.orgId, date));
  return listDay(ctx, { date, shift_id: shiftId });
}

/** The attendance rows of one day with worker, stage and shift names; scope-filtered. Runs inside a transaction. */
async function dayRows(db, ctx, { date, shift_id: shiftId, stage_id: stageId }) {
  const f = new Filter(ctx.orgId, 'a').eq('a.date', date).eq('a.shift_id', shiftId).eq('w.stage_id', stageId)
    .anyOf('w.stage_id', ctx.scope?.stage_ids).anyOf('a.shift_id', ctx.scope?.shift_ids);
  const { rows } = await db.query(
    `select a.*, w.emp_code, w.name as worker, st.name as stage, sh.name as shift
       from attendance a join workers w on w.id = a.worker_id join shifts sh on sh.id = a.shift_id left join stages st on st.id = w.stage_id
      where ${f.sql} order by sh.start_time, st.sequence, w.emp_code`, f.params);
  return rows;
}

export function listDay(ctx, { date = todayIST(), ...filters } = {}) {
  return withTenant(ctx, (db) => dayRows(db, ctx, { date, ...filters }));
}

// ---- today board ----------------------------------------------------------------------------------------------------

/** KPIs, counts per shift × stage (with how many were expected) and the absent list for one day (today unless given). */
export function todayBoard(ctx, { date = todayIST(), shift_id: shiftId, stage_id: stageId } = {}) {
  return withTenant(ctx, async (db) => {
    const narrowed = (f, stage, shift) => f.anyOf(stage, ctx.scope?.stage_ids).anyOf(shift, ctx.scope?.shift_ids).eq(stage, stageId).eq(shift, shiftId);
    const day = narrowed(new Filter(ctx.orgId, 'v').eq('v.date', date), 'v.stage_id', 'v.shift_id');
    const expected = narrowed(new Filter(ctx.orgId, 'w').eq('w.active', true), 'w.stage_id', 'w.default_shift_id');

    const { rows: counted } = await db.query(
      `select v.shift_id, v.stage_id, v.present, v.absent, v.late, v.on_leave, v.ot_hours from v_attendance_daily v where ${day.sql}`, day.params);
    const { rows: planned } = await db.query(
      `select w.default_shift_id as shift_id, w.stage_id, count(*)::int as expected from workers w where ${expected.sql} group by 1, 2`, expected.params);
    const shifts = await loadShifts(db, ctx.orgId);
    const { rows: stages } = await db.query(`select id, name, sequence from stages where org_id = $1`, [ctx.orgId]);

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
  return withTenant(ctx, async (db) => {
    const first = `${month}-01`;
    const f = new Filter(ctx.orgId, 'w').eq('w.stage_id', stageId).eq('w.default_shift_id', shiftId)
      .anyOf('w.stage_id', ctx.scope?.stage_ids).anyOf('w.default_shift_id', ctx.scope?.shift_ids);
    const { rows: workers } = await db.query(
      `select w.id, w.emp_code, w.name from workers w where ${f.sql}
         and (w.active or exists (select 1 from attendance a where a.worker_id = w.id and a.date >= $${f.params.length + 1}::date and a.date < ($${f.params.length + 1}::date + interval '1 month')))
        order by w.emp_code`, [...f.params, first]);
    const { rows } = await db.query(
      `select a.worker_id, a.date, a.status, a.ot_hours, a.late_min from attendance a
        where a.org_id = $1 and a.worker_id = any($2::uuid[]) and a.date >= $3::date and a.date < ($3::date + interval '1 month')`,
      [ctx.orgId, workers.map((w) => w.id), first]);
    return { month, ...buildRegister(month, workers, rows) };
  });
}

// ---- overtime --------------------------------------------------------------------------------------------------------

/** Approve a day's overtime so the wage run pays it. */
export function approveOvertime(ctx, attendanceId) {
  return withTenant(ctx, async (db) => {
    const { rows: [a] } = await db.query(
      `select a.id, a.ot_hours, w.stage_id from attendance a join workers w on w.id = a.worker_id where a.id = $1 and a.org_id = $2 for update of a`, [attendanceId, ctx.orgId]);
    if (!a) throw new AppError(404, 'NOT_FOUND', 'Attendance record not found');
    if (!isInScope(ctx, 'stage', a.stage_id)) throw new AppError(403, 'OUT_OF_SCOPE', 'This worker is outside your assigned area');
    if (!(Number(a.ot_hours) > 0)) throw new AppError(422, 'VALIDATION_FAILED', 'There is no overtime on this day to approve');
    const { rows: [row] } = await db.query(`update attendance set ot_approved = true, approved_by = $2 where id = $1 returning *`, [a.id, ctx.membershipId]);
    return row;
  });
}
