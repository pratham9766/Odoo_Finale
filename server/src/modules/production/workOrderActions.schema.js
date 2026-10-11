// Input rules for work-order actions.
import { z } from 'zod';
import { uuid } from '../../utils/crud/schema.js';

const quantity = z.number().min(0).max(100_000_000);

export const pauseSchema = z.object({ reason: z.string().trim().max(200).optional() });

// quantities are stored with 3 decimals (numeric(14,3)); more digits would be rounded silently, so refuse them
const threeDecimals = (q) => Math.abs(Math.round(q * 1000) / 1000 - q) < 1e-9;

export const logSchema = z.object({
  qty: quantity.refine((q) => q > 0, 'Output must be more than zero').refine(threeDecimals, 'Use at most 3 decimal places'),
  confirm_over_target: z.boolean().optional(),   // a supervisor confirms an entry above the allowed overrun ...
  reason: z.string().trim().max(200).optional(), // ... and says why (audited)
  worker_id: uuid.optional(),                // default: whoever is assigned to this machine for the shift
  shift_id: uuid.optional(),                 // default: the shift running now
});

export const finishSchema = z.object({
  good_qty: quantity,
  good_weight_kg: quantity.optional(),
  waste_qty: quantity.default(0),
  waste_type: z.string().trim().max(50).optional(),
  waste_item_id: uuid.optional(),            // the scrap item the waste is booked to
});
