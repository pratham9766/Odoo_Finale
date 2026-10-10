// QC inspections and the QC Head's override (backend plan §11.9). Both end in applyResult, so a result means the same either way.

import { withTenant } from '../../db/withTenant.js';
import { bus } from '../../events/bus.js';
import { audit } from '../../utils/audit.js';
import { assertOrgPath, invalid } from '../../utils/crud/index.js';
import { AppError } from '../../utils/errors.js';
import { fabricMetresToKg } from '../../utils/textile.js';
import { produce } from '../inventory/inventory.service.js';
import { publishQcQueue } from './queue.service.js';
import { cancelOpenRework, startRework } from './rework.js';
import { rolls } from './rolls.service.js';

const STATUS_FOR = { pass: 'passed', rework: 'rework', reject: 'rejected' };

/** Defects must be the org's own defect types; a rework or reject needs at least one so the cause is on record. */
async function checkDefects(db, ctx, result, defects) {
  if (result !== 'pass' && !defects.length) throw invalid('defects', `A ${result} result needs at least one defect`);
  const ids = [...new Set(defects.map((d) => d.defect_type_id))];
  const { rowCount } = await db.query(`select 1 from defect_types where org_id = $1 and id = any($2::uuid[])`, [ctx.orgId, ids]);
  if (rowCount !== ids.length) throw new AppError(404, 'NOT_FOUND', 'Defect type not found');
}

/** A rejected roll leaves finished stock as scrap (the weight, or its length converted through width × GSM). */
async function scrapRoll(db, ctx, roll) {
  const { rows: [scrap] } = await db.query(
    `select id from items where org_id = $1 and kind = 'scrap' order by (name ilike '%fabric%') desc, name limit 1`, [ctx.orgId]);
  const { rows: [item] } = await db.query(`select width_m, gsm from items where id = $1`, [roll.item_id]);
  const kg = roll.weight_kg ?? (item.width_m && item.gsm ? fabricMetresToKg(roll.length_m, item.width_m, item.gsm) : null);
  if (scrap && kg) await produce(db, ctx, { itemId: scrap.id, qty: kg, lotNo: roll.roll_no, refType: 'roll', refId: roll.id });
}

/** Record the inspection and move the roll: pass → passed, rework → rework (+ rework work order), reject → rejected (+ scrap). */
async function applyResult(db, ctx, roll, { result, defects, remarks, photo_path, is_override = false, override_reason = null }, at) {
  const { rows: [inspection] } = await db.query(
    `insert into qc_inspections (org_id, roll_id, inspector_id, result, is_override, override_reason, remarks, photo_path, inspected_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9) returning id`,
    [ctx.orgId, roll.id, ctx.membershipId, result, is_override, override_reason, remarks ?? null, photo_path ?? null, at]);
  if (defects.length) {
    await db.query(
      `insert into qc_defects (org_id, inspection_id, defect_type_id, count, severity)
       select $1, $2, d.type, d.count, d.severity from unnest($3::uuid[], $4::int[], $5::int[]) as d(type, count, severity)`,
      [ctx.orgId, inspection.id, defects.map((d) => d.defect_type_id), defects.map((d) => d.count), defects.map((d) => d.severity ?? 1)]);
  }
  await db.query(`update rolls set status = $2 where id = $1`, [roll.id, STATUS_FOR[result]]);
  await db.query(
    `insert into roll_history (org_id, roll_id, event, data, at) values ($1, $2, 'inspected', $3, $4)`,
    [ctx.orgId, roll.id, JSON.stringify({ result, inspection_id: inspection.id, override: is_override }), at]);
  if (result === 'rework') await startRework(db, ctx, roll, defects.map((d) => ({ ...d, severity: d.severity ?? 1 })), at);
  if (result === 'reject') await scrapRoll(db, ctx, roll);
  return inspection.id;
}

async function announce(ctx, rollId, result) {
  bus.emit('qc.done', { orgId: ctx.orgId, rollId, result });
  await publishQcQueue(ctx.orgId);
}

async function lockRoll(db, ctx, { roll_id, qr_token }) {
  const { rows: [roll] } = await db.query(
    `select * from rolls where org_id = $1 and (id = $2 or qr_token = $3) for update`, [ctx.orgId, roll_id ?? null, qr_token ?? null]);
  if (!roll) throw new AppError(404, 'NOT_FOUND', 'Roll not found');
  return roll;
}

/** Inspect a roll that is waiting in the QC queue. */
export async function inspectRoll(ctx, input, { at = new Date() } = {}) {
  const { roll, inspectionId } = await withTenant(ctx, async (db) => {
    const roll = await lockRoll(db, ctx, input);
    if (roll.status !== 'pending_qc') {
      throw new AppError(409, 'INVALID_STATE_TRANSITION', `Roll ${roll.roll_no} is ${roll.status}; only rolls waiting for QC can be inspected`);
    }
    assertOrgPath(ctx, input.photo_path, 'photo_path');
    await checkDefects(db, ctx, input.result, input.defects);
    return { roll, inspectionId: await applyResult(db, ctx, roll, input, at) };
  });
  await announce(ctx, roll.id, input.result);
  return { inspection_id: inspectionId, roll: await rolls.get(ctx, roll.id) };
}

/** The QC Head changes a result. Needs a reason; audited; cancels a rework that has not started. */
export async function overrideResult(ctx, inspectionId, input, { at = new Date() } = {}) {
  const { roll, newInspectionId } = await withTenant(ctx, async (db) => {
    const { rows: [original] } = await db.query(`select roll_id from qc_inspections where id = $1 and org_id = $2`, [inspectionId, ctx.orgId]);
    if (!original) throw new AppError(404, 'NOT_FOUND', 'Inspection not found');
    const roll = await lockRoll(db, ctx, { roll_id: original.roll_id });
    if (!['pending_qc', 'passed', 'rework', 'rejected'].includes(roll.status)) {
      throw new AppError(409, 'INVALID_STATE_TRANSITION', `Roll ${roll.roll_no} is ${roll.status} and can no longer be overridden`);
    }
    if (!(await cancelOpenRework(db, roll.id))) {
      throw new AppError(409, 'INVALID_STATE_TRANSITION', `Roll ${roll.roll_no} is being reworked right now; finish or pause that work order first`);
    }
    assertOrgPath(ctx, input.photo_path, 'photo_path');
    await checkDefects(db, ctx, input.result, input.defects);
    const newInspectionId = await applyResult(db, ctx, roll, { ...input, is_override: true, override_reason: input.reason }, at);
    await audit(db, ctx, {
      action: 'qc_override', table: 'rolls', id: roll.id,
      before: { status: roll.status }, after: { status: STATUS_FOR[input.result], result: input.result, reason: input.reason },
    });
    return { roll, newInspectionId };
  });
  await announce(ctx, roll.id, input.result);
  return { inspection_id: newInspectionId, roll: await rolls.get(ctx, roll.id) };
}
