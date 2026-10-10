import { useContext, useEffect, useRef } from 'react';
import { SocketContext } from '@/context/SocketContext';

export function useSocketEvent(event, handler) {
  const { socket } = useContext(SocketContext);
  const ref = useRef(handler);
  ref.current = handler;

  useEffect(() => {
    if (!socket) return undefined;
    const fn = (data) => ref.current(data);
    socket.on(event, fn);
    return () => socket.off(event, fn);
  }, [socket, event]);
}

/** Watch an order room; rejoin after reconnect */
export function useWatchOrder(orderId) {
  const { socket } = useContext(SocketContext);

  useEffect(() => {
    if (!socket || !orderId) return undefined;

    const join = () => socket.emit('order:watch', orderId);
    join();
    socket.on('connect', join); // rejoin after reconnect

    return () => {
      socket.emit('order:unwatch', orderId);
      socket.off('connect', join);
    };
  }, [socket, orderId]);
}
