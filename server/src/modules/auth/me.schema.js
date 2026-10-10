import { z } from 'zod';

export const updateProfileSchema = z.object({
  full_name: z.string().trim().min(1).max(120).optional(),
  phone: z.string().trim().max(30).optional(),
});

export const tokenParam = z.object({ token: z.string().min(20).max(100) });
