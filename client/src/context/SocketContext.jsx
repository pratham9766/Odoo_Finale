import { createContext, useEffect, useState } from 'react';
import { connectSocket } from '@/lib/socket';
import { useAuth } from '@/hooks/useAuth';

export const SocketContext = createContext(null);

export function SocketProvider({ children }) {
  const { session } = useAuth();
  const [socket, setSocket] = useState(null);
  const [status, setStatus] = useState('disconnected'); // connected | disconnected | reconnecting

  useEffect(() => {
    if (!session?.access_token) {
      if (socket) {
        socket.disconnect();
        setSocket(null);
      }
      return;
    }

    const s = connectSocket({ token: session.access_token });
    setSocket(s);

    s.on('connect', () => setStatus('connected'));
    s.on('disconnect', () => setStatus('disconnected'));
    s.on('reconnecting', () => setStatus('reconnecting'));
    s.on('reconnect', () => {
      setStatus('connected');
    });

    return () => {
      s.disconnect();
      setSocket(null);
      setStatus('disconnected');
    };
  }, [session?.access_token]);

  return (
    <SocketContext.Provider value={{ socket, status }}>
      {children}
    </SocketContext.Provider>
  );
}
