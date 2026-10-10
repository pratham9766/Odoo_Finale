// Monthly profit & loss (reports.pnl 🔒): the 12-month series in the table and the chosen month as a statement.
// Material is costed when it is consumed and wages come from the wage run, so a supplier bill is not counted a second time.

import { z } from 'zod';
import { withTx } from '../../db/tx.js';
import { monthString } from '../../utils/crud/index.js';
import { round2 } from '../../utils/money.js';
import { currentMonth } from '../../utils/time.js';
import { columns, pct } from './support.js';

const COLUMNS = columns(
  ['month', 'Month'], ['revenue', 'Revenue'], ['material', 'Raw material'], ['wages', 'Wages'], ['overhead', 'Machine overhead'],
  ['expenses', 'Expenses'], ['net_profit', 'Net profit'],
);

/** The statement lines of one month, in the order a P&L is read. */
export function statementOf(m) {
  return [
    { line: 'Revenue', amount: m.revenue },
    { line: 'Raw material', amount: -m.material },
    { line: 'Wages', amount: -m.wages },
    { line: 'Machine overhead', amount: -m.overhead },
    { line: 'Expenses', amount: -m.expenses },
    { line: 'Net profit', amount: m.net_profit, total: true },
  ].map((l) => ({ ...l, amount: round2(l.amount) }));
}

export default {
  permission: 'reports.pnl',
  query: z.object({ month: monthString.default(() => currentMonth()) }),
  run: (ctx, { month }) => withTx(async (db) => {
    const { rows } = await db.query(
      `select month, revenue, material, wages, overhead, expenses, net_profit from v_monthly_pnl order by month`);
    const chosen = rows.find((r) => String(r.month).slice(0, 7) === month);
    return {
      month, columns: COLUMNS, rows,
      statement: chosen ? statementOf(chosen) : null,
      margin_pct: chosen ? pct(chosen.net_profit, chosen.revenue) : null,
    };
  }),
};
