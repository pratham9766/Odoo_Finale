// The monthly attendance register: workers × days with P / L / H / A / V / W / O and totals (overall plan §13, frontend RegisterGrid).

import { round2 } from '../../utils/money.js';
import { addDays, nextMonthStart } from '../../utils/time.js';

const CODE = { present: 'P', late: 'L', half_day: 'H', absent: 'A', leave: 'V', weekly_off: 'W', holiday: 'O' };
// when a worker has rows for two shifts on one day, the one that says "worked" wins over "absent"
const PRIORITY = ['present', 'late', 'half_day', 'leave', 'holiday', 'weekly_off', 'absent'];

/** Every date of the month ('2026-10') as YYYY-MM-DD. */
export function monthDays(month) {
  const first = `${month}-01`, end = nextMonthStart(first);
  const days = [];
  for (let d = first; d < end; d = addDays(d, 1)) days.push(d);
  return days;
}

/**
 * @param {Array<{ id, emp_code, name }>} workers
 * @param {Array<{ worker_id, date, status, ot_hours, late_min }>} rows  attendance rows of the month
 * @returns {{ days: string[], rows: Array<{ worker_id, emp_code, name, cells: Object<string,string>, totals }> }}
 */
export function buildRegister(month, workers, rows) {
  const days = monthDays(month);
  const byWorker = new Map();
  for (const r of rows) {
    const days = byWorker.get(r.worker_id) ?? new Map();
    const day = days.get(r.date);
    if (!day || PRIORITY.indexOf(r.status) < PRIORITY.indexOf(day.status)) days.set(r.date, { ...r, ot_hours: Number(r.ot_hours) + Number(day?.ot_hours ?? 0) });
    byWorker.set(r.worker_id, days);
  }

  return {
    days,
    rows: workers.map((w) => {
      const mine = byWorker.get(w.id) ?? new Map();
      const cells = {}, totals = { present: 0, late: 0, half_day: 0, absent: 0, leave: 0, ot_hours: 0 };
      for (const date of days) {
        const row = mine.get(date);
        if (!row) continue;
        cells[date] = CODE[row.status] + (Number(row.ot_hours) > 0 ? '+OT' : '');
        if (row.status in totals) totals[row.status]++;
        totals.ot_hours = round2(totals.ot_hours + Number(row.ot_hours));
      }
      return { worker_id: w.id, emp_code: w.emp_code, name: w.name, cells, totals: { ...totals, days_worked: totals.present + totals.late + 0.5 * totals.half_day } };
    }),
  };
}
