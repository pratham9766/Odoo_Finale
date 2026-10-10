import { z } from 'zod';
import { dateString, monthString, optionalText, pageQuery, text, uuid } from '../../utils/crud/schema.js';

const status = z.enum(['present', 'late', 'half_day', 'absent', 'leave', 'weekly_off', 'holiday']);
const WORKED = ['present', 'late', 'half_day'];

// ---- supervisor grid ---------------------------------------------------------------------------------------------------

const entry = z.object({ worker_id: uuid, status, check_in: z.coerce.date().optional(), check_out: z.coerce.date().optional() })
  .refine((e) => WORKED.includes(e.status) || (!e.check_in && !e.check_out), 'Times only make sense for a day that was worked')
  .refine((e) => !(e.check_in && e.check_out) || e.check_out >= e.check_in, 'Check-out is before check-in');

export const bulkSchema = z.object({
  date: dateString,
  shift_id: uuid,
  entries: z.array(entry).min(1).max(500)
    .refine((rows) => new Set(rows.map((r) => r.worker_id)).size === rows.length, 'A worker can only appear once'),
});

export const dayQuery = z.object({ date: dateString.optional(), shift_id: uuid.optional(), stage_id: uuid.optional() });
export const registerQuery = z.object({ month: monthString, stage_id: uuid.optional(), shift_id: uuid.optional() });

// ---- corrections and leave ---------------------------------------------------------------------------------------------

export const correctionSchema = z.object({
  attendance_id: uuid,
  change: z.object({ check_in: z.coerce.date().optional(), check_out: z.coerce.date().optional(), status: status.optional() })
    .refine((c) => Object.keys(c).length > 0, 'Say what should change'),
  reason: text(300),
});
export const listCorrectionsQuery = pageQuery.extend({ status: z.enum(['pending', 'approved', 'rejected']).optional() });
export const decideSchema = z.object({ approve: z.boolean() });

export const leaveSchema = z.object({
  worker_id: uuid, from_date: dateString, to_date: dateString, type: text(30), reason: optionalText(300),
}).refine((l) => l.to_date >= l.from_date, { message: 'The last day is before the first day', path: ['to_date'] });
export const listLeaveQuery = pageQuery.extend({ status: z.enum(['pending', 'approved', 'rejected']).optional(), worker_id: uuid.optional() });
