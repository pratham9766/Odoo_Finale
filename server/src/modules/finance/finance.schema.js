// Input rules for invoices, payments and expenses.
import { z } from 'zod';
import { boolQuery, dateString, optionalText, pageQuery, rangeQuery, updateSchema, uuid } from '../../utils/crud/schema.js';
import { CATEGORIES } from './expenses.service.js';

export const listInvoicesQuery = pageQuery.extend({
  status: z.enum(['draft', 'unpaid', 'partial', 'paid', 'cancelled']).optional(),
});

export const paymentSchema = z.object({
  invoice_id: uuid,
  amount: z.number().positive().max(1_000_000_000),
  mode: z.enum(['bank', 'upi', 'cheque', 'cash']),
  ref_no: z.string().trim().max(60).optional(),
  paid_at: dateString.optional(),                                        // default today; never in the future
});

export const listPaymentsQuery = pageQuery.merge(rangeQuery);

const expenseFields = {
  category: z.enum(CATEGORIES),
  amount: z.number().positive().max(1_000_000_000),
  date: dateString,
  note: optionalText(300),
  paid: z.boolean(),
};
export const createExpenseSchema = z.object(expenseFields).partial({ note: true, paid: true });
export const updateExpenseSchema = updateSchema(expenseFields);
export const listExpensesQuery = pageQuery.merge(rangeQuery).extend({
  category: z.enum(CATEGORIES).optional(), paid: boolQuery.optional(), q: z.string().trim().max(80).optional(),
});
