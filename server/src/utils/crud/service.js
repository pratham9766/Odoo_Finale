// CRUD service factory for master tables (machines, workers, stages, shifts, ...).
//
//   export const machines = createCrud({
//     table: 'machines', label: 'Machine',
//     columns: ['code', 'stage_id', ...],                       // the ONLY columns a request may write
//     select: 't.*, s.name as stage', joins: 'join stages s on s.id = t.stage_id',
//     references: { stage_id: { table: 'stages', label: 'Stage' } },
//   });
//
// Every query runs inside one transaction, audits every write, and turns
// unique / foreign-key violations into messages a form can show. The main table is always aliased `t`.
// Domain rules go in `check`; columns the server sets itself (tokens, hashes) go in create()/update()'s
// `extra` argument so they never pass through the request whitelist.

import { withTx } from '../../db/tx.js';
import { audit } from '../audit.js';
import { AppError } from '../errors.js';
import { Filter, insertClause, pick, setClause } from './sql.js';

const notFound = (label) => new AppError(404, 'NOT_FOUND', `${label} not found`);

/** 422 for one field, shaped like zod's flattened errors so the frontend shows it inline. */
export const invalid = (field, message) =>
  new AppError(422, 'VALIDATION_FAILED', message, { formErrors: [], fieldErrors: { [field]: [message] } });

/** Uploaded files get server-made paths; a hand-written path (or one climbing folders) must never be stored. */
export function assertUploadPath(path, field) {
  if (path && (path.includes('..') || path.startsWith('/'))) throw invalid(field, 'File must be uploaded through the app first');
}

/** A friendly 404 (instead of a raw foreign-key error) when an id points at a row that does not exist. */
export async function assertExists(db, table, id, label) {
  const { rowCount } = await db.query(`select 1 from ${table} where id = $1`, [id]);
  if (!rowCount) throw notFound(label);
}

async function guarded(promise, { duplicate, inUse }) {
  try {
    return await promise;
  } catch (err) {
    if (err.code === '23505') throw new AppError(409, 'DUPLICATE', duplicate());
    if (err.code === '23503') throw new AppError(409, 'REFERENCE_ERROR', inUse);
    throw err;
  }
}

/**
 * @param {object} cfg
 * @param {string} cfg.table
 * @param {string} cfg.label                       singular, for messages ("Machine not found")
 * @param {string[]} cfg.columns                   writable columns
 * @param {string} [cfg.select='t.*']              columns to return; leave out secrets (token_hash)
 * @param {string} [cfg.joins='']                  JOIN clauses that add display columns
 * @param {string} [cfg.orderBy='t.id']
 * @param {Object<string,{table:string,label:string}>} [cfg.references]  FK columns, verified on write
 * @param {(filter: Filter, ctx: object) => void} [cfg.scope]            read restrictions from ctx.scope
 * @param {(filter: Filter, query: object) => void} [cfg.filters]        list filters from the query string
 * @param {(db, ctx, input: object, before: object|null) => Promise<void>} [cfg.check]  business rules; before is null on create
 * @param {(ctx: object, row: object) => object} [cfg.present]           per-caller response shaping (hide fields)
 * @param {(input: object) => string} [cfg.duplicate]                    message for a unique violation
 * @param {string} [cfg.inUse]                                           message when a delete is blocked by references
 */
export function createCrud({
  table, label, columns,
  select = 't.*', joins = '', orderBy = 't.id',
  references = {}, scope, filters, check,
  present = (_ctx, row) => row,
  duplicate = () => `${label} already exists`,
  inUse = `${label} is still in use and cannot be deleted`,
}) {
  const base = `select ${select} from ${table} t ${joins}`;

  const filterFor = (ctx, query = {}) => {
    const f = new Filter();
    scope?.(f, ctx);
    filters?.(f, query);
    return f;
  };

  async function readOne(db, ctx, id, { lock = false } = {}) {
    const f = filterFor(ctx).eq('t.id', id);
    const { rows } = await db.query(`${base} where ${f.sql}${lock ? ' for update of t' : ''}`, f.params);
    return rows[0];
  }

  async function verify(db, ctx, input, before) {
    for (const [column, ref] of Object.entries(references)) {
      if (input[column] != null) await assertExists(db, ref.table, input[column], ref.label);
    }
    await check?.(db, ctx, input, before);
  }

  return {
    /** → { rows, total }. Pass `limit` (and `page`) to paginate; everything else is a filter query. */
    list: (ctx, { page = 1, limit, ...query } = {}) => withTx(async (db) => {
      const f = filterFor(ctx, query);
      const paged = limit ? ` limit $${f.params.length + 1} offset $${f.params.length + 2}` : '';
      const params = limit ? [...f.params, limit, (page - 1) * limit] : f.params;
      const { rows } = await db.query(`${base} where ${f.sql} order by ${orderBy}${paged}`, params);
      const total = limit
        ? (await db.query(`select count(*)::int as n from ${table} t ${joins} where ${f.sql}`, f.params)).rows[0].n
        : rows.length;
      return { rows: rows.map((r) => present(ctx, r)), total };
    }),

    get: (ctx, id) => withTx(async (db) => {
      const row = await readOne(db, ctx, id);
      if (!row) throw notFound(label);
      return present(ctx, row);
    }),

    create: (ctx, input, extra = {}) => withTx(async (db) => {
      await verify(db, ctx, input, null);
      const ins = insertClause({ ...pick(input, columns), ...extra });
      const { rows: [{ id }] } = await guarded(
        db.query(`insert into ${table} (${ins.columns}) values (${ins.placeholders}) returning id`, ins.values),
        { duplicate: () => duplicate(input), inUse });
      const row = await readOne(db, ctx, id);
      await audit(db, ctx, { action: 'create', table, id, after: row });
      return present(ctx, row);
    }),

    update: (ctx, id, input, extra = {}) => withTx(async (db) => {
      const before = await readOne(db, ctx, id, { lock: true });
      if (!before) throw notFound(label);
      await verify(db, ctx, input, before);
      const set = setClause({ ...pick(input, columns), ...extra }, 2);
      await guarded(
        db.query(`update ${table} set ${set.sql} where id = $1`, [id, ...set.values]),
        { duplicate: () => duplicate({ ...before, ...input }), inUse });
      const after = await readOne(db, ctx, id);
      await audit(db, ctx, { action: 'update', table, id, before, after });
      return present(ctx, after);
    }),

    remove: (ctx, id) => withTx(async (db) => {
      const before = await readOne(db, ctx, id, { lock: true });
      if (!before) throw notFound(label);
      await guarded(db.query(`delete from ${table} where id = $1`, [id]), { duplicate, inUse });
      await audit(db, ctx, { action: 'delete', table, id, before });
      return { id };
    }),
  };
}
