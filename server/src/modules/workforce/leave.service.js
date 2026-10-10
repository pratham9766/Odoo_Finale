// Leave requests (backend plan §11.12). Approving a leave marks those days as "leave" in the attendance register, so the
// absent job leaves the worker alone and the wage run counts the days correctly.

import { withTenant } from '../../db/withTenant.js';
import { isInScope } from '../../middleware/rbac.js';
import { createCrud, invalid } from '../../utils/crud/index.js';
import { AppError } from '../../utils/errors.js';

const MAX_LEAVE_DAYS = 60;

const crud = createCrud({
  table: 'leave_requests', label: 'Leave request',
  columns: ['worker_id', 'from_date', 'to_date', 'type', 'reason'],
  select: `t.*, w.name as worker, w.emp_code`,
  joins: `join workers w on w.id = t.worker_id`,
  orderBy: `case t.status when 'pending' then 0 else 1 end, t.from_date desc`,
  references: { worker_id: { table: 'workers', label: 'Worker' } },
  scope: (f, ctx) => f.anyOf('w.stage_id', ctx.scope?.stage_ids),
  filters: (f, q) => f.eq('t.status', q.status).eq('t.worker_id', q.worker_id),
  check: async (db, ctx, input) => {
    const { rows: [w] } = await db.query(`select stage_id, active, default_shift_id from workers where id = $1`, [input.worker_id]);
    if (!w.active) throw invalid('worker_id', 'This worker is not active');
    if (!w.default_shift_id) throw invalid('worker_id', 'Give this worker a default shift before recording leave');
    if (!isInScope(ctx, 'stage', w.stage_id)) throw new AppError(403, 'OUT_OF_SCOPE', 'This worker is outside your assigned area');
    const days = (Date.parse(input.to_date) - Date.parse(input.from_date)) / 86_400_000 + 1;
    if (days > MAX_LEAVE_DAYS) throw invalid('to_date', `Leave can be at most ${MAX_LEAVE_DAYS} days at a time`);
  },
});
// a request is made once and then only decided
export const leave = { list: crud.list, get: crud.get, create: crud.create };

/** Approve or reject. Approving writes a "leave" attendance row for each day (days the worker really worked stay as they are). */
export async function decideLeave(ctx, id, { approve }) {
  await withTenant(ctx, async (db) => {
    const { rows: [l] } = await db.query(
      `select l.*, w.default_shift_id, w.stage_id from leave_requests l join workers w on w.id = l.worker_id where l.id = $1 and l.org_id = $2 for update of l`, [id, ctx.orgId]);
    if (!l) throw new AppError(404, 'NOT_FOUND', 'Leave request not found');
    if (l.status !== 'pending') throw new AppError(409, 'INVALID_STATE_TRANSITION', `This leave request was already ${l.status}`);
    if (!isInScope(ctx, 'stage', l.stage_id)) throw new AppError(403, 'OUT_OF_SCOPE', 'This worker is outside your assigned area');

    if (approve) {
      await db.query(
        `insert into attendance (org_id, worker_id, date, shift_id, status)
         select $1, $2, d::date, $3, 'leave' from generate_series($4::date, $5::date, interval '1 day') d
         on conflict (worker_id, date, shift_id) do update set status = 'leave' where attendance.check_in is null`,
        [ctx.orgId, l.worker_id, l.default_shift_id, l.from_date, l.to_date]);
    }
    await db.query(`update leave_requests set status = $2, approved_by = $3 where id = $1`, [id, approve ? 'approved' : 'rejected', ctx.membershipId]);
  });
  return leave.get(ctx, id);
}
