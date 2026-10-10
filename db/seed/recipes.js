// Turns a mill's catalog spec into items and BOMs. Pure: no database, so tests can walk the result.
//
// BOM lines store the NET quantity per output unit, in the component's own unit, plus the loss % of that step;
// explode() grosses it up as qty ÷ output_qty ÷ (1 − wastage_pct/100) (backend plan §11.4). Every number here is
// derived from the textile formulas and the stage losses, so the 1-shirt example comes out at ≈ 387 g fibre.

import { dyeKg, fabricMetresToKg, grossInput, inchesToMetres } from '../../server/src/utils/textile.js';

const round = (value, places) => Math.round(value * 10 ** places) / 10 ** places;   // bom_lines.qty is numeric(14,5)

/**
 * @param {object} spec    profile.catalog from config.js
 * @param {object} losses  { Spinning: { weight_loss_pct, length_shrink_pct }, Weaving: ..., Dyeing: ... }
 * @returns {{ items: object[], boms: Array<{ output: string, output_qty: number, stage: string|null,
 *             lines: Array<{ component: string, qty: number, wastage_pct: number, share_label?: string }> }> }}
 */
export function buildCatalog(spec, losses) {
  const items = [];
  const boms = [];
  const fibre = Object.fromEntries(spec.fibres.map((f) => [f.sku, f]));
  const sellable = ({ sku, name, std_rate, reorder_level = 0 }) => ({ sku, name, std_rate, reorder_level });

  for (const f of spec.fibres) {
    items.push({ ...sellable(f), kind: 'fibre', uom: 'kg', composition: f.composition });
  }

  for (const y of spec.yarns) {
    const composition = Object.entries(y.blend).map(([sku, share]) => `${round(share * 100, 0)}% ${fibre[sku].composition}`).join(', ');
    items.push({ ...sellable(y), kind: 'yarn', uom: 'kg', yarn_count_ne: y.count_ne, composition });
    boms.push({   // 1 kg of yarn ← fibre; spinning waste is the stage's weight loss
      output: y.sku, output_qty: 1, stage: 'Spinning',
      lines: Object.entries(y.blend).map(([component, share]) => ({ component, qty: share, wastage_pct: losses.Spinning.weight_loss_pct })),
    });
  }

  for (const d of spec.dyes) items.push({ ...sellable(d), kind: 'dye', uom: 'kg', colour: d.colour });
  for (const s of spec.scrap) items.push({ ...sellable(s), kind: 'scrap', uom: 'kg' });

  const { Weaving: weaving, Dyeing: dyeing } = losses;
  const yarnComposition = Object.fromEntries(items.filter((i) => i.kind === 'yarn').map((i) => [i.sku, i.composition]));

  for (const q of spec.qualities) {
    const widthM = round(inchesToMetres(q.width_in), 2);
    // dyeing loses weight (5%) and length (4%): the grey fabric has to be heavier per metre than the finished one
    const greyGsm = round(q.gsm * (1 - dyeing.length_shrink_pct / 100) / (1 - dyeing.weight_loss_pct / 100), 2);
    const grey = `GRY-${q.code}`, finished = `FIN-${q.code}`;
    const composition = yarnComposition[q.warp];

    items.push(
      { sku: grey, name: `${q.name} ${q.width_in}" grey`, kind: 'grey_fabric', uom: 'm', composition, gsm: greyGsm, width_m: widthM,
        roll_length_m: q.roll_length_m, std_rate: q.grey_rate, reorder_level: 0 },
      { sku: finished, name: `${q.name} ${q.width_in}" ${q.colour}`, kind: 'finished_fabric', uom: 'm', composition, gsm: q.gsm, width_m: widthM,
        colour: q.colour, roll_length_m: q.roll_length_m, std_rate: q.finished_rate, reorder_level: 0 },
    );

    const yarnKgPerMetre = fabricMetresToKg(1, widthM, greyGsm);
    boms.push({   // 1 m of grey fabric ← warp + weft yarn
      output: grey, output_qty: 1, stage: 'Weaving',
      lines: [
        { component: q.warp, qty: round(yarnKgPerMetre * q.warp_pct / 100, 5), wastage_pct: weaving.weight_loss_pct, share_label: 'warp' },
        { component: q.weft, qty: round(yarnKgPerMetre * (100 - q.warp_pct) / 100, 5), wastage_pct: weaving.weight_loss_pct, share_label: 'weft' },
      ],
    });

    boms.push({   // 1 m of finished fabric ← grey fabric (length shrinks) + dye on the grey weight that goes into the bath
      output: finished, output_qty: 1, stage: 'Dyeing',
      lines: [
        { component: grey, qty: 1, wastage_pct: dyeing.length_shrink_pct },
        { component: q.dye, qty: round(dyeKg(fabricMetresToKg(grossInput(1, dyeing.length_shrink_pct), widthM, greyGsm), q.shade_pct), 5), wastage_pct: 0 },
      ],
    });
  }

  for (const g of spec.garments) {
    items.push({ ...sellable(g), kind: 'garment', uom: 'pcs' });
    boms.push({   // buyer-side cutting: no mill stage
      output: g.sku, output_qty: 1, stage: null,
      lines: [{ component: `FIN-${g.quality}`, qty: g.fabric_m, wastage_pct: g.cutting_waste_pct }],
    });
  }

  return { items, boms };
}
