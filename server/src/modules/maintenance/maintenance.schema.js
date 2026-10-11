// Input rules for breakdowns and tickets.
import { z } from 'zod';
import { optionalText, pageQuery, text, uuid } from '../../utils/crud/schema.js';

export const breakdownSchema = z.object({
  reason: text(200),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).optional(),
});

export const resolveSchema = z.object({
  resolution: text(500),
  parts_used: optionalText(300),
});

export const listTicketsQuery = pageQuery.extend({
  status: z.enum(['open', 'in_progress', 'resolved']).optional(),
  machine_id: uuid.optional(),
});
