// Realtime pushes. Always called AFTER the transaction committed.

import { withTx } from '../db/tx.js';
import { emitToMill } from '../realtime/socket.js';

/**
 * Load what a socket event should carry and send it to everyone at the mill. Confidential fields stay out of socket
 * payloads: clients refetch through the API. A failed push is logged, never thrown: the change it announces is already saved.
 */
export async function publish(event, load) {
  try {
    emitToMill(event, await withTx(load));
  } catch (err) {
    console.error(`[realtime] ${event} failed:`, err);
  }
}
