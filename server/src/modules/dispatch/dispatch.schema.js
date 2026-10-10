import { z } from 'zod';
import { optionalText, pageQuery, uuid } from '../../utils/crud/schema.js';

export const createDispatchSchema = z.object({
  order_id: uuid,
  transporter_org_id: uuid.optional(),                                  // a connected transporter; otherwise vehicle and driver fields
  vehicle_no: z.string().trim().toUpperCase().max(20).optional(),
  driver_name: optionalText(80),
  driver_phone: z.string().trim().regex(/^\+?[0-9 ]{7,15}$/, 'Digits only, 7–15 characters').optional(),
});

// the scan screen sends whatever the barcode reader returned: a roll number or a QR token
export const scanSchema = z.object({
  code: z.string().trim().min(1).max(64).optional(),
  roll_no: z.string().trim().min(1).max(64).optional(),
  qr_token: z.string().trim().min(1).max(64).optional(),
}).transform((b) => ({ code: b.code ?? b.roll_no ?? b.qr_token }))
  .refine((b) => Boolean(b.code), 'Send code, roll_no or qr_token');

export const statusSchema = z.object({ status: z.enum(['in_transit', 'delivered']) });

export const receiveSchema = z.object({
  note: optionalText(500),
  shortage_roll_ids: z.array(uuid).max(500).default([]),
  damaged_roll_ids: z.array(uuid).max(500).default([]),
});

export const listDispatchesQuery = pageQuery.extend({
  side: z.enum(['out', 'in']).default('out'),                           // out = what we sent, in = what is addressed to us
  status: z.enum(['packing', 'confirmed', 'in_transit', 'delivered', 'disputed', 'cancelled']).optional(),
  order_id: uuid.optional(),
});

export const rollParams = z.object({ id: uuid, rollId: uuid });
