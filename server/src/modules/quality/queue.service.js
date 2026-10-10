// The QC queue's numbers: what the station screen, the quality page and the socket push all show.

import { publishToOrg } from '../../utils/publish.js';

/** Rolls per status for the org: { pending_qc, passed, rework, rejected, ... }. */
export async function statusCounts(db, orgId) {
  const { rows } = await db.query(`select status, count(*)::int as n from rolls where org_id = $1 group by status`, [orgId]);
  return Object.fromEntries(rows.map((r) => [r.status, r.n]));
}

/** qc.queue_changed: push the fresh counts to the org room (after commit). */
export function publishQcQueue(orgId) {
  return publishToOrg(orgId, 'qc.queue_changed', (db) => statusCounts(db, orgId));
}
