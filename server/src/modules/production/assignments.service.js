// Worker ↔ machine assignments per date and shift (backend plan §10.7). The production log defaults its worker from here.

import { withTenant } from '../../db/withTenant.js';
import { isInScope } from '../../middleware/rbac.js';
import { audit } from '../../utils/audit.js';
import { assertOwned, createCrud, invalid } from '../../utils/crud/index.js';
import { AppError } from '../../utils/errors.js';
import { assertUsableMachine } from './machineRules.js';

const crud = createCrud({
  table: 'assignments', label: 'Assignment',
  columns: ['machine_id'],
  select: `t.*, w.name as worker, w.emp_code, m.code as machine_code, s.name as stage, sh.name as shift`,
  joins: `join workers w on w.id = t.worker_id
          join machines m on m.id = t.machine_id
          join stages s on s.id = m.stage_id
          join shifts sh on sh.id = t.shift_id`,
  orderBy: 't.date, sh.start_time, m.code, w.name',
  references: { machine_id: { table: 'machines', label: 'Machine' } },

  // a supervisor sees the assignments of their stages, machines and shifts (empty scope = whole org)
  scope: (f, ctx) => f
    .anyOf('m.stage_id', ctx.scope?.stage_ids).anyOf('t.machine_id', ctx.scope?.machine_ids).anyOf('t.shift_id', ctx.scope?.shift_ids),
  filters: (f, q) => f.eq('t.date', q.date).eq('t.shift_id', q.shift_id).eq('t.machine_id', q.machine_id).eq('t.worker_id', q.worker_id),

  check: (db, ctx, input) => assertUsableMachine(db, ctx, input.machine_id),
});

/**
 * Save the grid for one date and shift. A worker already assigned that day moves to the new machine,
 * so "reassign an absent worker's machine" and "save the whole grid" are the same call. Returns the day's assignments.
 */
async function save(ctx, { date, shift_id, entries }) {
  await withTenant(ctx, async (db) => {
    await assertOwned(db, ctx, 'shifts', shift_id, 'Shift');
    if (!isInScope(ctx, 'shift', shift_id)) throw new AppError(403, 'OUT_OF_SCOPE', 'This shift is outside your assigned area');

    const workerIds = entries.map((e) => e.worker_id);
    const { rows: workers } = await db.query(
      `select id, name, active from workers where org_id = $1 and id = any($2::uuid[])`, [ctx.orgId, workerIds]);
    if (workers.length !== workerIds.length) throw new AppError(404, 'NOT_FOUND', 'Worker not found');
    const inactive = workers.filter((w) => !w.active).map((w) => w.name);
    if (inactive.length) throw invalid('entries', `${inactive.join(', ')} ${inactive.length === 1 ? 'is' : 'are'} not active`);

    for (const machineId of new Set(entries.map((e) => e.machine_id))) await assertUsableMachine(db, ctx, machineId);

    await db.query(
      `insert into assignments (org_id, date, shift_id, worker_id, machine_id, created_by)
       select $1, $2, $3, e.worker_id, e.machine_id, $4 from unnest($5::uuid[], $6::uuid[]) as e(worker_id, machine_id)
       on conflict (org_id, date, shift_id, worker_id) do update set machine_id = excluded.machine_id`,
      [ctx.orgId, date, shift_id, ctx.userId, workerIds, entries.map((e) => e.machine_id)]);
    await audit(db, ctx, { action: 'save', table: 'assignments', id: null, after: { date, shift_id, entries } });
  });
  return (await crud.list(ctx, { date, shift_id })).rows;
}

// no create: save() is the only way in, so a worker can never end up twice in one shift
export const assignments = { list: crud.list, get: crud.get, update: crud.update, remove: crud.remove, save };
