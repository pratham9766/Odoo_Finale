// Wastage (reports.production): planned vs actual loss of finished work orders, by stage, machine or order, with what the extra waste cost.

import { z } from 'zod';
import { withTenant } from '../../db/withTenant.js';
import { rangeQuery } from '../../utils/crud/index.js';
import { round2 } from '../../utils/money.js';
import { reportRange } from '../../utils/time.js';
import { columns } from './support.js';

// what `group` may be: the SQL comes from here, never from the request
const GROUPS = { stage: 'w.stage', machine: 'm.code', order: 'o.order_no' };

const COLUMNS = columns(
  ['key', 'Group'], ['work_orders', 'Work orders'], ['input_qty', 'Input'], ['good_qty', 'Good output'], ['waste_qty', 'Waste'],
  ['planned_waste_pct', 'Planned %'], ['actual_waste_pct', 'Actual %'], ['extra_waste_pct', 'Extra %'], ['extra_cost', 'Extra cost'],
);

export default {
  permission: 'reports.production',
  query: rangeQuery.extend({ group: z.enum(Object.keys(GROUPS)).default('stage') }),
  run: (ctx, { group, ...range }) => {
    const { from, to } = reportRange(range);
    return withTenant(ctx, async (db) => {
      // per work order first, so an unusually bad run is not averaged away; "extra" = what exceeded the stage's planned loss
      const { rows } = await db.query(
        `select ${GROUPS[group]} as key, count(*)::int as work_orders,
                sum(w.input_qty) as input_qty, sum(w.good_qty) as good_qty, sum(w.waste_qty) as waste_qty,
                sum(w.input_qty * coalesce(w.planned_waste_pct, 0)) / nullif(sum(w.input_qty), 0) as planned_waste_pct,
                sum(w.input_qty * coalesce(w.actual_waste_pct, 0)) / nullif(sum(w.input_qty), 0) as actual_waste_pct,
                sum(greatest(0, coalesce(w.actual_waste_pct, 0) - coalesce(w.planned_waste_pct, 0)) / 100 * coalesce(c.cost, 0)) as extra_cost
           from v_wastage w
           join work_orders wo on wo.id = w.work_order_id
           join orders o on o.id = w.order_id
           left join machines m on m.id = w.machine_id
           left join (select work_order_id, sum(qty * unit_cost) as cost from material_issues group by 1) c on c.work_order_id = w.work_order_id
          where wo.finished_at >= $1::date and wo.finished_at < $2::date + 1 and w.input_qty > 0
          group by 1 order by extra_cost desc, key`, [from, to]);

      return {
        period: { from, to }, group, columns: COLUMNS,
        rows: rows.map((r) => {
          const planned = round2(r.planned_waste_pct ?? 0), actual = round2(r.actual_waste_pct ?? 0);
          return { ...r, input_qty: round2(r.input_qty), good_qty: round2(r.good_qty), waste_qty: round2(r.waste_qty),
                   planned_waste_pct: planned, actual_waste_pct: actual, extra_waste_pct: round2(actual - planned), extra_cost: round2(r.extra_cost) };
        }),
      };
    });
  },
};
