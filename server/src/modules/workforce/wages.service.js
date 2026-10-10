// Wage runs (backend plan §11.13): HR prepares the month from attendance and production, a different person approves, then it is paid.
// A payslip is one worker's line of a run. Wages are confidential: wages.view / wages.run / wages.pay, plus "my own payslip".

import { withTx } from '../../db/tx.js';
import { audit } from '../../utils/audit.js';
import { createCrud, invalid } from '../../utils/crud/index.js';
import { AppError } from '../../utils/errors.js';
import { round2 } from '../../utils/money.js';
import * as pdf from '../../utils/pdf.js';
import { nextMonthStart, todayIST } from '../../utils/time.js';
import { getMill } from '../mill/mill.service.js';
import { grossPay } from './wageRules.js';

const runs = createCrud({
  table: 'wage_runs', label: 'Wage run', columns: [],
  select: `t.*, (select count(*)::int from wage_lines l where l.wage_run_id = t.id) as workers, pp.full_name as prepared_by_name, ap.full_name as approved_by_name`,
  joins: `left join profiles pp on pp.id = t.prepared_by left join profiles ap on ap.id = t.approved_by`,
  orderBy: 't.month desc',
});

const monthFirst = (month) => `${month}-01`;

/** Per worker: the month's days (half day = 0.5), hours, approved OT hours and pieces (production output) — everything grossPay needs. */
export async function monthTotals(db, from, to) {
  const { rows } = await db.query(
    `select w.id, w.wage_type, w.rate, w.ot_rate, w.piece_rate,
            coalesce(sum(case when a.status in ('present', 'late') then 1 when a.status = 'half_day' then 0.5 else 0 end), 0)::float as days,
            count(*) filter (where a.status = 'half_day')::int as half_days,
            coalesce(sum(a.worked_hours), 0)::float as hours,
            coalesce(sum(a.ot_hours) filter (where a.ot_approved), 0)::float as ot_hours,
            (select coalesce(sum(l.qty), 0)::float from production_logs l where l.worker_id = w.id and l.logged_at >= $1::date and l.logged_at < $2::date) as pieces
       from workers w left join attendance a on a.worker_id = w.id and a.date >= $1::date and a.date < $2::date
      where (w.active or exists (select 1 from attendance x where x.worker_id = w.id and x.date >= $1::date and x.date < $2::date))
      group by w.id order by w.emp_code`, [from, to]);
  return rows;
}

/**
 * Prepare (or re-prepare, while still a draft) the wage run of a month: one line per worker, totals on the run.
 * @param {string} month YYYY-MM
 */
export async function prepareRun(ctx, { month }, { at = new Date() } = {}) {
  const from = monthFirst(month), to = nextMonthStart(from);
  if (from > todayIST(at)) throw invalid('month', 'A wage run cannot be prepared for a month that has not started');

  const id = await withTx(async (db) => {
    let { rows: [run] } = await db.query(`select * from wage_runs where month = $1 for update`, [from]);
    if (run && run.status !== 'draft') throw new AppError(409, 'INVALID_STATE_TRANSITION', `The ${month} wage run is already ${run.status}`);
    if (run) {                                                              // re-prepare: start the lines again
      await db.query(`delete from wage_lines where wage_run_id = $1`, [run.id]);
    } else {
      ({ rows: [run] } = await db.query(`insert into wage_runs (month, prepared_by) values ($1, $2) returning *`, [from, ctx.userId]));
    }

    let totalGross = 0, totalNet = 0;
    for (const w of await monthTotals(db, from, to)) {
      const gross = grossPay(w, w);
      const net = gross;
      await db.query(
        `insert into wage_lines (wage_run_id, worker_id, days, half_days, hours, ot_hours, pieces, gross, net)
         values ($1, $2, $3, $4, $5, $6, $7, $8, $9)`,
        [run.id, w.id, w.days, w.half_days, round2(w.hours), round2(w.ot_hours), w.pieces, gross, net]);
      totalGross = round2(totalGross + gross);
      totalNet = round2(totalNet + net);
    }
    await db.query(`update wage_runs set total_gross = $2, total_net = $3 where id = $1`, [run.id, totalGross, totalNet]);
    return run.id;
  });
  return getRun(ctx, id);
}

