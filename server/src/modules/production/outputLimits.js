// How much a work order may produce compared with its target. A stage can run a little over (the seed uses 2%),
// but a typo like 5000 instead of 50 must be rejected instead of silently inflating stock.

import { invalid } from '../../utils/crud/index.js';

/** How far over target is allowed unless the mill sets `settings.production.over_target_pct`. 25 was already the built-in limit. */
export const DEFAULT_OVER_TARGET_PCT = 25;
export const OUTPUT_TOLERANCE = 1 + DEFAULT_OVER_TARGET_PCT / 100;

/**
 * Whether someone who plans production may confirm an entry above the limit. OFF unless the mill turns it on
 * (`settings.production.allow_over_target_override`): by default exceeding the limit is simply refused, as it always was.
 */
export const overrideAllowed = (ctx) => ctx?.settings?.production?.allow_over_target_override === true;

/** The mill's allowed overrun in percent (a number ≥ 0), from its settings. */
export const overTargetPct = (ctx) => {
  const v = ctx?.settings?.production?.over_target_pct;
  return typeof v === 'number' && v >= 0 ? v : DEFAULT_OVER_TARGET_PCT;
};

/** Throws when the total produced (already logged + `adding`) is beyond the tolerance, or waste is more than the target. */
export function assertOutputWithin(wo, { adding = 0, good = null, waste = 0 }, pct = DEFAULT_OVER_TARGET_PCT) {
  const target = Number(wo.target_qty);
  const limit = Math.round(target * (1 + pct / 100) * 1000) / 1000;
  if (good == null && Number(wo.produced_qty) + adding > limit) {
    throw invalid('qty', `That would bring ${wo.wo_no} to ${Math.round((Number(wo.produced_qty) + adding) * 1000) / 1000} against a target of ${target} (limit ${limit}). Check the quantity.`);
  }
  if (good != null && good > limit) throw invalid('good_qty', `Good output ${good} is far above the target of ${target} (limit ${limit}). Check the quantity.`);
  if (waste > target) throw invalid('waste_qty', `Waste ${waste} is more than the whole target of ${target}. Check the quantity.`);
}
