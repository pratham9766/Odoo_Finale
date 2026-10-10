// Shared runner for every cron job (backend plan §14): do something once for each active org, as a system user of that org.
// One org failing must not stop the others, so errors are logged per org and the run carries on.

import { pool } from '../db/pool.js';
import { withSystem } from '../db/withTenant.js';

/**
 * @param {string} jobName   for log lines
 * @param {(db, orgId: string) => Promise<any>} work   runs inside withSystem(orgId)
 * @returns {Promise<{ ok: Array<{ orgId, result }>, failed: Array<{ orgId, error }> }>}
 */
export async function forEachActiveOrg(jobName, work) {
  // list_active_orgs() is a security-definer function (014_functions.sql), the only way to list orgs without a tenant
  const { rows } = await pool.query('select list_active_orgs() as id');
  const ok = [], failed = [];
  for (const { id: orgId } of rows) {
    try {
      ok.push({ orgId, result: await withSystem(orgId, (db) => work(db, orgId)) });
    } catch (error) {
      console.error(`[job ${jobName}] org ${orgId} failed:`, error);
      failed.push({ orgId, error });
    }
  }
  return { ok, failed };
}
