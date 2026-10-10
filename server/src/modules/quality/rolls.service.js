// Rolls: creation from the final-stage work order, lookup by roll number, the QR label (backend plan §11.8).

import { withTenant } from '../../db/withTenant.js';
import { bus } from '../../events/bus.js';
import { createCrud, invalid } from '../../utils/crud/index.js';
import { AppError } from '../../utils/errors.js';
import * as pdf from '../../utils/pdf.js';
import { randomToken } from '../../utils/tokens.js';
import { getOrg } from '../orgs/orgs.service.js';
import { lockWorkOrder } from '../production/workOrderSupport.js';
import { recordGenealogy } from './genealogy.js';
import { publishQcQueue } from './queue.service.js';

const crud = createCrud({
  table: 'rolls', label: 'Roll', columns: [],
  select: `t.*, i.name as item, i.colour, o.order_no, w.wo_no, m.code as machine_code`,
  joins: `join items i on i.id = t.item_id
          join orders o on o.id = t.order_id
          join work_orders w on w.id = t.work_order_id
          left join machines m on m.id = w.machine_id`,
  orderBy: 't.created_at, t.roll_no',
  filters: (f, q) => f.eq('t.status', q.status).eq('t.order_id', q.order_id).eq('t.roll_no', q.roll_no).search(['t.roll_no', 'o.order_no'], q.q),
});
// rolls are created by createRoll and change status through QC and dispatch
export const rolls = { list: crud.list, get: crud.get };

/** R-<order number>-<nnn>: ORD-2026-0017 → R-17-001, R-17-002, … (counted across the org so the number is always free). */
async function nextRollNo(db, ctx, order) {
  const seq = Number(order.order_no.match(/(\d+)$/)?.[1] ?? 0);
  const prefix = `R-${seq}-`;
  const { rows: [{ n }] } = await db.query(
    `select coalesce(max(substring(roll_no from '[0-9]+$')::int), 0) + 1 as n from rolls where org_id = $1 and roll_no like $2`,
    [ctx.orgId, `${prefix}%`]);
  return `${prefix}${String(n).padStart(3, '0')}`;
}

/** Create a roll from the final-stage work order, with its genealogy. Status starts at pending_qc. */
export async function createRoll(ctx, { work_order_id, length_m, weight_kg, dye_batch }, { at = new Date() } = {}) {
  const roll = await withTenant(ctx, async (db) => {
    const wo = await lockWorkOrder(db, ctx, work_order_id);
    if (!['running', 'paused', 'done'].includes(wo.status)) {
      throw new AppError(409, 'INVALID_STATE_TRANSITION', `Work order ${wo.wo_no} is ${wo.status}; start it before creating rolls`);
    }
    const { rows: [stage] } = await db.query(
      `select s.sequence, (select max(sequence) from stages where org_id = $1) as last from stages s where s.id = $2`, [ctx.orgId, wo.stage_id]);
    if (stage.sequence !== stage.last) {
      throw invalid('work_order_id', `Rolls are made at the last stage only; ${wo.wo_no} is an earlier stage`);
    }

    const { rows: [order] } = await db.query(`select id, order_no from orders where id = $1 for update`, [wo.order_id]);
    const { rows: [row] } = await db.query(
      `insert into rolls (org_id, roll_no, qr_token, order_id, order_line_id, item_id, work_order_id, length_m, weight_kg, dye_batch, created_at, created_by)
       values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12) returning *`,
      [ctx.orgId, await nextRollNo(db, ctx, order), randomToken(12), wo.order_id, wo.order_line_id, wo.output_item_id, wo.id,
       length_m, weight_kg ?? null, dye_batch ?? null, at, ctx.userId]);
    await recordGenealogy(db, ctx, row, wo, at);
    return row;
  });
  bus.emit('roll.created', { orgId: ctx.orgId, rollId: roll.id });
  await publishQcQueue(ctx.orgId);
  return rolls.get(ctx, roll.id);
}

/** A roll by its number (what the label and the trace page carry). */
export async function rollByNo(ctx, rollNo) {
  const { rows: [roll] } = await rolls.list(ctx, { roll_no: rollNo });
  if (!roll) throw new AppError(404, 'NOT_FOUND', `Roll ${rollNo} not found`);
  return roll;
}

/** The 60 × 40 mm QR label. */
export async function labelPdf(ctx, rollNo) {
  const [roll, org] = await Promise.all([rollByNo(ctx, rollNo), getOrg(ctx)]);
  const buffer = await pdf.rollLabel({
    roll, item: { name: roll.item, colour: roll.colour }, order: { order_no: roll.order_no }, org,
  });
  return { buffer, filename: `label-${roll.roll_no}.pdf` };
}
