// Recipes (BOMs): the explosion that turns a quantity of fabric into the yarn, fibre and dye to buy or make, plus BOM CRUD.
import { withTx } from '../../db/tx.js';
import { AppError, must, notFound } from '../../utils/errors.js';
import { audit } from '../../utils/audit.js';
import { paged, where } from '../../utils/paginate.js';
import { round3 } from '../../utils/money.js';
import * as textile from '../../utils/textile.js';

// ---------- explosion (§11.4) ----------

async function getItem(db, id) {
  const { rows: [i] } = await db.query(
    `select id, name, kind, uom, colour, std_rate, preferred_supplier_contact_id from items where id = $1`, [id]);
  return must(i, 'Item');
}

// on hand minus active reservations (from v_stock)
async function availableQty(db, itemId) {
  const { rows } = await db.query('select available from v_stock where item_id = $1', [itemId]);
  return Math.max(0, rows[0]?.available ?? 0);
}

async function getDefaultBom(db, itemId) {
  const { rows: [bom] } = await db.query('select * from boms where output_item_id = $1 and is_default', [itemId]);
  if (!bom) return null;
  const { rows: lines } = await db.query('select * from bom_lines where bom_id = $1 order by share_label nulls last, id', [bom.id]);
  return { ...bom, lines };
}

/**
 * Walk the BOM tree for `qty` of `itemId`. With netStock, available stock is used first at every level
 * and only the shortage is exploded downward. `alloc` tracks stock already claimed by other branches so a
 * component shared by several lines (e.g. one yarn used for both warp and weft) is never netted twice.
 */
export async function explode(db, itemId, qty, opts = {}) {
  const { netStock = true, alloc = new Map(), path = [] } = opts;
  if (path.includes(itemId) || path.length > 8) throw new AppError(422, 'BOM_CYCLE', 'BOM has a loop or is too deep');

  const item = await getItem(db, itemId);
  let fromStock = 0;
  if (netStock) {
    const available = (await availableQty(db, itemId)) - (alloc.get(itemId) ?? 0);
    fromStock = Math.max(0, Math.min(available, qty));
    alloc.set(itemId, (alloc.get(itemId) ?? 0) + fromStock);
  }
  const toMake = round3(qty - fromStock);
  const node = { item, required: round3(qty), from_stock: round3(fromStock), to_make: toMake, action: null, children: [] };
  if (toMake <= 0) return node;

  const bom = await getDefaultBom(db, itemId);
  if (!bom) { node.action = 'buy'; return node; }

  node.action = 'produce';
  node.bom_id = bom.id;
  node.stage_id = bom.stage_id;
  for (const line of bom.lines) {
    const childQty = (toMake * line.qty) / bom.output_qty / (1 - line.wastage_pct / 100);
    const child = await explode(db, line.component_item_id, childQty, { netStock, alloc, path: [...path, itemId] });
    child.share_label = line.share_label;
    child.wastage_pct = line.wastage_pct;
    node.children.push(child);
  }
  return node;
}

// latest lot cost, falling back to the item's standard rate
async function unitCost(db, itemId, fallback) {
  const { rows: [l] } = await db.query(
    `select unit_cost from stock_lots where item_id = $1 and unit_cost > 0 order by received_at desc limit 1`, [itemId]);
  return l?.unit_cost ?? fallback ?? 0;
}

export async function summarize(db, root) {
  const buy = new Map();
  const produce = [];
  const walk = (n) => {
    if (n.action === 'buy') {
      const cur = buy.get(n.item.id) ?? { item: n.item, qty: 0 };
      cur.qty += n.to_make;
      buy.set(n.item.id, cur);
    } else if (n.action === 'produce') {
      produce.push({ item_id: n.item.id, name: n.item.name, stage_id: n.stage_id, to_make: n.to_make, uom: n.item.uom });
    }
    n.children.forEach(walk);
  };
  walk(root);
  let cost = 0;
  const buy_list = [];
  for (const { item, qty } of buy.values()) {
    const rate = await unitCost(db, item.id, item.std_rate);
    const q = round3(qty);
    buy_list.push({ item_id: item.id, name: item.name, uom: item.uom, qty: q, est_rate: rate, est_cost: Math.round(q * rate * 100) / 100,
      preferred_supplier_contact_id: item.preferred_supplier_contact_id });
    cost += q * rate;
  }
  return { buy_list, produce_list: produce, material_cost_estimate: Math.round(cost * 100) / 100 };
}

export const explodeRequest = (ctx, { item_id, qty, net_stock }) =>
  withTx(async (db) => {
    const tree = await explode(db, item_id, qty, { netStock: net_stock });
    const summary = await summarize(db, tree);
    if (!ctx.permissions.has('orders.view_price') && !ctx.permissions.has('po.create')) {
      delete summary.material_cost_estimate;
      for (const b of summary.buy_list) { delete b.est_rate; delete b.est_cost; }
    }
    return { tree, summary };
  });

