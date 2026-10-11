// notify(): creates a notification for one person or for everyone holding a permission, and pushes it over the socket.
import { emitTo, emitToMill } from '../../realtime/socket.js';

// notify(db, { userId?, requiredPermission?, type, title, body, link, data }) inside an open transaction.
// userId = one person; otherwise everyone whose role has requiredPermission (or everyone when it is null).
export async function notify(db, { userId = null, requiredPermission = null, type, title, body = null, link = null, data = null }) {
  const { rows: [n] } = await db.query(
    `insert into notifications (user_id, required_permission, type, title, body, link, data)
     values ($1,$2,$3,$4,$5,$6,$7) returning id, user_id, required_permission, type, title, body, link, created_at`,
    [userId, requiredPermission, type, title, body, link, data],
  );
  // emit is fire-and-forget; the client refetches /notifications for the permission-filtered list
  if (userId) emitTo(`user:${userId}`, 'notification.new', { id: n.id, type, title, link });
  else emitToMill('notification.new', { id: n.id, type, title, link });
  return n;
}
