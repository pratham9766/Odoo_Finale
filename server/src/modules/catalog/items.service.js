import { withTx } from '../../db/tx.js';
import { must } from '../../utils/errors.js';
import { audit } from '../../utils/audit.js';
import { paged, where } from '../../utils/paginate.js';

// std_rate is a cost: hide it unless the user can see prices or raise POs
const canSeeCost = (ctx) => ctx.permissions.has('orders.view_price') || ctx.permissions.has('po.create') || ctx.permissions.has('items.manage');
const strip = (ctx, row) => {
  if (!row || canSeeCost(ctx)) return row;
  const { std_rate: _cost, ...rest } = row;
  return rest;
};

export const listItems = (ctx, q) =>
  withTx(async (db) => {
    const w = where().add('kind = ?', q.kind).add('active = ?', q.active);
    if (q.q) w.raw('(name ilike ? or sku ilike ? or colour ilike ?)', `%${q.q}%`, `%${q.q}%`, `%${q.q}%`);
    const { rows, meta } = await paged(db, `select * from items ${w.sql}`, w.params, q, 'name');
    return { data: rows.map((r) => strip(ctx, r)), meta };
  });

export const getItem = (ctx, id) =>
  withTx(async (db) => strip(ctx, must((await db.query('select * from items where id = $1', [id])).rows[0], 'Item')));

const COLS = ['kind', 'name', 'sku', 'colour', 'composition', 'yarn_count_ne', 'gsm', 'width_m', 'roll_length_m', 'uom',
  'reorder_level', 'std_rate', 'preferred_supplier_contact_id', 'active'];

export const createItem = (ctx, i) =>
  withTx(async (db) => {
    const vals = COLS.map((c) => i[c] ?? null);
    const { rows: [item] } = await db.query(
      `insert into items (created_by, ${COLS.join(',')})
       values ($1, ${COLS.map((_, k) => `$${k + 2}`).join(',')}) returning *`,
      [ctx.userId, ...vals]);
    await audit(db, ctx, { action: 'create', table: 'items', id: item.id, after: { name: item.name, kind: item.kind } });
    return item;
  });

export const updateItem = (ctx, id, i) =>
  withTx(async (db) => {
    const sets = []; const vals = [id];
    for (const c of COLS) {
      if (c in i) { vals.push(i[c] ?? null); sets.push(`${c} = $${vals.length}`); }
    }
    if (!sets.length) return must((await db.query('select * from items where id = $1', [id])).rows[0], 'Item');
    const { rows: [item] } = await db.query(`update items set ${sets.join(', ')} where id = $1 returning *`, vals);
    must(item, 'Item');
    await audit(db, ctx, { action: 'update', table: 'items', id, after: i });
    return item;
  });

// items are referenced by ledgers and orders, so "delete" deactivates
export const deactivateItem = (ctx, id) =>
  withTx(async (db) => {
    const { rows: [item] } = await db.query('update items set active = false where id = $1 returning id, active', [id]);
    must(item, 'Item');
    await audit(db, ctx, { action: 'deactivate', table: 'items', id });
    return item;
  });
