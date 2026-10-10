import { z } from 'zod';
import { optionalText, pageQuery, rangeQuery, text, uuid } from '../../utils/crud/schema.js';
import { DEFECT_GROUPS } from './qcReports.service.js';

export const createRollSchema = z.object({
  work_order_id: uuid,
  length_m: z.number().positive().max(10_000),
  weight_kg: z.number().positive().max(10_000).optional(),
  dye_batch: z.string().trim().min(1).max(40).optional(),
});

const defect = z.object({
  defect_type_id: uuid,
  count: z.number().int().min(1).max(10_000),
  severity: z.number().int().min(1).max(5).default(1),
});
const result = z.enum(['pass', 'rework', 'reject']);
const evidence = { remarks: optionalText(500), photo_path: optionalText(300) };

export const inspectionSchema = z.object({
  roll_id: uuid.optional(),
  qr_token: z.string().trim().min(8).max(64).optional(),
  result,
  defects: z.array(defect).max(30).default([]),
  ...evidence,
}).refine((b) => Boolean(b.roll_id) !== Boolean(b.qr_token), 'Send either roll_id or qr_token');

export const overrideSchema = z.object({
  result,
  reason: text(300),                                   // an override without a reason is not allowed
  defects: z.array(defect).max(30).default([]),
  ...evidence,
});

export const rollNoParams = z.object({ rollNo: z.string().trim().min(1).max(40) });

export const queueQuery = pageQuery.extend({
  status: z.enum(['pending_qc', 'passed', 'rework', 'rejected']).default('pending_qc'),
  order_id: uuid.optional(),
  q: z.string().trim().max(40).optional(),
});

export const summaryQuery = rangeQuery;
export const defectsQuery = rangeQuery.extend({ by: z.enum(DEFECT_GROUPS).optional() });
