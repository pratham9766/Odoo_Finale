// zod building blocks shared by every module's schema file.

import { z } from 'zod';

export const uuid = z.string().uuid();
export const idParams = z.object({ id: uuid });

/** A calendar date, YYYY-MM-DD. */
export const dateString = z.string().date();

/** A calendar month, YYYY-MM. */
export const monthString = z.string().regex(/^\d{4}-(0[1-9]|1[0-2])$/, 'Use YYYY-MM');

/** ?from=&to= for reports; both optional, see reportRange(). */
export const rangeQuery = z.object({ from: dateString.optional(), to: dateString.optional() });

export const text = (max) => z.string().trim().min(1).max(max);
export const optionalText = (max) => z.string().trim().max(max).nullable().optional();

/** "true" / "false" in a query string → boolean. */
export const boolQuery = z.enum(['true', 'false']).transform((v) => v === 'true');

/** ?page=1&limit=100 (backend plan §1). A list route that validates this answers with meta { page, limit, total }. */
export const pageQuery = z.object({
  page: z.coerce.number().int().min(1).default(1),
  limit: z.coerce.number().int().min(1).max(500).default(100),
});

/**
 * PATCH body: every field optional, at least one present.
 * Pass the fields WITHOUT .default(): zod v4 applies defaults inside .partial(),
 * so a PATCH that omits the field would silently reset it.
 */
export const updateSchema = (fields) =>
  z.object(fields).partial().refine((b) => Object.keys(b).length > 0, 'Nothing to update');
