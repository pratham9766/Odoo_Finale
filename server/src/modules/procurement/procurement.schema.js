import { z } from 'zod';
import { pageQuery } from '../../middleware/validate.js';

const uuid = z.string().uuid();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');

export const poSchema = z.object({
  supplier_contact_id: uuid,
  for_order_id: uuid.optional(),
  need_by: date.optional(),
  notes: z.string().max(1000).optional(),
  lines: z.array(z.object({
    item_id: uuid,
    qty: z.number().positive().max(1e9),
    rate: z.number().min(0).max(1e7).default(0),
    supplier_item_ref: z.string().trim().max(60).optional(),
  })).min(1),
});

export const poQuery = z.object({
  ...pageQuery,
  status: z.string().regex(/^[a-z_,]+$/).optional(),
  for_order_id: uuid.optional(),
});

export const respondSchema = z.object({
  action: z.enum(['accept', 'partial', 'reject']),
  promise_date: date.optional(),
  note: z.string().max(500).optional(),
  lines: z.array(z.object({ po_line_id: uuid, accepted_qty: z.number().min(0) })).optional(),
}).refine((v) => v.action !== 'partial' || (v.lines && v.lines.length > 0), 'Partial acceptance needs accepted quantities per line');
