import { withTenant } from '../../db/withTenant.js';
import { audit } from '../../utils/audit.js';
import { assertOwned, createCrud, pick, setClause } from '../../utils/crud/index.js';
import { AppError } from '../../utils/errors.js';
import { modulesFor } from './modules.catalog.js';

// ---- org profile -------------------------------------------------------------

const ORG_COLUMNS = `id, name, types, gstin, address, city, state, pincode, phone, email, logo_url,
                     connect_code, status, settings, created_at`;
const ORG_EDITABLE = ['name', 'gstin', 'address', 'city', 'state', 'pincode', 'phone', 'email', 'logo_url'];

const selectOrg = async (db, orgId, lock = '') =>
  (await db.query(`select ${ORG_COLUMNS} from organizations where id = $1 ${lock}`, [orgId])).rows[0];

export function getOrg(ctx) {
  return withTenant(ctx, (db) => selectOrg(db, ctx.orgId));
}

export function updateOrg(ctx, input) {
  return withTenant(ctx, async (db) => {
    const before = await selectOrg(db, ctx.orgId, 'for update');
    const set = setClause(pick(input, ORG_EDITABLE), 2);
    const parts = [set.sql];
    const values = [ctx.orgId, ...set.values];
    if (input.settings) {
      // shallow merge, so keys we don't send (incl. `modules`) survive
      values.push(JSON.stringify(input.settings));
      parts.push(`settings = settings || $${values.length}::jsonb`);
    }
    const { rows: [after] } = await db.query(
      `update organizations set ${parts.filter(Boolean).join(', ')} where id = $1 returning ${ORG_COLUMNS}`, values);
    await audit(db, ctx, { action: 'update', table: 'organizations', id: ctx.orgId, before, after });
    return after;
  });
}

// ---- modules -----------------------------------------------------------------

function moduleList(org) {
  const overrides = org.settings?.modules ?? {};
  return modulesFor(org.types).map(({ key, label }) => ({ key, label, enabled: overrides[key] !== false }));
}

export function getModules(ctx) {
  return withTenant(ctx, async (db) => moduleList(await selectOrg(db, ctx.orgId)));
}

export function updateModules(ctx, { modules }) {
  return withTenant(ctx, async (db) => {
    const before = await selectOrg(db, ctx.orgId, 'for update');
    const applicable = new Set(modulesFor(before.types).map((m) => m.key));
    const wrong = Object.keys(modules).filter((k) => !applicable.has(k));
    if (wrong.length) {
      throw new AppError(422, 'VALIDATION_FAILED', `Not available for this organization type: ${wrong.join(', ')}`);
    }
    const { rows: [after] } = await db.query(
      `update organizations
          set settings = jsonb_set(settings, '{modules}', coalesce(settings->'modules', '{}'::jsonb) || $2::jsonb)
        where id = $1 returning ${ORG_COLUMNS}`,
      [ctx.orgId, JSON.stringify(modules)]);
    await audit(db, ctx, {
      action: 'update_modules', table: 'organizations', id: ctx.orgId,
      before: before.settings.modules ?? {}, after: after.settings.modules,
    });
    return moduleList(after);
  });
}

// ---- per-org settings tables ----------------------------------------------------

/** Stages come back in production order with their loss % (0 when none is set). */
export const stages = createCrud({
  table: 'stages', label: 'Stage', columns: ['name', 'sequence', 'output_kind'],
  select: `t.*, coalesce(l.weight_loss_pct, 0) as weight_loss_pct, coalesce(l.length_shrink_pct, 0) as length_shrink_pct`,
  joins: 'left join stage_losses l on l.stage_id = t.id and l.org_id = t.org_id',
  orderBy: 't.sequence',
  duplicate: (s) => `Another stage already has sequence ${s.sequence}`,
  inUse: 'This stage is used by machines, workers, BOMs or work orders and cannot be deleted',
});

export const shifts = createCrud({
  table: 'shifts', label: 'Shift', columns: ['name', 'start_time', 'end_time', 'grace_min'], orderBy: 't.start_time',
  duplicate: (s) => `A shift named "${s.name}" already exists`,
  inUse: 'This shift is used by workers, attendance or production logs and cannot be deleted',
});

