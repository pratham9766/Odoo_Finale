// Socket.io server: authenticates the browser, puts it in the mill room, and emits live updates to a person or to everyone.
import { Server } from 'socket.io';
import { verifyToken } from '../middleware/auth.js';
import { withTx } from '../db/tx.js';
import { env } from '../config/env.js';

let io;
export const MILL_ROOM = 'mill';

export function initSocket(server) {
  io = new Server(server, { cors: { origin: env.CLIENT_URL } });

  io.use(async (socket, next) => {
    try {
      const payload = await verifyToken(socket.handshake.auth.token);
      const ok = await withTx(async (db) =>
        (await db.query(`select 1 from profiles where id = $1 and role_id is not null and status = 'active'`, [payload.sub])).rowCount > 0);
      if (!ok) return next(new Error('forbidden'));
      socket.data = { userId: payload.sub };
      next();
    } catch {
      next(new Error('unauthorized'));
    }
  });

  io.on('connection', (socket) => {
    socket.join([MILL_ROOM, `user:${socket.data.userId}`]);
    socket.on('order:watch', (orderId) => { if (typeof orderId === 'string') socket.join(`order:${orderId}`); });
    socket.on('order:unwatch', (orderId) => socket.leave(`order:${orderId}`));
  });
  return io;
}

// socket events carry NO confidential fields; clients refetch through the API
export const emitTo = (room, event, data) => io?.to(room).emit(event, data);
export const emitToMill = (event, data) => emitTo(MILL_ROOM, event, data);
