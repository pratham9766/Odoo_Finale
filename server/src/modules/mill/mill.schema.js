import { z } from 'zod';
import { optionalText, text, updateSchema, uuid } from '../../utils/crud/schema.js';
import { gstinField } from '../../utils/gstin.js';
import { MODULES } from './modules.catalog.js';

export const stageIdParams = z.object({ stageId: uuid });

const pct = z.number().min(0).lt(100);                      // a loss of 100% would make grossInput divide by zero
const time = z.string().regex(/^([01]\d|2[0-3]):[0-5]\d(:[0-5]\d)?$/, 'Use HH:MM (24-hour)');

const isTimeZone = (tz) => {
  try { new Intl.DateTimeFormat('en-US', { timeZone: tz }); return true; } catch { return false; }
};

// ---- mill profile ----------------------------------------------------------

export const updateMillSchema = z.object({
  name: text(120).optional(),
  gstin: gstinField.nullable().optional(),
  address: optionalText(500),
  city: optionalText(80),
  state: optionalText(80),
  pincode: z.string().trim().regex(/^\d{6}$/, 'Pincode must be 6 digits').nullable().optional(),
  phone: optionalText(20),
  email: z.string().trim().email().max(200).nullable().optional(),
  logo_url: optionalText(500),
  // shallow-merged into mill.settings; `modules` is only changed through /mill/modules
  settings: z.object({
    timezone: z.string().refine(isTimeZone, 'Unknown time zone').optional(),
    currency: z.string().regex(/^[A-Z]{3}$/, 'ISO currency code, e.g. INR').optional(),
    invoice_prefix: z.string().regex(/^[A-Z0-9-]{1,10}$/, 'Up to 10 capital letters, digits or -').optional(),
  }).optional(),
}).refine((b) => Object.keys(b).length > 0, 'Nothing to update');

// z.record(z.enum(...)) is exhaustive in zod v4 (every key required), so check keys by hand
const MODULE_KEYS = new Set(MODULES.map((m) => m.key));
export const updateModulesSchema = z.object({
  modules: z.record(z.string(), z.boolean())
    .refine((m) => Object.keys(m).length > 0, 'Nothing to update')
    .refine((m) => Object.keys(m).every((k) => MODULE_KEYS.has(k)), 'Unknown module'),
});

// ---- stages + losses -------------------------------------------------------

const stageFields = {
  name: text(60),
  sequence: z.number().int().min(1).max(99),
  output_kind: z.enum(['yarn', 'grey_fabric', 'finished_fabric']).nullable().optional(),
};
export const createStageSchema = z.object(stageFields);
export const updateStageSchema = updateSchema(stageFields);
export const reorderStagesSchema = z.object({
  ids: z.array(uuid).min(1).refine((ids) => new Set(ids).size === ids.length, 'Duplicate stage ids'),
});

export const upsertStageLossSchema = z.object({
  weight_loss_pct: pct.default(0),
  length_shrink_pct: pct.default(0),
});

// ---- shifts ----------------------------------------------------------------
// Defaults go on the create schemas only: zod v4 applies .default() even inside .partial(),
// so a PATCH that omits a field would silently reset it.

const shiftFields = {
  name: text(30),
  start_time: time,
  end_time: time,
  grace_min: z.number().int().min(0).max(120),
};
const notZeroLength = (b) => !b.start_time || !b.end_time || b.start_time.slice(0, 5) !== b.end_time.slice(0, 5);
export const createShiftSchema = z.object({ ...shiftFields, grace_min: shiftFields.grace_min.default(10) })
  .refine(notZeroLength, { message: 'Start and end time cannot be the same', path: ['end_time'] });
export const updateShiftSchema = updateSchema(shiftFields)
  .refine(notZeroLength, { message: 'Start and end time cannot be the same', path: ['end_time'] });

// ---- defect types ----------------------------------------------------------

const defectFields = {
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_]{1,20}$/, 'Up to 20 letters, digits or _'),
  name: text(60),
  severity_default: z.number().int().min(1).max(5),
};
export const createDefectTypeSchema = z.object({ ...defectFields, severity_default: defectFields.severity_default.default(1) });
export const updateDefectTypeSchema = updateSchema(defectFields);

// ---- warehouses ------------------------------------------------------------

const warehouseFields = {
  name: text(60),
  kind: z.enum(['raw', 'wip', 'finished', 'scrap']),
};
export const createWarehouseSchema = z.object(warehouseFields);
export const updateWarehouseSchema = updateSchema(warehouseFields);
