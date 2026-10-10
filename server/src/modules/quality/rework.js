// The rework loop (backend plan §11.9): a "rework" result sends the roll back through the stage its main defect points to.

import { nextNumber } from '../../utils/numbering.js';

// Defects are org-configurable, so this maps the standard defect codes to the kind of output they are made at.
// A weaving defect is fixed at the grey-fabric stage, a dyeing defect at the finished-fabric stage.
const DEFECT_OUTPUT_KIND = { HOLE: 'grey_fabric', UNEVEN: 'grey_fabric', BROKEN_END: 'grey_fabric', COLOUR: 'finished_fabric', STAIN: 'finished_fabric' };

/** The defect with the biggest count × severity (the cause worth fixing). */
export const mainDefect = (defects) => [...defects].sort((a, b) => b.count * b.severity - a.count * a.severity)[0];

/** The org's stage that makes this kind of output (earliest if several); the roll's own stage when nothing matches. */
async function reworkStage(db, ctx, roll, defectCode) {
  const kind = DEFECT_OUTPUT_KIND[defectCode];
  const { rows: [stage] } = await db.query(
    `select id from stages where output_kind = $1 order by sequence limit 1`, [kind ?? null]);
  if (stage) return stage.id;
  return (await db.query(`select stage_id from work_orders where id = $1`, [roll.work_order_id])).rows[0].stage_id;
}

/** Create the rework work order for a roll and note it in the roll's history (the finish listener finds the roll through it). */
export async function startRework(db, ctx, roll, defects, at) {
  const { rows: [defect] } = await db.query(`select id, code, name from defect_types where id = $1`, [mainDefect(defects).defect_type_id]);
  const { rows: [item] } = await db.query(`select uom from items where id = $1`, [roll.item_id]);
  const stageId = await reworkStage(db, ctx, roll, defect.code);

  const { rows: [wo] } = await db.query(
    `insert into work_orders (wo_no, order_id, order_line_id, stage_id, output_item_id, target_qty, uom, is_rework, parent_work_order_id, created_at, created_by)
     values ($1, $2, $3, $4, $5, $6, $7, true, $8, $9, $10) returning id, wo_no`,
    [await nextNumber(db, 'WO'), roll.order_id, roll.order_line_id, stageId, roll.item_id, roll.length_m, item.uom,
     roll.work_order_id, at, ctx.userId]);
  const afterInspection = new Date(at.getTime() + 1);       // history is ordered by time: the rework follows the inspection that caused it
  await db.query(
    `insert into roll_history (roll_id, stage_id, work_order_id, event, data, at) values ($1, $2, $3, 'rework_started', $4, $5)`,
    [roll.id, stageId, wo.id, JSON.stringify({ wo_no: wo.wo_no, defect: defect.name }), afterInspection]);
  return wo;
}

/** Cancel the rework work orders still waiting for a roll (an override says the roll is fine, or scrap). False when one is running. */
export async function cancelOpenRework(db, rollId) {
  const { rows } = await db.query(
    `select w.id, w.status from work_orders w join roll_history h on h.work_order_id = w.id
      where h.roll_id = $1 and h.event = 'rework_started' and w.status not in ('done', 'cancelled') for update of w`, [rollId]);
  if (rows.some((w) => w.status === 'running')) return false;
  if (rows.length) await db.query(`update work_orders set status = 'cancelled' where id = any($1::uuid[])`, [rows.map((w) => w.id)]);
  return true;
}
