// Quality's reactions to other modules' events (backend plan §11.9): a finished rework work order sends its rolls back to QC.

import { withTx } from '../../db/tx.js';
import { publishQcQueue } from '../../modules/quality/queue.service.js';
import { on } from '../bus.js';

/** workorder.finished: rolls waiting on this rework work order go back to pending_qc. */
export async function onWorkOrderFinished({ workOrderId }) {
  const sent = await withTx(async (db) => {
    const { rows } = await db.query(
      `update rolls r set status = 'pending_qc'
        where r.status = 'rework'
          and exists (select 1 from roll_history h where h.roll_id = r.id and h.event = 'rework_started' and h.work_order_id = $1)
       returning r.id`, [workOrderId]);
    for (const { id } of rows) {
      await db.query(`insert into roll_history (roll_id, work_order_id, event) values ($1, $2, 'reworked')`, [id, workOrderId]);
    }
    return rows.length;
  });
  if (sent) await publishQcQueue();
}

/** Called once by events/listeners/index.js at boot. */
export function registerQualityReactions() {
  on('workorder.finished', onWorkOrderFinished);
}
