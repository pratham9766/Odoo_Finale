import { z } from 'zod';
import { boolQuery, dateString, monthString, pageQuery, uuid } from '../../utils/crud/schema.js';

export const prepareRunSchema = z.object({ month: monthString });

export const payslipParams = z.object({ workerId: uuid });
export const payslipQuery = z.object({ month: monthString, format: z.enum(['pdf', 'json']).default('pdf') });

export const advanceSchema = z.object({
  worker_id: uuid,
  amount: z.number().positive().max(1_000_000),
  date: dateString,
});
export const listAdvancesQuery = pageQuery.extend({ worker_id: uuid.optional(), open: boolQuery.optional() });   // open = not yet recovered
