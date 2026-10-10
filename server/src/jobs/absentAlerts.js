// Absent marking (backend plan §11.12, §14): every 10 minutes, a worker with a default shift and no attendance by shift start + 30 min is absent.
// The job only writes the rows and announces them; the supervisors are told by the attendance.absent listener (attendanceReactions.js).

import { bus } from '../events/bus.js';
import { loadShifts } from '../modules/orgs/orgs.service.js';
import { shiftWindow } from '../utils/shifts.js';
import { addDays, istParts } from '../utils/time.js';
import { forEachActiveOrg } from './forEachActiveOrg.js';

const AFTER_START_MIN = 30;

/**
 * Mark the org's missing workers absent for today's and yesterday's shifts (yesterday's night shift is still "today" until morning).
 * Skips holidays, workers added after the shift started, and anyone who already has a row (present, on leave, ...).
 * @returns {Promise<Array<{ shiftId: string, workerIds: string[] }>>} one entry per shift that got new absentees
 */
export async function markAbsent(db, orgId, now = new Date()) {
  const today = istParts(now).date;
  const marked = [];
  for (const shift of await loadShifts(db, orgId)) {
    for (const date of [addDays(today, -1), today]) {
      const { start } = shiftWindow(shift, date);
      if (now < new Date(start.getTime() + AFTER_START_MIN * 60_000)) continue;
      const { rows } = await db.query(
        `insert into attendance (org_id, worker_id, date, shift_id, status)
         select $1, w.id, $2, $3, 'absent' from workers w
          where w.org_id = $1 and w.active and w.default_shift_id = $3 and w.created_at <= $4
            and not exists (select 1 from attendance a where a.worker_id = w.id and a.date = $2 and a.shift_id = $3)
            and not exists (select 1 from holidays h where h.org_id = $1 and h.date = $2)
         returning worker_id`, [orgId, date, shift.id, start]);
      if (rows.length) marked.push({ shiftId: shift.id, workerIds: rows.map((r) => r.worker_id) });
    }
  }
  return marked;
}

async function run(now = new Date()) {
  const { ok } = await forEachActiveOrg('absentAlerts', (db, orgId) => markAbsent(db, orgId, now));
  let workers = 0;
  for (const { orgId, result } of ok) {
    for (const { shiftId, workerIds } of result) {
      bus.emit('attendance.absent', { orgId, workerIds, shiftId });
      workers += workerIds.length;
    }
  }
  return workers;
}

export const absentAlerts = { name: 'absentAlerts', schedule: '*/10 * * * *', run };
