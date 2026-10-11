// Input rules for attendance entries (a worker once per request, times only on worked days).
import { z } from 'zod';
import { dateString, monthString, uuid } from '../../utils/crud/schema.js';

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

// ---- unresolved rows and their correction ---------------------------------------------------------------------------------

export const unresolvedQuery = z.object({ from: dateString.optional(), to: dateString.optional() });

/** The corrected times are explicit: nothing is guessed from the shift end. check_out is required, check_in only when it was wrong. */
export const correctSchema = z.object({
  check_in: z.coerce.date().optional(),
  check_out: z.coerce.date(),
  reason: z.string().trim().min(5, 'Say why in a few words').max(300),
});
