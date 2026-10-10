import { z } from 'zod';

export const phoneSchema = z.string().trim().regex(/^\+?[0-9 ()-]{7,20}$/, 'Enter a valid phone number');

export const updateProfileSchema = z.object({
  full_name: z.string().trim().min(2).max(120).optional(),
  phone: phoneSchema.optional(),
  address: z.string().trim().min(3).max(300).optional(),
  city: z.string().trim().max(80).optional(),
  emergency_contact: z.string().trim().max(200).optional(),
});

export const myWorkQuery = z.object({ month: z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Use YYYY-MM').optional() });

export const tokenParam = z.object({ token: z.string().min(20).max(100) });

const password = z.string().min(8, 'At least 8 characters').max(72)
  .regex(/[A-Za-z]/, 'Include a letter').regex(/[0-9]/, 'Include a number');

// what a new staff member fills in on the invite page
export const joinInviteSchema = z.object({
  full_name: z.string().trim().min(2).max(120),
  phone: phoneSchema,
  address: z.string().trim().min(3).max(300),
  city: z.string().trim().min(2).max(80),
  emergency_contact: z.string().trim().max(200).optional().default(''),
  password,
});
