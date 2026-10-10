import { Server } from 'socket.io';
import { verifyToken } from '../middleware/auth.js';
import { withTenant } from '../db/withTenant.js';
import { env } from '../config/env.js';

let io;

export function initSocket(server) {
  io = new Server(server, { cors: { origin: env.CLIENT_URL } });

  io.use(async (socket, next) => {
    try {
      const { token, orgId } = socket.handshake.auth;
      const payload = await verifyToken(token);
      const ok = await withTenant({ orgId, userId: payload.sub }, async (db) =>
        (await db.query(
          `select 1 from memberships where user_id = $1 and org_id = $2 and status = 'active'`,
          [payload.sub, orgId],
        )).rowCount > 0);
      if (!ok) return next(new Error('forbidden'));
      socket.data = { userId: payload.sub, orgId };
      next();
    } catch {
      next(new Error('unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    socket.join([`org:${socket.data.orgId}`, `user:${socket.data.userId}`]);

    socket.on('order:watch', async (orderId) => {
      // join only if this org is a party to the order (RLS does the check)
      try {
        const ok = await withTenant({ orgId: socket.data.orgId, userId: socket.data.userId }, async (db) =>
          (await db.query(`select 1 from orders where id = $1`, [orderId])).rowCount > 0);
        if (ok) socket.join(`order:${orderId}`);
      } catch {
        /* invalid id: ignore */
      }
    });
    socket.on('order:unwatch', (orderId) => socket.leave(`order:${orderId}`));
  });
  return io;
}

// socket events carry NO confidential fields; clients refetch through the API
export const emitTo = (room, event, data) => io?.to(room).emit(event, data);
export const emitToOrgs = (orgIds, event, data) => {
  for (const id of new Set(orgIds.filter(Boolean))) emitTo(`org:${id}`, event, data);
};
