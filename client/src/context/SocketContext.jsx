import { createContext, useEffect, useState } from 'react';
import { connectSocket } from '@/lib/socket';
import { useAuth } from '@/hooks/useAuth';
import { useOrg } from '@/hooks/useOrg';

export const SocketContext = createContext(null);

export function SocketProvider({ children }) {
  const { session } = useAuth();
  const { orgId } = useOrg();
  const [socket, setSocket] = useState(null);
  const [status, setStatus] = useState('disconnected'); // connected | disconnected | reconnecting

  useEffect(() => {
    if (!session?.access_token || !orgId) {
      if (socket) { socket.disconnect(); setSocket(null); }
      return;
    }

    const s = connectSocket({ token: session.access_token, orgId });
    setSocket(s);

    s.on('connect', () => setStatus('connected'));
    s.on('disconnect', () => setStatus('disconnected'));
    s.on('reconnecting', () => setStatus('reconnecting'));
    s.on('reconnect', () => {
      setStatus('connected');
      // Rejoin any watched order rooms on reconnect
      // (handled by useWatchOrder via its own effect)
    });

    return () => {
      s.disconnect();
      setSocket(null);
      setStatus('disconnected');
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [session?.access_token, orgId]);

  return (
    <SocketContext.Provider value={{ socket, status }}>
      {children}
    </SocketContext.Provider>
  );
}
