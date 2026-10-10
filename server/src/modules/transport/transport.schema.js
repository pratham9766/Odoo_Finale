import { z } from 'zod';
import { pageQuery } from '../../middleware/validate.js';

const uuid = z.string().uuid();

export const vehicleSchema = z.object({
  vehicle_no: z.string().trim().min(4).max(20).transform((v) => v.toUpperCase().replace(/\s+/g, '')),
  type: z.string().trim().max(40).optional(),
  capacity_kg: z.number().positive().optional(),
});
export const vehicleUpdateSchema = vehicleSchema.partial();

export const driverSchema = z.object({
  name: z.string().trim().min(1).max(120),
  phone: z.string().trim().max(30).optional(),
  licence_no: z.string().trim().max(40).optional(),
  user_email: z.string().trim().toLowerCase().email().optional(), // a staff member with the Driver role
});
export const driverUpdateSchema = driverSchema.partial();

export const tripQuery = z.object({
  ...pageQuery,
  status: z.string().regex(/^[a-z_,]+$/).optional(),
  dispatch_id: uuid.optional(),
});

export const assignSchema = z.object({
  vehicle_id: uuid,
  driver_id: uuid,
  eta: z.string().datetime({ offset: true }).optional(),
});

export const rejectSchema = z.object({ reason: z.string().trim().max(300).optional() }).default({});

export const driverStatusSchema = z.object({
  status: z.enum(['picked_up', 'in_transit', 'reached']),
  note: z.string().max(300).optional(),
});

export const deliverSchema = z.object({
  otp: z.string().regex(/^\d{4}$/, 'OTP is 4 digits'),
  receiver_name: z.string().trim().min(1).max(120),
  photo_path: z.string().max(300).optional(), // path returned by /uploads/sign (bucket pod-photos)
});

export const freightSchema = z.object({
  amount: z.number().positive(),
  tax_pct: z.number().min(0).max(28).default(5),
  due_days: z.number().int().min(0).max(120).default(30),
});
