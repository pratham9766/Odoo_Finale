// Machine production (reports.production): output, run hours, downtime, idle time and utilisation per machine, plus the share of
// its rolls QC rejected (weaving machines only: that is where a roll's machine is recorded).

import { withTenant } from '../../db/withTenant.js';
import { rangeQuery } from '../../utils/crud/index.js';
import { round2 } from '../../utils/money.js';
import { shiftHours } from '../../utils/shifts.js';
import { daysBetween, reportRange } from '../../utils/time.js';
import { loadShifts } from '../orgs/orgs.service.js';
import { columns, pct } from './support.js';

const COLUMNS = columns(
  ['code', 'Machine'], ['stage', 'Stage'], ['uom', 'Unit'], ['output', 'Output'], ['run_hours', 'Run hours'], ['downtime_hours', 'Downtime hours'],
  ['idle_hours', 'Idle hours'], ['utilisation_pct', 'Utilisation %'], ['rolls', 'Rolls'], ['rejected_rolls', 'Rejected rolls'], ['defect_pct', 'Rejected %'],
);

export default {
  permission: 'reports.production',
  query: rangeQuery,
  run: (ctx, query) => {
    const { from, to } = reportRange(query);
    return withTenant(ctx, async (db) => {
      const shifts = await loadShifts(db, ctx.orgId);
      const availableHours = (daysBetween(from, to) + 1) * shifts.reduce((n, s) => n + shiftHours(s), 0);   // what the shifts could have run

      const { rows } = await db.query(
        `select m.code, s.name as stage, m.capacity_uom as uom,
                coalesce(p.qty, 0) as output, coalesce(p.run_hours, 0) as run_hours, coalesce(d.hours, 0) as downtime_hours,
                coalesce(q.total, 0) as rolls, coalesce(q.rejected, 0) as rejected_rolls
           from machines m join stages s on s.id = m.stage_id
           left join (select machine_id, sum(qty) as qty, sum(run_minutes) / 60.0 as run_hours from production_logs
                       where logged_at >= $1::date and logged_at < $2::date + 1 group by 1) p on p.machine_id = m.id
           left join (select machine_id, sum(extract(epoch from least(coalesce(ended_at, now()), $2::date + 1) - greatest(started_at, $1::date))) / 3600.0 as hours
                        from machine_events where status in ('breakdown', 'maintenance') and started_at < $2::date + 1 and coalesce(ended_at, now()) > $1::date group by 1) d on d.machine_id = m.id
           left join (select h.machine_id, count(*)::int as total, count(*) filter (where r.status = 'rejected')::int as rejected
                        from roll_history h join rolls r on r.id = h.roll_id
                       where h.event = 'woven' and r.created_at >= $1::date and r.created_at < $2::date + 1 group by 1) q on q.machine_id = m.id
          where m.active order by s.sequence, length(m.code), m.code`, [from, to]);

      return {
        period: { from, to }, available_hours: availableHours, columns: COLUMNS,
        rows: rows.map((m) => {
          const run = Number(m.run_hours), down = Number(m.downtime_hours);
          return {
            ...m, output: round2(m.output), run_hours: round2(run), downtime_hours: round2(down),
            idle_hours: round2(Math.max(0, availableHours - run - down)), utilisation_pct: pct(run, availableHours),
            defect_pct: pct(m.rejected_rolls, m.rolls),
          };
        }),
      };
    });
  },
};
