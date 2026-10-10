// Deadline risk: every 30 minutes re-estimate completion and risk for orders still in progress.
// The estimate itself belongs to the status engine (recomputeOrderStatus); this job only decides who gets recomputed.

import { withTx } from '../db/tx.js';
import { recomputeOrderStatus } from '../events/listeners/statusEngine.js';

const IN_PROGRESS = ['confirmed', 'waiting_material', 'material_ready', 'in_production', 'in_qc', 'ready_to_ship', 'partially_dispatched'];

async function run() {
  const orderIds = await withTx(async (db) =>
    (await db.query(`select id from orders where status = any($1)`, [IN_PROGRESS])).rows.map((r) => r.id));
  // recomputeOrderStatus opens its own transaction, so it runs after the scan above has finished
  for (const orderId of orderIds) await recomputeOrderStatus(orderId);
  return orderIds.length;
}

export const deadlineRisk = { name: 'deadlineRisk', schedule: '*/30 * * * *', run };
