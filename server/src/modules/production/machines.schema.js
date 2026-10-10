import { z } from 'zod';
import { UOMS } from '../../utils/textile.js';
import { boolQuery, optionalText, pageQuery, updateSchema, uuid } from '../../utils/crud/schema.js';

// `status` and `current_work_order_id` are deliberately not writable here: they change only through
// work order start / pause / breakdown, so the machine board can never disagree with the work orders.
const fields = {
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9-]{1,20}$/, 'Up to 20 letters, digits or -'),
  name: optionalText(80),
  stage_id: uuid,
  capacity_per_hour: z.number().positive().max(1_000_000),
  capacity_uom: z.enum(UOMS),
  hourly_overhead: z.number().min(0).max(1_000_000),
  active: z.boolean(),
};

export const createMachineSchema = z.object(fields).partial({ name: true, hourly_overhead: true, active: true });
export const updateMachineSchema = updateSchema(fields);

export const listMachinesQuery = pageQuery.extend({
  stage_id: uuid.optional(),
  active: boolQuery.optional(),
  status: z.enum(['idle', 'running', 'breakdown', 'maintenance']).optional(),
});
