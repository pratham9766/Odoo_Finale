// GET /qc/summary and /qc/defects (backend plan §10.8): the numbers behind the quality page.

import { withTx } from '../../db/tx.js';
import { reportRange } from '../../utils/time.js';
import { statusCounts } from './queue.service.js';

/** Queue size, results in the period, rejection rate and first-pass yield (rolls that passed at their first inspection). */
export function qcSummary(ctx, range) {
  const { from, to } = reportRange(range);
  return withTx(async (db) => {
    const { rows: [results] } = await db.query(
      `select coalesce(sum(passed), 0)::int as passed, coalesce(sum(rework), 0)::int as rework,
              coalesce(sum(rejected), 0)::int as rejected, coalesce(sum(total), 0)::int as total
         from v_qc_summary where day between $1 and $2`, [from, to]);
    const { rows: [first] } = await db.query(
      `select count(*)::int as inspected, count(*) filter (where result = 'pass')::int as passed
         from (select distinct on (roll_id) result, inspected_at from qc_inspections where not is_override order by roll_id, inspected_at) f
        where inspected_at >= $1::date and inspected_at < $2::date + 1`, [from, to]);
    const { rows: [today] } = await db.query(
      `select count(*)::int as n from qc_inspections where result = 'pass' and not is_override and inspected_at >= date_trunc('day', now())`);

    const pct = (part, whole) => (whole ? Math.round((1000 * part) / whole) / 10 : null);
    return {
      period: { from, to },
      queue: await statusCounts(db),
      passed_today: today.n,
      results,
      rejection_pct: pct(results.rejected, results.total),
      first_pass_yield_pct: pct(first.passed, first.inspected),
    };
  });
}

// what `by=` may group on: column names come from here, never from the request
const GROUPS = { type: 'defect', machine: 'machine_code', shift: 'shift', supplier: 'supplier', batch: 'dye_batch', day: 'day' };

/** Defect counts grouped by cause: type, machine, shift, supplier, dye batch or day, biggest first. */
export function defectsBy(ctx, { by = 'type', ...range }) {
  const { from, to } = reportRange(range);
  const column = GROUPS[by];
  return withTx(async (db) => {
    const { rows } = await db.query(
      `select ${column} as key, sum(defects)::int as defects from v_defects_by_cause
        where day between $1 and $2 group by 1 order by ${by === 'day' ? '1' : '2 desc, 1'}`, [from, to]);
    return { by, period: { from, to }, rows };
  });
}

export const DEFECT_GROUPS = Object.keys(GROUPS);
