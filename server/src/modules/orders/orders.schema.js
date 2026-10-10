import { z } from 'zod';
import { pageQuery } from '../../middleware/validate.js';

const uuid = z.string().uuid();

export const createOrderSchema = z.object({
  buyer_contact_id: uuid, // the buyer (a contact of the mill)
  buyer_ref: z.string().trim().max(60).optional(),
  deadline: z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD'),
  priority: z.enum(['low', 'normal', 'high', 'urgent']).default('normal'),
  delivery_address: z.string().max(500).optional(),
  notes: z.string().max(2000).optional(),
  lines: z.array(z.object({
    item_id: uuid,
    colour: z.string().max(50).optional(),
    description: z.string().max(200).optional(),
    qty: z.number().positive().max(100_000_000),
    uom: z.enum(['m', 'kg', 'roll', 'pcs']),
    rate: z.number().nonnegative().max(10_000_000).default(0),
  })).min(1),
});

export const orderQuery = z.object({
  ...pageQuery,
  status: z.string().regex(/^[a-z_,]+$/).optional(),
  risk: z.enum(['green', 'amber', 'red']).optional(),
  bucket: z.enum(['open', 'in_production', 'ready_to_dispatch', 'delayed']).optional(),   // the Orders page KPI groups
  priority: z.string().regex(/^[a-z,]+$/).optional(),
  q: z.string().trim().max(60).optional(),
});

export const confirmSchema = z.object({
  auto_po: z.boolean().default(false), // draft POs for shortages, grouped by preferred supplier
}).default({ auto_po: false });

export const cancelSchema = z.object({ reason: z.string().trim().max(300).optional() }).default({});
