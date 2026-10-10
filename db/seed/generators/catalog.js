// Items and BOMs. What goes in them is decided by recipes.js; this file only stores it.

import { buildCatalog } from '../recipes.js';
import { idsBy, insertRows, need } from '../lib/insert.js';

// every row of one INSERT needs the same keys, and items only fill the attributes that apply to their kind
const ITEM_COLUMNS = ['sku', 'kind', 'name', 'uom', 'colour', 'composition', 'yarn_count_ne', 'gsm', 'width_m',
                      'roll_length_m', 'reorder_level', 'std_rate'];

/** @returns {{ itemId: Object<string,string>, bomCount: number }} sku → id */
export async function seedCatalog(db, orgId, profile, { stageId }) {
  const losses = Object.fromEntries(profile.stages.map((s) => [s.name, s]));
  const { items, boms } = buildCatalog(profile.catalog, losses);

  const itemRows = await insertRows(db, 'items', items.map((item) => ({
    org_id: orgId, ...Object.fromEntries(ITEM_COLUMNS.map((c) => [c, item[c] ?? null])),
  })));
  const itemId = idsBy(itemRows, 'sku');

  const bomRows = await insertRows(db, 'boms', boms.map((b) => ({
    org_id: orgId, output_item_id: need(itemId, b.output, 'item'), output_qty: b.output_qty,
    stage_id: b.stage ? need(stageId, b.stage, 'stage') : null, version: 1, is_default: true,
  })));
  const bomId = Object.fromEntries(bomRows.map((r) => [r.output_item_id, r.id]));

  await insertRows(db, 'bom_lines', boms.flatMap((b) => b.lines.map((line) => ({
    org_id: orgId, bom_id: bomId[itemId[b.output]], component_item_id: need(itemId, line.component, 'item'),
    qty: line.qty, wastage_pct: line.wastage_pct, share_label: line.share_label ?? null,
  }))));

  return { itemId, bomCount: bomRows.length };
}