export function convert(input) {
  const { op, ...a } = input;
  const fn = {
    fabric_m_to_kg: () => ({ kg: textile.fabricMetresToKg(a.m, a.width_m, a.gsm) }),
    fabric_kg_to_m: () => ({ m: textile.fabricKgToMetres(a.kg, a.width_m, a.gsm) }),
    yarn_m_per_kg: () => ({ m_per_kg: textile.yarnMetresPerKg(a.ne) }),
    yarn_kg_to_m: () => ({ m: textile.yarnKgToMetres(a.kg, a.ne) }),
    yarn_m_to_kg: () => ({ kg: textile.yarnMetresToKg(a.m, a.ne) }),
    dye_kg: () => ({ kg: textile.dyeKg(a.fabric_kg, a.shade_pct) }),
    rolls_to_m: () => ({ m: textile.rollsToMetres(a.rolls, a.roll_length_m) }),
    m_to_rolls: () => ({ rolls: textile.metresToRolls(a.m, a.roll_length_m) }),
    warp_weft: () => textile.splitWarpWeft(a.yarn_kg, a.warp_pct),
    gross_up: () => ({ input: round3(textile.grossInput(a.output, a.wastage_pct)) }),
  }[op];
  return fn();
}

// ---------- BOM CRUD ----------

async function loadBom(db, id) {
  const { rows: [bom] } = await db.query(
    `select b.*, i.name as output_name, i.uom as output_uom, s.name as stage_name
       from boms b join items i on i.id = b.output_item_id left join stages s on s.id = b.stage_id where b.id = $1`, [id]);
  must(bom, 'BOM');
  const { rows: lines } = await db.query(
    `select l.id, l.component_item_id, i.name as component_name, i.uom as component_uom, l.qty, l.wastage_pct, l.share_label
       from bom_lines l join items i on i.id = l.component_item_id where l.bom_id = $1 order by l.share_label nulls last, i.name`, [id]);
  return { ...bom, lines };
}

export const listBoms = (ctx, q) =>
  withTx(async (db) => {
    const w = where().add('b.output_item_id = ?', q.item_id);
    const { rows, meta } = await paged(
      db,
      `select b.*, i.name as output_name, i.uom as output_uom,
              (select count(*)::int from bom_lines l where l.bom_id = b.id) as line_count
         from boms b join items i on i.id = b.output_item_id ${w.sql}`,
      w.params, q, 'output_name');
    return { data: rows, meta };
  });

export const getBom = (ctx, id) => withTx((db) => loadBom(db, id));

async function replaceLines(db, ctx, bomId, lines) {
  await db.query('delete from bom_lines where bom_id = $1', [bomId]);
  for (const l of lines) {
    await db.query(
      `insert into bom_lines (bom_id, component_item_id, qty, wastage_pct, share_label) values ($1,$2,$3,$4,$5)`,
      [bomId, l.component_item_id, l.qty, l.wastage_pct ?? 0, l.share_label ?? null]);
  }
}

// a BOM can never contain its own output; deeper loops are caught by exploding the saved tree
async function assertNoCycle(db, outputItemId, lines) {
  if (lines.some((l) => l.component_item_id === outputItemId)) throw new AppError(422, 'BOM_CYCLE', 'A BOM cannot use its own output as a component');
  await explode(db, outputItemId, 1, { netStock: false });
}

export const createBom = (ctx, i) =>
  withTx(async (db) => {
    must((await db.query('select 1 from items where id = $1', [i.output_item_id])).rows[0], 'Output item');
    if (i.is_default) await db.query('update boms set is_default = false where output_item_id = $1', [i.output_item_id]);
    const { rows: [{ v }] } = await db.query('select coalesce(max(version),0)+1 as v from boms where output_item_id = $1', [i.output_item_id]);
    const { rows: [bom] } = await db.query(
      `insert into boms (output_item_id, output_qty, stage_id, version, is_default, notes, created_by)
       values ($1,$2,$3,$4,$5,$6,$7) returning id`,
      [i.output_item_id, i.output_qty, i.stage_id ?? null, v, i.is_default, i.notes ?? null, ctx.userId]);
    await replaceLines(db, ctx, bom.id, i.lines);
    if (i.is_default) await assertNoCycle(db, i.output_item_id, i.lines);
    await audit(db, ctx, { action: 'create', table: 'boms', id: bom.id, after: { output_item_id: i.output_item_id, lines: i.lines.length } });
    return loadBom(db, bom.id);
  });

export const updateBom = (ctx, id, i) =>
  withTx(async (db) => {
    const { rows: [cur] } = await db.query('select * from boms where id = $1 for update', [id]);
    must(cur, 'BOM');
    if (i.is_default) await db.query('update boms set is_default = false where output_item_id = $1 and id <> $2', [cur.output_item_id, id]);
    await db.query(
      `update boms set output_qty = coalesce($2, output_qty), stage_id = case when $3::boolean then $4 else stage_id end,
              is_default = coalesce($5, is_default), notes = coalesce($6, notes) where id = $1`,
      [id, i.output_qty ?? null, 'stage_id' in i, i.stage_id ?? null, i.is_default ?? null, i.notes ?? null]);
    if (i.lines) await replaceLines(db, ctx, id, i.lines);
    const bom = await loadBom(db, id);
    if (bom.is_default) await assertNoCycle(db, bom.output_item_id, bom.lines);
    await audit(db, ctx, { action: 'update', table: 'boms', id, before: { output_qty: cur.output_qty } });
    return bom;
  });

export const deleteBom = (ctx, id) =>
  withTx(async (db) => {
    const { rowCount } = await db.query('delete from boms where id = $1', [id]);
    if (!rowCount) throw notFound('BOM');
    await audit(db, ctx, { action: 'delete', table: 'boms', id });
    return { id };
  });