export const listRuns = runs.list;

/** A run with its lines, worker by worker. */
export async function getRun(ctx, id) {
  const run = await runs.get(ctx, id);
  const lines = await withTx(async (db) => (await db.query(
    `select l.*, w.emp_code, w.name, w.wage_type from wage_lines l join workers w on w.id = l.worker_id where l.wage_run_id = $1 order by w.emp_code`, [id])).rows);
  return { ...run, lines };
}

/** Whether somebody other than `userId` could approve, so "approver ≠ preparer" can be enforced only when it is possible. */
async function anotherApprover(db, userId) {
  const { rowCount } = await db.query(
    `select 1 from profiles p join role_permissions rp on rp.role_id = p.role_id
      where p.status = 'active' and rp.permission_key = 'wages.pay' and p.id <> $1 limit 1`, [userId]);
  return rowCount > 0;
}

async function moveRun(ctx, id, from, to, action, fields) {
  await withTx(async (db) => {
    const { rows: [run] } = await db.query(`select * from wage_runs where id = $1 for update`, [id]);
    if (!run) throw new AppError(404, 'NOT_FOUND', 'Wage run not found');
    if (run.status !== from) throw new AppError(409, 'INVALID_STATE_TRANSITION', `This wage run is ${run.status}; only a ${from} run can be ${to}`);
    if (to === 'approved' && run.prepared_by === ctx.userId && await anotherApprover(db, ctx.userId)) {
      throw new AppError(403, 'FORBIDDEN', 'A different person has to approve a wage run that you prepared');
    }
    await db.query(`update wage_runs set status = $2, ${fields.column} = $3 where id = $1`, [id, to, fields.value(ctx)]);
    await audit(db, ctx, { action, table: 'wage_runs', id, before: { status: run.status }, after: { status: to, total_gross: run.total_gross, total_net: run.total_net } });
  });
  return getRun(ctx, id);
}

export const approveRun = (ctx, id) =>
  moveRun(ctx, id, 'draft', 'approved', 'wage_approve', { column: 'approved_by', value: (c) => c.userId });
export const payRun = (ctx, id, { at = new Date() } = {}) =>
  moveRun(ctx, id, 'approved', 'paid', 'wage_pay', { column: 'paid_at', value: () => at });

// ---- payslip ----------------------------------------------------------------------------------------------------------

/** One worker's line of a month's run, for the worker themself or for wages.view. */
export async function payslipData(ctx, workerId, month) {
  const org = await getMill();
  return withTx(async (db) => {
    const { rows: [worker] } = await db.query(`select * from workers where id = $1`, [workerId]);
    if (!worker) throw new AppError(404, 'NOT_FOUND', 'Worker not found');
    if (!ctx.permissions.has('wages.view') && worker.user_id !== ctx.userId) throw new AppError(403, 'FORBIDDEN', 'You can only see your own payslip');

    const { rows: [line] } = await db.query(
      `select l.*, r.status from wage_lines l join wage_runs r on r.id = l.wage_run_id where l.worker_id = $1 and r.month = $2`,
      [workerId, monthFirst(month)]);
    if (!line) throw new AppError(404, 'NOT_FOUND', `No wage run for ${month} includes this worker yet`);
    return { worker, line, month: monthFirst(month), status: line.status, org };
  });
}

export async function payslipPdf(ctx, workerId, month) {
  const data = await payslipData(ctx, workerId, month);
  return { buffer: await pdf.payslip(data), filename: `payslip-${data.worker.emp_code}-${month}.pdf` };
}
