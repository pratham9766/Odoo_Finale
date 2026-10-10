// Work orders: reading and scheduling. They are created by planning (planning.service.js) and moved through
// start / log / pause / finish by the production actions (backend plan §11.7), not by this CRUD.

import { AppError } from '../../utils/errors.js';
import { createCrud } from '../../utils/crud/index.js';
import { assertUsableMachine } from './machineRules.js';

const crud = createCrud({
  table: 'work_orders', label: 'Work order',
  columns: ['machine_id', 'planned_start'],
  select: `t.*, s.name as stage, o.order_no, i.name as item, m.code as machine_code,
           round(100 * t.produced_qty / nullif(t.target_qty, 0), 1) as pct`,
  joins: `join stages s on s.id = t.stage_id
          join orders o on o.id = t.order_id
          join items i on i.id = t.output_item_id
          left join machines m on m.id = t.machine_id`,
  orderBy: 'o.order_no, s.sequence, t.wo_no',
  references: { machine_id: { table: 'machines', label: 'Machine' } },

  // a scoped supervisor sees the work of their stages; an operator only the work on their machines
  scope: (f, ctx) => f.anyOf('t.stage_id', ctx.scope?.stage_ids).anyOf('t.machine_id', ctx.scope?.machine_ids),
  filters: (f, q) => f
    .eq('t.status', q.status).eq('t.stage_id', q.stage_id).eq('t.order_id', q.order_id)
    .eq('t.machine_id', q.machine_id).eq('t.is_rework', q.rework).isNull('t.machine_id', q.unassigned),

  check: async (db, ctx, input, before) => {
    if (!['planned', 'paused'].includes(before.status)) {
      throw new AppError(409, 'INVALID_STATE_TRANSITION', `Work order ${before.wo_no} is ${before.status}; only planned or paused work can be rescheduled`);
    }
    if (input.machine_id) await assertUsableMachine(db, ctx, input.machine_id, { stageId: before.stage_id });
  },
});

// no create / remove: planning creates work orders, and finished work is history
export const workOrders = { list: crud.list, get: crud.get, update: crud.update };
