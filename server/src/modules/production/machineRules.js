// Rules shared by everything that puts work on a machine (work order scheduling, worker assignments).

import { isInScope } from '../../middleware/rbac.js';
import { invalid } from '../../utils/crud/index.js';
import { AppError } from '../../utils/errors.js';

/**
 * The machine must exist in this org, be active, be inside the caller's scope (stage and machine)
 * and, when `stageId` is given, belong to that stage. Returns the machine row; `lock` holds it for the transaction.
 */
export async function assertUsableMachine(db, ctx, machineId, { stageId, lock = false } = {}) {
  const { rows: [machine] } = await db.query(
    `select id, code, stage_id, active, status, status_since, current_work_order_id from machines where id = $1 and org_id = $2${lock ? ' for update' : ''}`,
    [machineId, ctx.orgId]);
  if (!machine) throw new AppError(404, 'NOT_FOUND', 'Machine not found');
  if (!machine.active) throw new AppError(409, 'INVALID_STATE_TRANSITION', `Machine ${machine.code} is not active`);
  if (!isInScope(ctx, 'machine', machine.id) || !isInScope(ctx, 'stage', machine.stage_id)) {
    throw new AppError(403, 'OUT_OF_SCOPE', `Machine ${machine.code} is outside your assigned area`);
  }
  if (stageId && machine.stage_id !== stageId) throw invalid('machine_id', `Machine ${machine.code} belongs to a different stage`);
  return machine;
}
