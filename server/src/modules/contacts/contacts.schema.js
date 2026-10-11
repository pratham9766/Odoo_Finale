// Input rules for buyers and suppliers (type, GSTIN, email).
import { z } from 'zod';
import { pageQuery } from '../../middleware/validate.js';
import { gstinField } from '../../utils/gstin.js';

// buyers and suppliers of the mill are plain contacts (names, phone, GSTIN) — they don't log in
const type = z.enum(['buyer', 'supplier']);
const opt = (max = 200) => z.string().trim().max(max).optional();

export const contactSchema = z.object({
  type,
  name: z.string().trim().min(1).max(160),
  phone: opt(30), email: z.string().email().optional(), gstin: z.preprocess((v) => (v === '' ? null : v), gstinField.nullable().optional()),   // a blank form field means "none" address: opt(500), city: opt(80),
});
export const contactUpdateSchema = contactSchema.partial();
export const contactQuery = z.object({ ...pageQuery, type: type.optional(), q: z.string().trim().max(80).optional() });
