// Roll genealogy (backend plan §11.8): when a roll is created, copy where it came from into roll_history and roll_yarn_lots,
// so tracing a rejected roll never has to reconstruct history from live tables.

import { insertClause } from '../../utils/crud/index.js';

// roll_history.event per stage output; 'woven' is what v_defects_by_cause reads the weaving machine from
const STAGE_EVENT = { yarn: 'spun', grey_fabric: 'woven', finished_fabric: 'dyed' };

/** One row per work order that fed this roll (upstream stages that are done, plus the final one), then 'created'. */
export async function recordGenealogy(db, ctx, roll, finalWo, at) {
  const { rows: made } = await db.query(
    `select w.id, w.stage_id, w.machine_id, w.wo_no, w.started_at, w.finished_at, s.output_kind,
            (select l.shift_id from production_logs l where l.work_order_id = w.id order by l.logged_at desc limit 1) as shift_id,
            (select l.worker_id from production_logs l where l.work_order_id = w.id order by l.logged_at desc limit 1) as worker_id
       from work_orders w join stages s on s.id = w.stage_id
      where w.order_line_id = $1 and not w.is_rework and (w.status = 'done' or w.id = $2)
      order by s.sequence`, [finalWo.order_line_id, finalWo.id]);

  const steps = made.map((w) => ({
    stage_id: w.stage_id, machine_id: w.machine_id, shift_id: w.shift_id, worker_id: w.worker_id, work_order_id: w.id,
    event: STAGE_EVENT[w.output_kind] ?? 'processed', data: JSON.stringify({ wo_no: w.wo_no }), at: w.finished_at ?? w.started_at ?? at,
  }));
  steps.push({ ...steps.at(-1), event: 'created', data: '{}', at });          // the final-stage work order made the roll itself

  for (const step of steps) {
    const row = insertClause({ org_id: ctx.orgId, roll_id: roll.id, ...step });
    await db.query(`insert into roll_history (${row.columns}) values (${row.placeholders})`, row.values);
  }

  // raw material lots (yarn, fibre) issued to any work order of this order line: the suppliers a rejected roll points back to
  await db.query(
    `insert into roll_yarn_lots (org_id, roll_id, lot_id)
     select distinct $1::uuid, $2::uuid, mi.lot_id
       from material_issues mi join items i on i.id = mi.item_id join work_orders w on w.id = mi.work_order_id
      where w.order_line_id = $3 and i.kind in ('yarn', 'fibre')
     on conflict do nothing`, [ctx.orgId, roll.id, finalWo.order_line_id]);
}
