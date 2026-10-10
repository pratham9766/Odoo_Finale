// Expenses (backend plan §10.11): power, rent, staff salaries, maintenance, other costs, and bills from offline suppliers
// (those are created as drafts when a GRN is posted and count as payables; the P&L leaves them out because material is costed when consumed).

import { createCrud } from '../../utils/crud/index.js';

export const CATEGORIES = ['power', 'maintenance', 'rent', 'salary_staff', 'supplier_bill', 'freight', 'other'];

export const expenses = createCrud({
  table: 'expenses', label: 'Expense',
  columns: ['category', 'amount', 'date', 'note', 'paid'],
  orderBy: 't.date desc, t.created_at desc',
  filters: (f, q) => {
    f.eq('t.category', q.category).eq('t.paid', q.paid).search(['t.note'], q.q);
    if (q.from) f.where('t.date >= ?', q.from);
    if (q.to) f.where('t.date <= ?', q.to);
  },
});
