import { z } from 'zod';
import { dateString, updateSchema, uuid } from '../../utils/crud/schema.js';
import { todayIST } from '../../utils/time.js';

export const listAssignmentsQuery = z.object({
  date: dateString.default(() => todayIST()),   // a night shift uses the date it starts on
  shift_id: uuid.optional(),
  machine_id: uuid.optional(),
  worker_id: uuid.optional(),
});

// the supervisor's grid: one worker → machine entry per row
export const saveAssignmentsSchema = z.object({
  date: dateString,
  shift_id: uuid,
  entries: z.array(z.object({ worker_id: uuid, machine_id: uuid })).min(1).max(500)
    .refine((rows) => new Set(rows.map((r) => r.worker_id)).size === rows.length, 'A worker can only be on one machine per shift'),
});

export const updateAssignmentSchema = updateSchema({ machine_id: uuid });   // move one worker to another machine
