// "Tell people once a day": the jobs run hourly or daily, a notification must not repeat every time.

import { notify } from '../modules/notifications/notify.js';
import { TZ } from '../utils/time.js';

/**
 * Create the notification unless one with the same type and link already exists since midnight (IST).
 * Runs inside a transaction. @returns {Promise<boolean>} true when it was created now
 */
export async function notifyOnceToday(db, notification) {
  const { rowCount } = await db.query(
    `select 1 from notifications
      where type = $1 and link is not distinct from $2
        and created_at >= date_trunc('day', now() at time zone $3) at time zone $3`,
    [notification.type, notification.link ?? null, TZ]);
  if (rowCount) return false;
  await notify(db, notification);
  return true;
}
