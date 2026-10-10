import { z } from 'zod';

const opt = (max = 200) => z.string().trim().max(max).optional();

export const updateProfileSchema = z.object({
  full_name: z.string().trim().min(1).max(120).optional(),
  phone: opt(30),
});

export const createOrgSchema = z.object({
  name: z.string().trim().min(2).max(160),
  types: z.array(z.enum(['manufacturer', 'buyer', 'supplier', 'transporter'])).min(1),
  gstin: opt(20), address: opt(500), city: opt(80), state: opt(80), pincode: opt(10), phone: opt(30),
  email: z.string().email().optional(),
  stages: z.array(z.object({
    name: z.string().trim().min(1).max(60),
    output_kind: z.enum(['yarn', 'grey_fabric', 'finished_fabric']).optional(),
    weight_loss_pct: z.number().min(0).max(99).default(0),
    length_shrink_pct: z.number().min(0).max(99).default(0),
  })).optional(),
  shifts: z.array(z.object({
    name: z.string().trim().min(1).max(30),
    start_time: z.string().regex(/^\d{2}:\d{2}$/),
    end_time: z.string().regex(/^\d{2}:\d{2}$/),
    grace_min: z.number().int().min(0).max(120).default(10),
  })).optional(),
});

export const tokenParam = z.object({ token: z.string().min(20).max(100) });
export const orgIdParam = z.object({ id: z.string().uuid() });
export const acceptPartnerSchema = z.object({ org_id: z.string().uuid() });
