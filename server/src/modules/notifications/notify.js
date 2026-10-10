import { emitTo } from '../../realtime/socket.js';

// Contract (§22.2): notify(db, { orgId, userId?, requiredPermission?, type, title, body, link, data })
// `db` must be inside a transaction whose tenant is `orgId` (use withTenant / withSystem).
export async function notify(db, { orgId, userId = null, requiredPermission = null, type, title, body = null, link = null, data = null }) {
  const { rows: [n] } = await db.query(
    `insert into notifications (org_id, user_id, required_permission, type, title, body, link, data)
     values ($1,$2,$3,$4,$5,$6,$7,$8) returning id, user_id, required_permission, type, title, body, link, created_at`,
    [orgId, userId, requiredPermission, type, title, body, link, data],
  );
  // emit is fire-and-forget; the client refetches /notifications for the permission-filtered list
  emitTo(userId ? `user:${userId}` : `org:${orgId}`, 'notification.new', { id: n.id, type, title, link });
  return n;
}
