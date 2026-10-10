// People and money around the factory: daily attendance (planted absence / lateness / overtime patterns), OT approval,
// monthly wage runs (prepared → approved → paid through the real services) and monthly overhead expenses.
//
// Attendance is the one volume-heavy part (60 workers a day), so it is written in bulk per day with the SAME rules the
// attendance service uses (attendance.rules.js); everything else goes through the services.

import { checkInResult, checkOutResult } from '../../../server/src/modules/workforce/attendance.rules.js';
import { approveRun, payRun, prepareRun } from '../../../server/src/modules/workforce/wages.service.js';
import { shiftWindow } from '../../../server/src/utils/shifts.js';
import { addDays, istParts } from '../../../server/src/utils/time.js';
import { insertRows } from '../lib/insert.js';
import { PATTERNS } from './config.js';

/** The day's fate for one worker on one shift. */
function plan(sim, shift, { today }) {
  const r = sim.rng.next();
  if (!today && r < PATTERNS.leave) return 'leave';
  if (!today && r < PATTERNS.leave + PATTERNS.absence) return 'absent';
  if (r < PATTERNS.leave + PATTERNS.absence + PATTERNS.halfDay) return 'half_day';
  const lateChance = shift.name === 'C' ? PATTERNS.lateNight : PATTERNS.late;
  if (sim.rng.chance(lateChance)) return 'late';
  if (sim.rng.chance(PATTERNS.overtime)) return 'overtime';
  return 'normal';
}

/**
 * One calendar day of attendance for every worker, shift by shift. Shifts that have not started by "now" are skipped; today's
 * started shifts get exactly PATTERNS.absentToday absentees and no check-out for workers still on the floor.
 */
export async function attendanceDay(sim, date) {
  const today = date === istParts(sim.now).date;
  const rows = [];
  let absentLeft = today ? PATTERNS.absentToday : 0;

  for (const shift of sim.shifts) {
    const { start, end } = shiftWindow(shift, date);
    if (start > sim.now) continue;
    const crew = sim.workers.filter((w) => w.default_shift_id === shift.id);
    for (const w of crew) {
      let fate = plan(sim, shift, { today });
      if (today && absentLeft > 0 && sim.rng.chance(0.25)) { fate = 'absent'; absentLeft--; }
      if (fate === 'leave' || fate === 'absent') {
        rows.push({ worker_id: w.id, shift_id: shift.id, status: fate });
        continue;
      }
      const inAt = fate === 'late'
        ? sim.after(start, shift.grace_min + sim.rng.int(5, 45))
        : sim.after(start, sim.rng.int(-12, Math.min(5, shift.grace_min)));
      const stay = fate === 'overtime' ? sim.rng.int(60, 180) : fate === 'half_day' ? -sim.rng.int(250, 330) : sim.rng.int(0, 15);
      const outAt = sim.after(end, stay);
      const checkIn = checkInResult(shift, date, inAt);
      const row = { worker_id: w.id, shift_id: shift.id, check_in: inAt, late_min: checkIn.lateMin, status: checkIn.status };
      if (outAt <= sim.now) {
        const out = checkOutResult({ check_in: inAt, status: checkIn.status }, shift, date, outAt);
        Object.assign(row, { check_out: outAt, worked_hours: out.workedHours, ot_hours: out.otHours, early_leave_min: out.earlyLeaveMin, status: out.status });
      } else if (end < sim.now) {
        row.needs_correction = true;                                   // forgot to check out
      }
      rows.push(row);
    }
  }
  // fill missing columns so every row has the same keys (insertRows needs that)
  const full = rows.map((r) => ({
    worker_id: r.worker_id, date, shift_id: r.shift_id, check_in: r.check_in ?? null, check_out: r.check_out ?? null,
    worked_hours: r.worked_hours ?? 0, late_min: r.late_min ?? 0, early_leave_min: r.early_leave_min ?? 0, ot_hours: r.ot_hours ?? 0,
    ot_approved: false, status: r.status, needs_correction: r.needs_correction ?? false,
  }));
  await insertRows(sim.admin, 'attendance', full);
}

/** Supervisors approve most overtime a day or two later. */
export async function approveOvertime(sim, upToDate) {
  await sim.sql(
    `update attendance set ot_approved = true, approved_by = $2
      where ot_hours > 0 and not ot_approved and date <= $1 and (hashtext(id::text) % 10) <> 0`,
    [upToDate, sim.ctx.hr.userId]);
}

/** The month's wage run: prepared by HR, approved and paid by Accounts (paid only when that date has passed). */
export async function wageRun(sim, month, { finalise }) {
  const preparedAt = new Date(`${addDays(month, 31).slice(0, 7)}-02T11:00:00+05:30`);
  const at = finalise ? preparedAt : sim.after(sim.now, -60);
  const run = await prepareRun(sim.ctx.hr, { month: month.slice(0, 7) }, { at });   // the service takes YYYY-MM
  if (!finalise) return run;
  await approveRun(sim.ctx.accounts, run.id);
  const paidAt = sim.after(preparedAt, 3 * 1440);
  if (paidAt <= sim.now) await payRun(sim.ctx.accounts, run.id, { at: paidAt });
  return run;
}

const OVERHEADS = [
  ['power', 380_000, 520_000, 'Electricity (DGVCL)'],
  ['rent', 150_000, 150_000, 'Shed rent'],
  ['maintenance', 40_000, 90_000, 'Spares and servicing'],
  ['salary_staff', 520_000, 560_000, 'Office and supervisory salaries'],
  ['other', 15_000, 40_000, 'Admin, travel, misc.'],
];

/** The month's overhead bills, dated the 5th of the next month and paid by then. */
export async function monthlyExpenses(sim, month) {
  const date = `${addDays(month, 31).slice(0, 7)}-05`;
  const at = new Date(`${date}T12:00:00+05:30`);
  if (at > sim.now) return;
  await insertRows(sim.admin, 'expenses', OVERHEADS.map(([category, min, max, note]) => ({
    category, amount: sim.rng.stepped(min, max, 1000), date, note: `${note} · ${month.slice(0, 7)}`, paid: true,
    created_at: at, created_by: sim.ctx.accounts.userId,
  })));
}
