// Input rules for work-order actions.
import { z } from 'zod';
import { uuid } from '../../utils/crud/schema.js';

const quantity = z.number().min(0).max(100_000_000);

export const pauseSchema = z.object({ reason: z.string().trim().max(200).optional() });

export const logSchema = z.object({
  qty: quantity.refine((q) => q > 0, 'Output must be more than zero'),
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
