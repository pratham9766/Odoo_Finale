// Input rules for workers (code, phone, wage type and rates).
import { z } from 'zod';
import { boolQuery, optionalText, pageQuery, text, updateSchema, uuid } from '../../utils/crud/schema.js';

const money = z.number().min(0).max(10_000_000);

const fields = {
  emp_code: z.string().trim().toUpperCase().regex(/^[A-Z0-9-]{1,20}$/, 'Up to 20 letters, digits or -'),
  name: text(100),
  phone: z.string().trim().regex(/^\+?[0-9 ]{7,15}$/, 'Digits only, 7–15 characters').nullable().optional(),
  photo_path: optionalText(300),
  skill: optionalText(50),
  stage_id: uuid.nullable(),
  default_shift_id: uuid.nullable(),
  employment_type: z.enum(['permanent', 'contract']),
  wage_type: z.enum(['daily', 'hourly', 'piece']),
  rate: money,
  ot_rate: money,
  piece_rate: money,
  active: z.boolean(),
  department: optionalText(60),
  work_area: optionalText(60),     // e.g. Loom 01, QC Station (shown on the RFID board)
};

// emp_code, name and wage_type are the only required fields; the rest default in the database
export const createWorkerSchema = z.object(fields).partial({
  phone: true, photo_path: true, skill: true, stage_id: true, default_shift_id: true,
  employment_type: true, rate: true, ot_rate: true, piece_rate: true, active: true, department: true, work_area: true,
});
export const updateWorkerSchema = updateSchema(fields);

export const listWorkersQuery = pageQuery.extend({
  stage_id: uuid.optional(),
  shift_id: uuid.optional(),                 // the worker's default shift
  wage_type: fields.wage_type.optional(),
  active: boolQuery.optional(),
  q: z.string().trim().max(80).optional(),   // name, employee code or phone
});
