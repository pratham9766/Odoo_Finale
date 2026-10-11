// Input rules for stock, receipts and adjustments (quantities are bounded).
import { z } from 'zod';
import { pageQuery, zBoolStr, zDate } from '../../middleware/validate.js';

const uuid = z.string().uuid();
const qty = z.number().finite().min(-1e9).max(1e9);

export const stockQuery = z.object({
  ...pageQuery,
  kind: z.string().optional(),
  low: zBoolStr,
  q: z.string().trim().max(80).optional(),
});

export const lotQuery = z.object({
  ...pageQuery,
  item_id: uuid.optional(),
  in_stock: zBoolStr,
});

export const movementQuery = z.object({
  ...pageQuery,
  item_id: uuid.optional(),
  lot_id: uuid.optional(),
  type: z.enum(['in', 'out', 'consume', 'produce', 'adjust', 'return', 'scrap']).optional(),
  from: zDate.optional(),
  to: zDate.optional(),
});

export const receiptSchema = z.object({
  supplier_contact_id: uuid.optional(),
  po_id: uuid.optional(),
  vehicle_no: z.string().trim().max(30).optional(),
  notes: z.string().max(1000).optional(),
  lines: z.array(z.object({
    item_id: uuid,
    lot_no: z.string().trim().min(1).max(60),
    expected_qty: qty.min(0).optional(),
    received_qty: qty.min(0),
    rate: qty.min(0).default(0),
    warehouse_id: uuid.optional(),
    po_line_id: uuid.optional(),
    for_order_id: uuid.optional(),
    dye_batch: z.string().trim().max(60).optional(),
  })).min(1),
});

export const receiptQuery = z.object({
  ...pageQuery,
  status: z.enum(['draft', 'posted', 'cancelled']).optional(),
  supplier_contact_id: uuid.optional(),
});

export const adjustmentSchema = z.object({
  item_id: uuid,
  lot_id: uuid.optional(),
  qty: qty.refine((n) => n !== 0, 'Quantity cannot be 0'),
  reason: z.string().trim().min(3).max(300),
});

export const adjustmentQuery = z.object({ ...pageQuery, status: z.enum(['pending', 'approved', 'rejected']).optional() });
