import { Router } from 'express';
import { can, requireOrgType, scopeIds } from '../../middleware/rbac.js';
import { withTenant } from '../../db/withTenant.js';
import { send } from '../../utils/http.js';

const router = Router();
router.get('/machines/board', requireOrgType('manufacturer'), can('production.view'), send(req =>
  withTenant(req.ctx, async db => {
    const { rows } = await db.query(`
      select m.id, m.code, m.status, s.name as stage_name, o.order_no,
             m.capacity_uom as uom,
             assignments.operator_name, assignments.shift_name,
             coalesce(output.qty, 0) as today_qty
      from machines m
      join stages s on s.id = m.stage_id
      left join work_orders wo on wo.id = m.current_work_order_id
      left join orders o on o.id = wo.order_id
      left join lateral (
        select string_agg(distinct w.name, ', ') as operator_name,
               string_agg(distinct sh.name, ', ') as shift_name
        from assignments a join workers w on w.id = a.worker_id
        join shifts sh on sh.id = a.shift_id
        where a.machine_id = m.id and a.date = (now() at time zone 'Asia/Kolkata')::date
          and (cardinality($3::uuid[]) = 0 or a.shift_id = any($3::uuid[]))
      ) assignments on true
      left join lateral (
        select sum(pl.qty) as qty from production_logs pl
        where pl.machine_id = m.id
          and pl.logged_at >= (date_trunc('day', now() at time zone 'Asia/Kolkata') at time zone 'Asia/Kolkata')
          and (cardinality($3::uuid[]) = 0 or pl.shift_id = any($3::uuid[]))
      ) output on true
      where m.active
        and (cardinality($1::uuid[]) = 0 or m.id = any($1::uuid[]))
        and (cardinality($2::uuid[]) = 0 or m.stage_id = any($2::uuid[]))
        and (cardinality($3::uuid[]) = 0 or exists (
          select 1 from assignments a where a.machine_id = m.id
            and a.date = (now() at time zone 'Asia/Kolkata')::date and a.shift_id = any($3::uuid[])
        ))
      order by s.sequence, m.code`, [scopeIds(req.ctx, 'machine'), scopeIds(req.ctx, 'stage'), scopeIds(req.ctx, 'shift')]);
    return rows;
  })
));
export default router;
