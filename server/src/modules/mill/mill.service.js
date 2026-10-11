// The mill's own details and setup: profile, enabled modules, stages with losses, shifts, defect types, warehouses.
import { withTx } from '../../db/tx.js';
import { audit } from '../../utils/audit.js';
import { assertExists, createCrud, pick, setClause } from '../../utils/crud/index.js';
import { AppError } from '../../utils/errors.js';
import { modulesFor } from './modules.catalog.js';

// ---- the mill's profile (invoice header, settings) ---------------------------------

const MILL_COLUMNS = `name, gstin, address, city, state, pincode, phone, email, logo_url, settings, created_at`;
const MILL_EDITABLE = ['name', 'gstin', 'address', 'city', 'state', 'pincode', 'phone', 'email', 'logo_url'];

const selectMill = async (db, lock = '') => (await db.query(`select ${MILL_COLUMNS} from mill ${lock}`)).rows[0];

/** The mill's details inside an open transaction (used for invoice and packing-list headers). */
export const loadMill = (db) => selectMill(db);

export function getMill() {
  return withTx((db) => selectMill(db));
}

export function updateMill(ctx, input) {
  return withTx(async (db) => {
    const before = await selectMill(db, 'for update');
    const set = setClause(pick(input, MILL_EDITABLE), 1);
    const parts = [set.sql];
    const values = [...set.values];
    if (input.settings) {
      // shallow merge, so keys we don't send (incl. `modules`) survive
      values.push(JSON.stringify(input.settings));
      parts.push(`settings = settings || $${values.length}::jsonb`);
    }
    const { rows: [after] } = await db.query(`update mill set ${parts.filter(Boolean).join(', ')} returning ${MILL_COLUMNS}`, values);
    await audit(db, ctx, { action: 'update', table: 'mill', before, after });
    return after;
  });
}

// ---- modules -----------------------------------------------------------------

function moduleList(mill) {
  const overrides = mill.settings?.modules ?? {};
  return modulesFor().map(({ key, label }) => ({ key, label, enabled: overrides[key] !== false }));
}

export function getModules() {
  return withTx(async (db) => moduleList(await selectMill(db)));
}

export function updateModules(ctx, { modules }) {
  return withTx(async (db) => {
    const before = await selectMill(db, 'for update');
    const { rows: [after] } = await db.query(
      `update mill set settings = jsonb_set(settings, '{modules}', coalesce(settings->'modules', '{}'::jsonb) || $1::jsonb)
       returning ${MILL_COLUMNS}`, [JSON.stringify(modules)]);
    await audit(db, ctx, { action: 'update_modules', table: 'mill', before: before.settings.modules ?? {}, after: after.settings.modules });
    return moduleList(after);
  });
}

// ---- floor settings tables --------------------------------------------------------

/** Stages come back in production order with their loss % (0 when none is set). */
export const stages = createCrud({
  table: 'stages', label: 'Stage', columns: ['name', 'sequence', 'output_kind'],
  select: `t.*, coalesce(l.weight_loss_pct, 0) as weight_loss_pct, coalesce(l.length_shrink_pct, 0) as length_shrink_pct`,
  joins: 'left join stage_losses l on l.stage_id = t.id',
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

/** The shifts as plain rows, for shift maths inside a running transaction (see utils/shifts.js). */
export async function loadShifts(db) {
  const { rows } = await db.query(`select id, name, start_time, end_time, grace_min from shifts order by start_time, name`);
  return rows;
}

/** Set the production order: `ids` must list every stage exactly once, first stage first. */
export async function reorderStages(ctx, { ids }) {
  await withTx(async (db) => {
    const { rows } = await db.query(`select id, sequence from stages for update`);
    const existing = new Set(rows.map((r) => r.id));
    if (ids.length !== existing.size || !ids.every((id) => existing.has(id))) {
      throw new AppError(422, 'VALIDATION_FAILED', 'Send every stage exactly once');
    }
    // unique (sequence) is checked row by row, so park everything on negatives first
    await db.query(`update stages set sequence = -sequence`);
    await db.query(
      `update stages s set sequence = v.ord
         from unnest($1::uuid[]) with ordinality as v(id, ord)
        where s.id = v.id`, [ids]);
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

export function listStageLosses() {
  return withTx(async (db) => (await db.query(
    `select l.stage_id, s.name as stage, s.sequence, l.weight_loss_pct, l.length_shrink_pct
       from stage_losses l join stages s on s.id = l.stage_id order by s.sequence`)).rows);
}

export function upsertStageLoss(ctx, stageId, input) {
  return withTx(async (db) => {
    await assertExists(db, 'stages', stageId, 'Stage');
    const { rows: [before] } = await db.query(`select * from stage_losses where stage_id = $1 for update`, [stageId]);
    const { rows: [after] } = await db.query(
      `insert into stage_losses (stage_id, weight_loss_pct, length_shrink_pct) values ($1, $2, $3)
       on conflict (stage_id) do update
         set weight_loss_pct = excluded.weight_loss_pct, length_shrink_pct = excluded.length_shrink_pct
       returning *`,
      [stageId, input.weight_loss_pct, input.length_shrink_pct]);
    await audit(db, ctx, { action: before ? 'update' : 'create', table: 'stage_losses', id: stageId, before: before ?? null, after });
    return after;
  });
}

export function removeStageLoss(ctx, stageId) {
  return withTx(async (db) => {
    const { rows: [before] } = await db.query(`delete from stage_losses where stage_id = $1 returning *`, [stageId]);
    if (!before) throw new AppError(404, 'NOT_FOUND', 'Stage loss not found');
    await audit(db, ctx, { action: 'delete', table: 'stage_losses', id: stageId, before });
    return { stage_id: stageId };
  });
}
