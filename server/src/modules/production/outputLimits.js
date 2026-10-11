// How much a work order may produce compared with its target. A stage can run a little over (the seed uses 2%),
// but a typo like 5000 instead of 50 must be rejected instead of silently inflating stock.

import { invalid } from '../../utils/crud/index.js';

export const OUTPUT_TOLERANCE = 1.25;

/** Throws when the total produced (already logged + `adding`) is beyond the tolerance, or waste is more than the target. */
export function assertOutputWithin(wo, { adding = 0, good = null, waste = 0 }) {
  const target = Number(wo.target_qty);
  const limit = Math.round(target * OUTPUT_TOLERANCE * 1000) / 1000;
  if (good == null && Number(wo.produced_qty) + adding > limit) {
    throw invalid('qty', `That would bring ${wo.wo_no} to ${Math.round((Number(wo.produced_qty) + adding) * 1000) / 1000} against a target of ${target} (limit ${limit}). Check the quantity.`);
  }
  if (good != null && good > limit) throw invalid('good_qty', `Good output ${good} is far above the target of ${target} (limit ${limit}). Check the quantity.`);
  if (waste > target) throw invalid('waste_qty', `Waste ${waste} is more than the whole target of ${target}. Check the quantity.`);
}
