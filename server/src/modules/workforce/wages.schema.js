// Input rules for wage runs and payslips.
import { z } from 'zod';
import { monthString, uuid } from '../../utils/crud/schema.js';

export const prepareRunSchema = z.object({ month: monthString });

export const payslipParams = z.object({ workerId: uuid });
export const payslipQuery = z.object({ month: monthString, format: z.enum(['pdf', 'json']).default('pdf') });

