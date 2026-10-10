// Cost per order (reports.cost 🔒): revenue, material, labour, machine, freight, profit and margin for each order (v_order_cost).

import { withTx } from '../../db/tx.js';
import { rangeQuery } from '../../utils/crud/index.js';
import { reportRange } from '../../utils/time.js';
import { columns, pct, totalsOf } from './support.js';

const COLUMNS = columns(
  ['order_no', 'Order'], ['buyer', 'Buyer'], ['status', 'Status'], ['order_date', 'Order date'], ['revenue', 'Revenue'],
  ['material_cost', 'Material'], ['labour_cost', 'Labour'], ['machine_cost', 'Machine'], ['reject_loss', 'Reject loss (inside the costs)'],
  ['total_cost', 'Total cost'], ['profit', 'Profit'], ['margin_pct', 'Margin %'],
);
const MONEY = ['revenue', 'material_cost', 'labour_cost', 'machine_cost', 'total_cost', 'profit'];

export default {
  permission: 'reports.cost',
  query: rangeQuery,
  run: (ctx, query) => {
    const { from, to } = reportRange(query);
    return withTx(async (db) => {
      const { rows } = await db.query(
        `select c.order_no, bc.name as buyer, c.status, o.order_date, c.revenue, c.material_cost, c.labour_cost, c.machine_cost,
                c.reject_loss, c.total_cost, c.profit
           from v_order_cost c join orders o on o.id = c.order_id
           left join contacts bc on bc.id = o.buyer_contact_id
          where o.order_date between $1 and $2 order by c.profit desc, c.order_no`, [from, to]);
      const withMargin = rows.map((r) => ({ ...r, margin_pct: pct(r.profit, r.revenue) }));
      const totals = totalsOf(withMargin, MONEY);
      return { period: { from, to }, columns: COLUMNS, rows: withMargin, totals: { ...totals, margin_pct: pct(totals.profit, totals.revenue) } };
    });
  },
};
