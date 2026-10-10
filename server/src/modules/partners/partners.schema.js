import { z } from 'zod';
import { pageQuery } from '../../middleware/validate.js';

const relation = z.enum(['buyer', 'supplier', 'transporter']);
const opt = (max = 200) => z.string().trim().max(max).optional();

export const connectCodeSchema = z.object({
  code: z.string().trim().min(4).max(20),
  relation,
});

export const inviteEmailSchema = z.object({
  email: z.string().trim().toLowerCase().email(),
  relation,
});

export const orgIdParam = z.object({ orgId: z.string().uuid() });

export const contactSchema = z.object({
  type: relation,
  name: z.string().trim().min(1).max(160),
  phone: opt(30), email: z.string().email().optional(), gstin: opt(20), address: opt(500), city: opt(80),
});
export const contactUpdateSchema = contactSchema.partial();
export const contactQuery = z.object({ ...pageQuery, type: relation.optional(), q: z.string().trim().max(80).optional() });
