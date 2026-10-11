// "My work": the logged-in person's own page. Every staff member gets their profile and what their role allows; one linked
// to a worker record (workers.user_id) also gets today's machine and the month's attendance, output and pay.
// Needs no permission: everything is filtered to this login.

import { withTx } from '../../db/tx.js';
import { round2 } from '../../utils/money.js';
import { nextMonthStart, todayIST } from '../../utils/time.js';
import { grossPay } from '../workforce/wageRules.js';

/** @param {string} userId  @param {string} [month] YYYY-MM, default this month */
export const myWork = (userId, month) =>
  withTx(async (db) => {
    const today = todayIST();
    const from = `${month || today.slice(0, 7)}-01`;
    const to = nextMonthStart(from);

    const { rows: [worker] } = await db.query(
      `select w.id, w.emp_code, w.name, w.phone, w.skill, w.employment_type, w.wage_type, w.rate, w.ot_rate, w.piece_rate,
              s.name as stage, sh.name as default_shift
         from workers w
         left join stages s on s.id = w.stage_id
         left join shifts sh on sh.id = w.default_shift_id
        where w.user_id = $1 and w.active`, [userId]);
    // every staff member: who they are and what their role lets them do (grouped by area)
    const { rows: [profile] } = await db.query(
      `select p.email, p.full_name, p.phone, p.city, p.created_at as joined_at, r.name as role
         from profiles p join roles r on r.id = p.role_id where p.id = $1`, [userId]);
    const { rows: access } = await db.query(
      `select pm.domain, array_agg(pm.description order by pm.key) as items
         from profiles p
         join role_permissions rp on rp.role_id = p.role_id
         join permissions pm on pm.key = rp.permission_key
        where p.id = $1
        group by pm.domain order by pm.domain`, [userId]);
    if (!worker) return { linked: false, month: from.slice(0, 7), profile, access };

    // one transaction client: the queries run one after another
    const today_ = await db.query(
        `select a.date, sh.name as shift, sh.start_time, sh.end_time, m.code as machine, m.name as machine_name, m.status as machine_status,
                wo.wo_no, wo.produced_qty, wo.target_qty, wo.uom, o.order_no,
                (select coalesce(sum(l.qty), 0) from production_logs l
                  where l.worker_id = a.worker_id and l.machine_id = a.machine_id and l.shift_id = a.shift_id
                    and (l.logged_at at time zone 'Asia/Kolkata')::date = a.date) as my_qty
           from assignments a
           join shifts sh on sh.id = a.shift_id
           join machines m on m.id = a.machine_id
           left join work_orders wo on wo.id = m.current_work_order_id
           left join orders o on o.id = wo.order_id
          where a.worker_id = $1 and a.date = $2
          order by sh.start_time`, [worker.id, today]);
    const attendance = await db.query(
        `select a.date, sh.name as shift, a.status, a.check_in, a.check_out, a.worked_hours, a.late_min, a.ot_hours, a.ot_approved
           from attendance a join shifts sh on sh.id = a.shift_id
          where a.worker_id = $1 and a.date >= $2::date and a.date < $3::date
          order by a.date desc, sh.start_time desc`, [worker.id, from, to]);
    const output = await db.query(
        `select l.logged_at, l.qty, l.run_minutes, wo.uom, wo.wo_no, o.order_no, m.code as machine, sh.name as shift
           from production_logs l
           join work_orders wo on wo.id = l.work_order_id
           join orders o on o.id = wo.order_id
           join machines m on m.id = l.machine_id
           join shifts sh on sh.id = l.shift_id
          where l.worker_id = $1 and l.logged_at >= $2::date and l.logged_at < $3::date
          order by l.logged_at desc limit 300`, [worker.id, from, to]);
    const payslips = await db.query(
        `select to_char(r.month, 'YYYY-MM') as month, r.status, l.days, l.ot_hours, l.pieces, l.gross, l.deductions, l.net
           from wage_lines l join wage_runs r on r.id = l.wage_run_id
          where l.worker_id = $1 order by r.month desc limit 12`, [worker.id]);

    const rows = attendance.rows;
    const count = (...st) => rows.filter((a) => st.includes(a.status)).length;
    const totals = {
      days: count('present', 'late') + 0.5 * count('half_day'),
      hours: rows.reduce((t, a) => t + Number(a.worked_hours), 0),
      ot_hours: rows.filter((a) => a.ot_approved).reduce((t, a) => t + Number(a.ot_hours), 0),
      pieces: output.rows.reduce((t, l) => t + Number(l.qty), 0),
    };
    // output per unit: metres and kg must not be added together
    const outputByUom = {};
    for (const l of output.rows) outputByUom[l.uom] = round2((outputByUom[l.uom] ?? 0) + Number(l.qty));

    return {
      linked: true,
      month: from.slice(0, 7),
      profile,
      access,
      worker,
      today: { date: today, assignments: today_.rows, attendance: rows.filter((a) => a.date === today) },
      summary: {
        present: count('present'),
        late: count('late'),
        half_days: count('half_day'),
        absent: count('absent'),
        leave: count('leave'),
        days: totals.days,
        hours: round2(totals.hours),
        ot_hours: round2(totals.ot_hours),
        ot_pending: round2(rows.filter((a) => !a.ot_approved).reduce((t, a) => t + Number(a.ot_hours), 0)),
        output: outputByUom,
        estimated_pay: grossPay(worker, totals),
      },
      attendance: rows,
      output: output.rows,
      payslips: payslips.rows,
    };
  });
