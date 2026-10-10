import { z } from 'zod';
import { pageQuery } from '../../middleware/validate.js';

const uuid = z.string().uuid();
const date = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, 'Use YYYY-MM-DD');

export const poSchema = z.object({
  supplier_org_id: uuid.optional(),
  supplier_contact_id: uuid.optional(),
  for_order_id: uuid.optional(),
  need_by: date.optional(),
  notes: z.string().max(1000).optional(),
  lines: z.array(z.object({
    item_id: uuid,
    qty: z.number().positive(),
    rate: z.number().min(0).default(0),
    supplier_item_ref: z.string().trim().max(60).optional(),
  })).min(1),
}).refine((v) => !!v.supplier_org_id !== !!v.supplier_contact_id, 'Choose exactly one of supplier_org_id or supplier_contact_id');

export const poQuery = z.object({
  ...pageQuery,
  side: z.enum(['purchase', 'incoming']).default('purchase'),
  status: z.string().regex(/^[a-z_,]+$/).optional(),
  for_order_id: uuid.optional(),
});

export const respondSchema = z.object({
  action: z.enum(['accept', 'partial', 'reject']),
  promise_date: date.optional(),
  note: z.string().max(500).optional(),
  lines: z.array(z.object({ po_line_id: uuid, accepted_qty: z.number().min(0) })).optional(),
}).refine((v) => v.action !== 'partial' || (v.lines && v.lines.length > 0), 'Partial acceptance needs accepted quantities per line');

export const dispatchPoSchema = z.object({
  lots: z.array(z.object({
    po_line_id: uuid,
    lot_no: z.string().trim().min(1).max(60),
    colour: z.string().trim().max(50).optional(),
    qty: z.number().positive(),
  })).min(1),
  transporter_org_id: uuid.optional(),
  vehicle_no: z.string().trim().max(30).optional(),
  driver_name: z.string().trim().max(120).optional(),
  driver_phone: z.string().trim().max(30).optional(),
});
