// Finance module: invoices (from dispatches), payments from buyers, expenses (incl. supplier bills).
//   GET  /invoices?status=                     invoice.view
//   GET  /invoices/:id[/pdf]                   invoice.view
//   POST /invoices/from-dispatch/:id           invoice.create   (confirming a dispatch normally does this)
//   GET/POST /payments                         invoice.view / payment.record
//   CRUD /expenses                             expense.manage
//   GET  /finance/receivables | /payables      invoice.view

import { Router } from 'express';
import { can, requireModule } from '../../middleware/rbac.js';
import { validate } from '../../middleware/validate.js';
import { crudHandlers, idParams, mountCrud } from '../../utils/crud/index.js';
import * as finance from './finance.controller.js';
import * as s from './finance.schema.js';
import { expenses } from './expenses.service.js';
import * as invoices from './invoices.controller.js';

const r = Router();
r.use(['/invoices', '/payments', '/expenses', '/finance'], requireModule('finance'));

r.get('/invoices', can('invoice.view'), validate({ query: s.listInvoicesQuery }), invoices.list);
r.post('/invoices/from-dispatch/:id', can('invoice.create'), validate({ params: idParams }), invoices.fromDispatch);
r.get('/invoices/:id', can('invoice.view'), validate({ params: idParams }), invoices.get);
r.get('/invoices/:id/pdf', can('invoice.view'), validate({ params: idParams }), invoices.invoicePdf);

r.get('/payments', can('payment.view', 'invoice.view'), validate({ query: s.listPaymentsQuery }), finance.listPaymentsHandler);
r.post('/payments', can('payment.create'), validate({ body: s.paymentSchema }), finance.record);

mountCrud(r, '/expenses', {
  handlers: crudHandlers(expenses),
  read: [can('expense.view')], create: [can('expense.create')], update: [can('expense.update')], remove: [can('expense.delete')],
  schemas: { list: s.listExpensesQuery, create: s.createExpenseSchema, update: s.updateExpenseSchema },
});

r.get('/finance/receivables', can('invoice.view'), finance.getReceivables);
r.get('/finance/payables', can('invoice.view'), finance.getPayables);

export default r;
