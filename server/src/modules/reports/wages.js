// Wages (wages.view 🔒): one month, a row per worker from the wage run (v_wages_monthly), with totals by wage type.

import { z } from 'zod';
import { withTenant } from '../../db/withTenant.js';
import { monthString } from '../../utils/crud/index.js';
import { currentMonth } from '../../utils/time.js';
import { columns, totalsOf } from './support.js';

const COLUMNS = columns(
  ['name', 'Worker'], ['wage_type', 'Type'], ['status', 'Run status'], ['days', 'Days'], ['hours', 'Hours'], ['ot_hours', 'OT hours'], ['pieces', 'Pieces'],
  ['gross', 'Gross'], ['advances', 'Advances'], ['deductions', 'Deductions'], ['net', 'Net'],
);
const SUMS = ['gross', 'advances', 'deductions', 'net'];

export default {
  permission: 'wages.view',
  query: z.object({ month: monthString.default(() => currentMonth()) }),
  run: (ctx, { month }) => withTenant(ctx, async (db) => {
    const { rows } = await db.query(
      `select name, wage_type, status, days, hours, ot_hours, pieces, gross, advances, deductions, net from v_wages_monthly where month = $1::date order by name`, [`${month}-01`]);
    const byType = Object.fromEntries(['daily', 'hourly', 'piece'].map((t) => [t, totalsOf(rows.filter((r) => r.wage_type === t), SUMS)]));
    return { month, columns: COLUMNS, rows, totals: totalsOf(rows, SUMS), by_wage_type: byType, status: rows[0]?.status ?? null };
  }),
};
