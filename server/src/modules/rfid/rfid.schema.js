// Input rules for RFID: scanner scans, the simulator, card assignment, scanners and the event filters.
import { z } from 'zod';
import { boolQuery, dateString, optionalText, uuid } from '../../utils/crud/schema.js';
import { normalizeUid } from './rfid.rules.js';

const cardUid = z.string().trim().min(8).max(40);   // normalised and checked in the service (rfid.rules.js)

// ---- device (ESP32) -------------------------------------------------------------------------------------------------

export const iotScanSchema = z.object({
  cardUid: z.string().trim().max(40).transform(normalizeUid)
    .refine((v) => v !== null, 'Card UID must be 8–20 hex digits (4, 7 or 10 bytes)'),
  deviceId: z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{2,40}$/, 'Letters, digits, _ or -'),
  eventId: z.string().trim().regex(/^[A-Za-z0-9_.:-]{1,64}$/, 'Up to 64 letters, digits, _ . : or -').optional(),
});

// ---- staff ----------------------------------------------------------------------------------------------------------

export const simulateSchema = z.object({ card_uid: cardUid.optional(), worker_id: uuid.optional() })
  .refine((b) => Boolean(b.card_uid) !== Boolean(b.worker_id), 'Send either card_uid or worker_id');

export const workerParams = z.object({ workerId: uuid });
export const assignSchema = z.object({ card_uid: cardUid, is_placeholder: z.boolean().optional() });
export const replaceSchema = z.object({ card_uid: cardUid });

export const cardsQuery = z.object({
  q: z.string().trim().max(80).optional(),
  status: z.enum(['assigned', 'unassigned', 'placeholder']).optional(),
  active: boolQuery.optional(),
});

export const deviceSchema = z.object({
  code: z.string().trim().toUpperCase().regex(/^[A-Z0-9_-]{2,40}$/, 'Letters, digits, _ or -')
    .refine((c) => c !== 'VIRTUAL_SCANNER', 'Reserved for the simulator'),
  name: optionalText(80),
});
export const deviceUpdateSchema = z.object({ name: optionalText(80), active: z.boolean().optional() });

export const dashboardQuery = z.object({ date: dateString.optional() });

export const eventsQuery = z.object({
  from: dateString.optional(), to: dateString.optional(), worker_id: uuid.optional(),
  status: z.enum(['accepted', 'duplicate', 'unknown_card', 'invalid_employee', 'rejected']).optional(),
  source: z.enum(['hardware', 'simulator']).optional(),
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(200).default(50),
});

export const historyQuery = z.object({
  from: dateString.optional(), to: dateString.optional(), worker_id: uuid.optional(),
  source: z.enum(['manual', 'hardware', 'simulator']).optional(),
}).refine((q) => !q.from || !q.to || q.from <= q.to, 'from is after to');
