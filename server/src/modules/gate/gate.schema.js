import { z } from 'zod';
import { boolQuery, optionalText, pageQuery, rangeQuery, uuid } from '../../utils/crud/schema.js';

const PURPOSES = ['supply', 'dispatch', 'visitor', 'other'];

export const logEntrySchema = z.object({
  direction: z.enum(['in', 'out']),
  vehicle_no: z.string().trim().toUpperCase().min(4).max(20),
  driver_name: optionalText(80),
  purpose: z.enum(PURPOSES),
  dispatch_id: uuid.optional(),                                          // optional: the vehicle number finds the dispatch by itself
}).refine((b) => !b.dispatch_id || b.purpose === 'supply' || b.purpose === 'dispatch',
  { path: ['dispatch_id'], message: 'Only a supply or dispatch visit can name a dispatch' });

export const listEntriesQuery = pageQuery.merge(rangeQuery).extend({
  direction: z.enum(['in', 'out']).optional(),
  purpose: z.enum(PURPOSES).optional(),
  inside: boolQuery.optional(),                                          // true = vehicles that are in the premises right now
  q: z.string().trim().max(60).optional(),                               // vehicle number or driver
});
