// In-process event bus. Modules emit events (order.updated, grn.posted...); listeners react without the modules knowing each other.
import { EventEmitter } from 'node:events';

export const bus = new EventEmitter();
bus.setMaxListeners(50);

// listeners must never crash the request; log and continue
export function on(event, handler) {
  bus.on(event, (payload) => {
    Promise.resolve()
      .then(() => handler(payload))
      .catch((err) => console.error(`[event ${event}]`, err));
  });
}

// services call emit AFTER withTenant resolves (i.e. after commit)
export const emit = (event, payload) => bus.emit(event, payload);
