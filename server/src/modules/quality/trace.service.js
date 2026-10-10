// GET /rolls/:rollNo/trace: where a roll came from and what happened to it (backend plan §10.8; overall plan §11.8).

import { withTenant } from '../../db/withTenant.js';
import { rollByNo } from './rolls.service.js';

const q = (db, sql, params) => db.query(sql, params).then((r) => r.rows);

/** The roll's own history, oldest first, with names instead of ids. */
const timeline = (db, rollId) => q(db,
  `select h.event, h.at, h.data, s.name as stage, m.code as machine, sh.name as shift, w.name as worker, wo.wo_no
     from roll_history h
     left join stages s on s.id = h.stage_id left join machines m on m.id = h.machine_id
     left join shifts sh on sh.id = h.shift_id left join workers w on w.id = h.worker_id
     left join work_orders wo on wo.id = h.work_order_id
    where h.roll_id = $1 order by h.at, h.id`, [rollId]);

/** Raw material lots with the supplier (a connected org or an offline contact). */
const lots = (db, rollId) => q(db,
  `select l.lot_no, i.name as item, i.kind, l.dye_batch, coalesce(o.name, c.name) as supplier
     from roll_yarn_lots ry join stock_lots l on l.id = ry.lot_id join items i on i.id = l.item_id
     left join organizations o on o.id = l.supplier_org_id left join contacts c on c.id = l.supplier_contact_id
    where ry.roll_id = $1 order by i.name, l.lot_no`, [rollId]);

const inspections = (db, rollId) => q(db,
  `select qi.id, qi.result, qi.is_override, qi.override_reason, qi.remarks, qi.photo_path, qi.inspected_at, p.full_name as inspector,
          coalesce((select json_agg(json_build_object('defect', dt.name, 'count', d.count, 'severity', d.severity) order by d.count desc)
                      from qc_defects d join defect_types dt on dt.id = d.defect_type_id where d.inspection_id = qi.id), '[]') as defects
     from qc_inspections qi left join memberships mem on mem.id = qi.inspector_id left join profiles p on p.id = mem.user_id
    where qi.roll_id = $1 order by qi.inspected_at`, [rollId]);

const dispatch = (db, rollId) => q(db,
  `select d.dispatch_no, d.status, d.confirmed_at, d.delivered_at, d.vehicle_no, coalesce(o.name, c.name) as to_party
     from dispatch_rolls dr join dispatches d on d.id = dr.dispatch_id
     left join organizations o on o.id = d.to_org_id left join contacts c on c.id = d.to_contact_id
    where dr.roll_id = $1`, [rollId]).then((rows) => rows[0] ?? null);

/** How rolls from the same weaving machine and the same dye batch fared in the last 30 days: the "is it just this roll?" line. */
async function peers(db, roll) {
  const { rows: [m] } = await db.query(
    `select h.machine_id, ma.code from roll_history h join machines ma on ma.id = h.machine_id where h.roll_id = $1 and h.event = 'woven'`, [roll.id]);
  const stats = async (join, where, params) => (await q(db,
    `select count(*)::int as total, count(*) filter (where r.status = 'rejected')::int as rejected
       from rolls r ${join} where r.created_at >= now() - interval '30 days' and ${where}`, params))[0];
  return {
    machine: m ? { code: m.code, ...await stats(`join roll_history h on h.roll_id = r.id and h.event = 'woven'`, 'h.machine_id = $1', [m.machine_id]) } : null,
    dye_batch: roll.dye_batch ? { batch: roll.dye_batch, ...await stats('', 'r.dye_batch = $1', [roll.dye_batch]) } : null,
  };
}

export async function traceRoll(ctx, rollNo) {
  const roll = await rollByNo(ctx, rollNo);
  return withTenant(ctx, async (db) => ({
    roll,
    timeline: await timeline(db, roll.id),
    raw_material_lots: await lots(db, roll.id),
    inspections: await inspections(db, roll.id),
    dispatch: await dispatch(db, roll.id),
    peers: await peers(db, roll),
  }));
}
