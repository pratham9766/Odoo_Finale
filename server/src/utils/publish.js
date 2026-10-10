// Realtime pushes (backend plan §13). Always called AFTER the transaction committed.

import { withSystem } from '../db/withTenant.js';
import { emitTo } from '../realtime/socket.js';

/**
 * Load what a socket event should carry and send it to everyone in the org's room. `load(db)` runs as the org
 * (confidential fields stay out of socket payloads: clients refetch through the API). A failed push is logged,
 * never thrown: the change it announces is already saved.
 */
export async function publishToOrg(orgId, event, load) {
  try {
    emitTo(`org:${orgId}`, event, await withSystem(orgId, load));
  } catch (err) {
    console.error(`[realtime] ${event} for org ${orgId} failed:`, err);
  }
}
