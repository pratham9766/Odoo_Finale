// Attendance's reactions (backend plan §12): attendance.absent tells the supervisors who did not turn up.
// (The attendance.punched socket push is sent by announcePunch right after a punch, not by a listener.)

import { withSystem } from '../../db/withTenant.js';
import { notify } from '../../modules/notifications/notifications.service.js';
import { todayCounts } from '../../modules/workforce/attendance.service.js';
import { publishToOrg } from '../../utils/publish.js';
import { on } from '../bus.js';

/** One notification per stage: "3 absent in Weaving, shift A" with the names. */
async function onAbsent({ orgId, workerIds, shiftId }) {
  await withSystem(orgId, async (db) => {
    const { rows } = await db.query(
      `select coalesce(st.name, 'No stage') as stage, sh.name as shift, array_agg(w.name order by w.name) as names
         from workers w join shifts sh on sh.id = $2 left join stages st on st.id = w.stage_id
        where w.id = any($1::uuid[]) group by st.name, sh.name order by st.name`, [workerIds, shiftId]);
    for (const g of rows) {
      await notify(db, {
        orgId, requiredPermission: 'attendance.mark', type: 'attendance.absent', link: '/app/workforce/attendance/today',
        title: `${g.names.length} absent in ${g.stage}, shift ${g.shift}`, body: g.names.join(', '),
      });
    }
  });
  await publishToOrg(orgId, 'attendance.updated', (db) => todayCounts(db, orgId));
}

/** Called once by events/listeners/index.js at boot. */
export function registerAttendanceReactions() {
  on('attendance.absent', onAbsent);
}
