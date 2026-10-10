import { io } from 'socket.io-client';

export function connectSocket({ token, orgId }) {
  return io(import.meta.env.VITE_API_URL || 'http://localhost:4000', {
    auth: { token, orgId },
    transports: ['websocket'],
    reconnection: true,
    reconnectionDelay: 1000,
    reconnectionDelayMax: 5000,
    timeout: 10000,
  });
}
