import { AppError } from '../../utils/errors.js';
import { createCrud } from '../../utils/crud/index.js';

export const machines = createCrud({
  table: 'machines', label: 'Machine',
  columns: ['code', 'name', 'stage_id', 'capacity_per_hour', 'capacity_uom', 'hourly_overhead', 'active'],
  select: 't.*, s.name as stage',
  joins: 'join stages s on s.id = t.stage_id',
  orderBy: 's.sequence, length(t.code), t.code',           // S-2 before S-10
  references: { stage_id: { table: 'stages', label: 'Stage' } },

  // a scoped supervisor / operator only sees their stages and machines (empty scope = whole org)
  scope: (f, ctx) => f.anyOf('t.stage_id', ctx.scope?.stage_ids).anyOf('t.id', ctx.scope?.machine_ids),
  filters: (f, q) => f.eq('t.stage_id', q.stage_id).eq('t.active', q.active).eq('t.status', q.status),

  // moving or retiring a machine mid-run would orphan its work order
  check: async (_db, _ctx, input, before) => {
    const leaving = input.active === false || (input.stage_id && input.stage_id !== before?.stage_id);
    if (before?.status === 'running' && leaving) {
      throw new AppError(409, 'INVALID_STATE_TRANSITION', 'This machine is running. Pause or finish its work order first.');
    }
  },

  duplicate: (m) => `Machine code ${m.code} already exists`,
  inUse: 'This machine has work orders, logs or events and cannot be deleted. Deactivate it instead.',
});
