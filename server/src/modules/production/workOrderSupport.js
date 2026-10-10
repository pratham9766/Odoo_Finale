// What every work order action (start, pause, log, finish) needs: the locked row, and the announcement after commit.

import { isInScope } from '../../middleware/rbac.js';
import { bus } from '../../events/bus.js';
import { AppError } from '../../utils/errors.js';
import { publishMachine } from './board.service.js';

/** The work order row locked for the transaction, with the output item's kind. 404 if absent, 403 if outside the caller's scope. */
export async function lockWorkOrder(db, ctx, id) {
  const { rows: [wo] } = await db.query(
    `select w.*, i.kind as output_kind from work_orders w join items i on i.id = w.output_item_id
      where w.id = $1 and w.org_id = $2 for update of w`, [id, ctx.orgId]);
  if (!wo) throw new AppError(404, 'NOT_FOUND', 'Work order not found');
  if (!isInScope(ctx, 'stage', wo.stage_id) || (wo.machine_id && !isInScope(ctx, 'machine', wo.machine_id))) {
    throw new AppError(403, 'OUT_OF_SCOPE', `Work order ${wo.wo_no} is outside your assigned area`);
  }
  return wo;
}

export const notRunning = (wo, action) =>
  new AppError(409, 'INVALID_STATE_TRANSITION', `Work order ${wo.wo_no} is ${wo.status}; it must be running to ${action}`);

/** After commit: the catalog event (backend plan §12) and the machine board push. `extra` joins the event payload. */
export async function announce(ctx, event, wo, extra = {}) {
  bus.emit(event, { orgId: ctx.orgId, workOrderId: wo.id, orderId: wo.order_id, machineId: wo.machine_id, ...extra });
  if (wo.machine_id) await publishMachine(ctx.orgId, wo.machine_id);
}
