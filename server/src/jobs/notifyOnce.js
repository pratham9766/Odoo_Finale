// "Tell people once a day": the jobs run hourly or daily, a notification must not repeat every time (backend plan §14).

import { notify } from '../modules/notifications/notifications.service.js';
import { TZ } from '../utils/time.js';

/**
 * Create the notification unless one with the same type and link already exists since midnight (IST).
 * Runs inside withSystem(orgId). @returns {Promise<boolean>} true when it was created now
 */
export async function notifyOnceToday(db, notification) {
  const { rowCount } = await db.query(
    `select 1 from notifications
      where org_id = $1 and type = $2 and link is not distinct from $3
        and created_at >= date_trunc('day', now() at time zone $4) at time zone $4`,
    [notification.orgId, notification.type, notification.link ?? null, TZ]);
  if (rowCount) return false;
  await notify(db, notification);
  return true;
}
