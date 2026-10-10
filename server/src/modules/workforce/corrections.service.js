// Attendance corrections (backend plan §11.12): a supervisor asks for a day to be fixed, a manager decides. The punches are never
// edited; an approved correction recomputes the attendance row from the corrected times.

import { withTenant } from '../../db/withTenant.js';
import { isInScope } from '../../middleware/rbac.js';
import { audit } from '../../utils/audit.js';
import { createCrud, invalid } from '../../utils/crud/index.js';
import { AppError } from '../../utils/errors.js';
import { dayFromTimes } from './attendance.rules.js';

const crud = createCrud({
  table: 'attendance_corrections', label: 'Correction', columns: [],
  select: `t.*, w.name as worker, w.emp_code, a.date, sh.name as shift, a.check_in as current_check_in, a.check_out as current_check_out, a.status as current_status`,
  joins: `join attendance a on a.id = t.attendance_id join workers w on w.id = a.worker_id join shifts sh on sh.id = a.shift_id`,
  orderBy: `case t.status when 'pending' then 0 else 1 end, t.created_at desc`,
  scope: (f, ctx) => f.anyOf('w.stage_id', ctx.scope?.stage_ids).anyOf('a.shift_id', ctx.scope?.shift_ids),
  filters: (f, q) => f.eq('t.status', q.status),
});
// requested and decided through requestCorrection / decideCorrection only
export const corrections = { list: crud.list, get: crud.get };

/** The attendance row (locked) with its worker's stage and its shift, for a caller who may act on it. */
async function lockDay(db, ctx, attendanceId) {
  const { rows: [a] } = await db.query(
    `select a.*, w.stage_id, row_to_json(sh) as shift from attendance a join workers w on w.id = a.worker_id join shifts sh on sh.id = a.shift_id
      where a.id = $1 and a.org_id = $2 for update of a`, [attendanceId, ctx.orgId]);
  if (!a) throw new AppError(404, 'NOT_FOUND', 'Attendance record not found');
  if (!isInScope(ctx, 'stage', a.stage_id) || !isInScope(ctx, 'shift', a.shift_id)) throw new AppError(403, 'OUT_OF_SCOPE', 'This worker is outside your assigned area');
  return a;
}

/** What the day would look like with the requested change; refuses an out time without an in time or before it. */
function corrected(day, change) {
  const checkIn = change.check_in ?? day.check_in, checkOut = change.check_out ?? day.check_out;
  if (checkOut && !checkIn) throw invalid('change', 'A check-out needs a check-in');
  if (checkIn && checkOut && checkOut < checkIn) throw invalid('change', 'Check-out is before check-in');
  return dayFromTimes(day.shift, day.date, { check_in: checkIn, check_out: checkOut, status: change.status });
}

export async function requestCorrection(ctx, { attendance_id: attendanceId, change, reason }) {
  const id = await withTenant(ctx, async (db) => {
    const day = await lockDay(db, ctx, attendanceId);
    corrected(day, change);                                                  // fail now, not when someone approves
    const { rows: [row] } = await db.query(
      `insert into attendance_corrections (org_id, attendance_id, requested_by, change, reason) values ($1, $2, $3, $4, $5) returning id`,
      [ctx.orgId, attendanceId, ctx.membershipId, JSON.stringify(change), reason]);
    return row.id;
  });
  return corrections.get(ctx, id);
}

export async function decideCorrection(ctx, id, { approve }, { at = new Date() } = {}) {
  await withTenant(ctx, async (db) => {
    const { rows: [c] } = await db.query(`select * from attendance_corrections where id = $1 and org_id = $2 for update`, [id, ctx.orgId]);
    if (!c) throw new AppError(404, 'NOT_FOUND', 'Correction not found');
    if (c.status !== 'pending') throw new AppError(409, 'INVALID_STATE_TRANSITION', `This correction was already ${c.status}`);
    const day = await lockDay(db, ctx, c.attendance_id);

    if (approve) {
      const change = { check_in: c.change.check_in && new Date(c.change.check_in), check_out: c.change.check_out && new Date(c.change.check_out), status: c.change.status };
      const fixed = corrected(day, change);
      await db.query(
        `update attendance set check_in = $2, check_out = $3, worked_hours = $4, late_min = $5, early_leave_min = $6, ot_hours = $7, status = $8,
                needs_correction = false, approved_by = $9 where id = $1`,
        [day.id, fixed.check_in, fixed.check_out, fixed.worked_hours, fixed.late_min, fixed.early_leave_min, fixed.ot_hours, fixed.status, ctx.membershipId]);
      await audit(db, ctx, { action: 'attendance_correction', table: 'attendance', id: day.id,
        before: { check_in: day.check_in, check_out: day.check_out, status: day.status }, after: { check_in: fixed.check_in, check_out: fixed.check_out, status: fixed.status } });
    }
    await db.query(`update attendance_corrections set status = $2, approved_by = $3, decided_at = $4 where id = $1`,
      [id, approve ? 'approved' : 'rejected', ctx.membershipId, at]);
  });
  return corrections.get(ctx, id);
}
