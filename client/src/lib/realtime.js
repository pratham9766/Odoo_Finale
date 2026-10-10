import { useEffect, useRef } from 'react';
import { useQueryClient } from '@tanstack/react-query';
import { io } from 'socket.io-client';
import { API_URL } from '@/lib/api';

// Server events (server/src/events/listeners/socketEmitter.js, notify.js, publish.js). They carry ids only, never prices,
// so the client just refetches what is on screen.
const EVENTS = ['order.status_changed', 'machine.updated', 'production.logged', 'qc.queue_changed', 'notification.new'];

/**
 * One socket per logged-in staff member. Any event refreshes the queries currently on screen (bursts are merged),
 * so the machine board, orders and QC queue update within a second instead of waiting for their polling interval.
 */
export function useRealtime(token, userId, enabled) {
  const cache = useQueryClient();
  const tokenRef = useRef(token);
  tokenRef.current = token;   // the handshake reads the latest token, so a reconnect after a token refresh still works

  useEffect(() => {
    if (!enabled) return undefined;
    const socket = io(API_URL, { auth: (cb) => cb({ token: tokenRef.current }), transports: ['websocket', 'polling'] });
    let timer;
    const refresh = () => {
      clearTimeout(timer);
      timer = setTimeout(() => cache.invalidateQueries({ queryKey: [userId], refetchType: 'active' }), 400);
    };
    EVENTS.forEach((e) => socket.on(e, refresh));
    return () => { clearTimeout(timer); socket.disconnect(); };
  }, [enabled, userId, cache]);
}