export const defectTypes = createCrud({
  table: 'defect_types', label: 'Defect type', columns: ['code', 'name', 'severity_default'], orderBy: 't.code',
  duplicate: (d) => `Defect code ${d.code} already exists`,
  inUse: 'This defect type is used in QC inspections and cannot be deleted',
});

export const warehouses = createCrud({
  table: 'warehouses', label: 'Warehouse', columns: ['name', 'kind'], orderBy: 't.kind, t.name',
  inUse: 'This warehouse holds stock lots and cannot be deleted',
});

/** The org's shifts as plain rows, for shift maths inside a running transaction (see utils/shifts.js). */
export async function loadShifts(db, orgId) {
  const { rows } = await db.query(
    `select id, name, start_time, end_time, grace_min from shifts where org_id = $1 order by start_time, name`, [orgId]);
  return rows;
}

/** Set the production order: `ids` must list every stage of the org exactly once, first stage first. */
export async function reorderStages(ctx, { ids }) {
  await withTenant(ctx, async (db) => {
    const { rows } = await db.query(`select id, sequence from stages where org_id = $1 for update`, [ctx.orgId]);
    const existing = new Set(rows.map((r) => r.id));
    if (ids.length !== existing.size || !ids.every((id) => existing.has(id))) {
      throw new AppError(422, 'VALIDATION_FAILED', 'Send every stage of this organization exactly once');
    }
    // unique (org_id, sequence) is checked row by row, so park everything on negatives first
    await db.query(`update stages set sequence = -sequence where org_id = $1`, [ctx.orgId]);
    await db.query(
      `update stages s set sequence = v.ord
         from unnest($2::uuid[]) with ordinality as v(id, ord)
        where s.id = v.id and s.org_id = $1`, [ctx.orgId, ids]);
    // wrapped in objects: pg sends a bare JS array as a Postgres array literal, which jsonb rejects
    await audit(db, ctx, {
      action: 'reorder', table: 'stages', id: null,
      before: { order: rows.map((r) => ({ id: r.id, sequence: r.sequence })) },
      after: { order: ids.map((id, i) => ({ id, sequence: i + 1 })) },
    });
  });
  return (await stages.list(ctx)).rows;
}

// ---- stage losses (keyed by stage, so not a plain CRUD resource) ------------------

export function listStageLosses(ctx) {
  return withTenant(ctx, async (db) => (await db.query(
    `select l.stage_id, s.name as stage, s.sequence, l.weight_loss_pct, l.length_shrink_pct
       from stage_losses l join stages s on s.id = l.stage_id
      where l.org_id = $1 order by s.sequence`, [ctx.orgId])).rows);
}

export function upsertStageLoss(ctx, stageId, input) {
  return withTenant(ctx, async (db) => {
    await assertOwned(db, ctx, 'stages', stageId, 'Stage');
    const { rows: [before] } = await db.query(
      `select * from stage_losses where org_id = $1 and stage_id = $2 for update`, [ctx.orgId, stageId]);
    const { rows: [after] } = await db.query(
      `insert into stage_losses (org_id, stage_id, weight_loss_pct, length_shrink_pct) values ($1, $2, $3, $4)
       on conflict (org_id, stage_id) do update
         set weight_loss_pct = excluded.weight_loss_pct, length_shrink_pct = excluded.length_shrink_pct
       returning *`,
      [ctx.orgId, stageId, input.weight_loss_pct, input.length_shrink_pct]);
    await audit(db, ctx, { action: before ? 'update' : 'create', table: 'stage_losses', id: stageId, before: before ?? null, after });
    return after;
  });
}

export function removeStageLoss(ctx, stageId) {
  return withTenant(ctx, async (db) => {
    const { rows: [before] } = await db.query(
      `delete from stage_losses where org_id = $1 and stage_id = $2 returning *`, [ctx.orgId, stageId]);
    if (!before) throw new AppError(404, 'NOT_FOUND', 'Stage loss not found');
    await audit(db, ctx, { action: 'delete', table: 'stage_losses', id: stageId, before });
    return { stage_id: stageId };
  });
}
