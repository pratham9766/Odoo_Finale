// Deadline risk (backend plan §14): every 30 minutes re-estimate completion and risk for orders still in progress.
// The estimate itself belongs to the status engine (recomputeOrderStatus); this job only decides who gets recomputed.

import { recomputeOrderStatus } from '../events/listeners/statusEngine.js';
import { forEachActiveOrg } from './forEachActiveOrg.js';

const IN_PROGRESS = ['confirmed', 'waiting_material', 'material_ready', 'in_production', 'in_qc', 'ready_to_ship', 'partially_dispatched'];

async function run() {
  const { ok } = await forEachActiveOrg('deadlineRisk', async (db, orgId) => {
    const { rows } = await db.query(`select id from orders where seller_org_id = $1 and status = any($2)`, [orgId, IN_PROGRESS]);
    return rows.map((r) => r.id);
  });
  // recomputeOrderStatus opens its own transaction, so it runs after the scan above has finished
  let recomputed = 0;
  for (const { orgId, result: orderIds } of ok) {
    for (const orderId of orderIds) {
      await recomputeOrderStatus(orgId, orderId);
      recomputed++;
    }
  }
  return recomputed;
}

export const deadlineRisk = { name: 'deadlineRisk', schedule: '*/30 * * * *', run };
