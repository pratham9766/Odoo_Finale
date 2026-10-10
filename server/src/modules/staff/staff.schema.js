import { z } from 'zod';
import { pageQuery } from '../../middleware/validate.js';

const uuid = z.string().uuid();
const scope = z.object({
  stage_ids: z.array(uuid).default([]),
  machine_ids: z.array(uuid).default([]),
  shift_ids: z.array(uuid).default([]),
  warehouse_ids: z.array(uuid).default([]),
}).partial();

export const inviteSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  role_id: uuid,
  scope: scope.optional(),
});

export const memberPatchSchema = z.object({
  role_id: uuid.optional(),
  scope: scope.optional(),
  reports_to: uuid.nullable().optional(),
  status: z.enum(['active', 'disabled']).optional(),
}).refine((v) => Object.keys(v).length > 0, 'Nothing to update');

export const roleCreateSchema = z.object({
  name: z.string().trim().min(2).max(60),
  rank: z.number().int().min(1).max(99),
  permissions: z.array(z.string()).default([]),
});

export const roleUpdateSchema = z.object({
  name: z.string().trim().min(2).max(60).optional(),
  rank: z.number().int().min(1).max(100).optional(),
  permissions: z.array(z.string()).optional(),
});

export const auditQuery = z.object({ ...pageQuery, table: z.string().optional(), user_id: uuid.optional() });
