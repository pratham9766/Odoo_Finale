import { z } from 'zod';
import { boolQuery, pageQuery, updateSchema, uuid } from '../../utils/crud/schema.js';

// Only the schedule can be edited here. Quantities and status change through planning and the start / log / finish actions.
export const updateWorkOrderSchema = updateSchema({
  machine_id: uuid.nullable(),                  // null = take it off the machine again
  planned_start: z.coerce.date().nullable(),
});

export const listWorkOrdersQuery = pageQuery.extend({
  status: z.enum(['planned', 'running', 'paused', 'done', 'cancelled']).optional(),
  stage_id: uuid.optional(),
  order_id: uuid.optional(),
  machine_id: uuid.optional(),
  unassigned: boolQuery.optional(),             // the planning board's "work waiting for a machine" list
  rework: boolQuery.optional(),
});
