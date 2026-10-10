// Attendance (reports.attendance): for a month, attendance %, late days, absenteeism and overtime by shift or by stage.
// Attendance % = days worked ÷ (days worked + days absent); leave, holidays and weekly offs are not counted against anyone.

import { z } from 'zod';
import { withTenant } from '../../db/withTenant.js';
import { monthString } from '../../utils/crud/index.js';
import { round2 } from '../../utils/money.js';
import { currentMonth, nextMonthStart } from '../../utils/time.js';
import { columns, pct, totalsOf } from './support.js';

const GROUPS = { shift: ['sh.name', 'sh.start_time'], stage: ['coalesce(st.name, \'No stage\')', 'min(st.sequence)'] };

const COLUMNS = columns(
  ['key', 'Group'], ['worked_days', 'Days worked'], ['absent_days', 'Days absent'], ['late_days', 'Late days'], ['half_days', 'Half days'],
  ['leave_days', 'Leave days'], ['ot_hours', 'OT hours'], ['attendance_pct', 'Attendance %'],
);

export default {
  permission: 'reports.attendance',
  query: z.object({ month: monthString.default(() => currentMonth()), group: z.enum(Object.keys(GROUPS)).default('shift') }),
  run: (ctx, { month, group }) => {
    const first = `${month}-01`;
    const [key, order] = GROUPS[group];
    return withTenant(ctx, async (db) => {
      const { rows } = await db.query(
        `select ${key} as key,
                count(*) filter (where a.status in ('present', 'late', 'half_day'))::int as worked_days,
                count(*) filter (where a.status = 'absent')::int as absent_days,
                count(*) filter (where a.status = 'late')::int as late_days,
                count(*) filter (where a.status = 'half_day')::int as half_days,
                count(*) filter (where a.status = 'leave')::int as leave_days,
                coalesce(sum(a.ot_hours), 0) as ot_hours
           from attendance a join shifts sh on sh.id = a.shift_id join workers w on w.id = a.worker_id left join stages st on st.id = w.stage_id
          where a.org_id = $1 and a.date >= $2::date and a.date < $3::date
          group by ${group === 'shift' ? 'sh.name, sh.start_time' : key} order by ${order}`, [ctx.orgId, first, nextMonthStart(first)]);

      const table = rows.map((r) => ({ ...r, ot_hours: round2(r.ot_hours), attendance_pct: pct(r.worked_days, r.worked_days + r.absent_days) }));
      const totals = totalsOf(table, ['worked_days', 'absent_days', 'late_days', 'half_days', 'leave_days', 'ot_hours']);
      return { month, group, columns: COLUMNS, rows: table, totals: { ...totals, attendance_pct: pct(totals.worked_days, totals.worked_days + totals.absent_days) } };
    });
  },
};
