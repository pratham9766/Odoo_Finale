// Numbers for the Orders page header: KPI counts over ALL orders (not just the page on screen), how each one moved
// against last month, an 8-week sparkline per KPI, the order-health split, and what is leaving today.
import { withTx } from '../../db/tx.js';
import { TZ } from '../../utils/time.js';

const WEEKS = 8;

// one definition of each KPI bucket, used for the counts, the trend and the sparkline
export const BUCKETS = {
  open: `o.status in ('draft','confirmed','waiting_material','material_ready')`,
  in_production: `o.status in ('in_production','in_qc')`,
  ready_to_dispatch: `o.status in ('ready_to_ship','partially_dispatched')`,
  delayed: `(o.status not in ('draft','dispatched','delivered','closed','cancelled') and (o.risk = 'red' or o.deadline < (now() at time zone '${TZ}')::date))`,
};

const trendOf = (current, previous) => (previous > 0 ? Math.round(((current - previous) / previous) * 100) : null);

export const ordersSummary = () =>
  withTx(async (db) => {
    const kpiSql = Object.entries(BUCKETS).flatMap(([key, cond]) => [
      `count(*) filter (where ${cond})::int as ${key}`,
      `count(*) filter (where ${cond} and o.created_at >= date_trunc('month', now() at time zone '${TZ}')) ::int as ${key}_this_month`,
      `count(*) filter (where ${cond} and o.created_at >= date_trunc('month', now() at time zone '${TZ}') - interval '1 month'
                                     and o.created_at <  date_trunc('month', now() at time zone '${TZ}'))::int as ${key}_last_month`,
    ]).join(',\n');
    const { rows: [k] } = await db.query(`select ${kpiSql} from orders o`);

    // orders placed per week over the last WEEKS weeks, split by the KPI bucket they are in now
    const weekSql = Object.entries(BUCKETS).map(([key, cond]) => `count(o.id) filter (where ${cond})::int as ${key}`).join(', ');
    const { rows: weeks } = await db.query(
      `select to_char(w, 'YYYY-MM-DD') as week_start, ${weekSql}
         from generate_series(date_trunc('week', now() at time zone '${TZ}') - ($1::int - 1) * interval '1 week',
                              date_trunc('week', now() at time zone '${TZ}'), interval '1 week') w
         left join orders o on date_trunc('week', o.created_at at time zone '${TZ}') = w
        group by w order by w`, [WEEKS]);

    const { rows: [h] } = await db.query(
      `select count(*)::int as total,
              count(*) filter (where o.risk = 'red' or ${BUCKETS.delayed})::int as red,
              count(*) filter (where o.risk = 'amber' and not ${BUCKETS.delayed})::int as amber
         from orders o where o.status not in ('draft','dispatched','delivered','closed','cancelled')`);

    const { rows: leaving } = await db.query(
      `select o.id, o.order_no, c.name as buyer_name, d.dispatch_no, d.status as dispatch_status,
              (select coalesce(sum(dr.length_m), 0) from dispatch_rolls dr where dr.dispatch_id = d.id) as qty,
              (select i.name from order_lines l join items i on i.id = l.item_id where l.order_id = o.id order by l.qty desc limit 1) as fabric_name
         from dispatches d join orders o on o.id = d.order_id left join contacts c on c.id = d.to_contact_id
        where d.status in ('packing','confirmed','in_transit')
          and (coalesce(d.confirmed_at, d.created_at) at time zone '${TZ}')::date = (now() at time zone '${TZ}')::date
        order by d.created_at desc`);

    const kpis = Object.fromEntries(Object.keys(BUCKETS).map((key) => [key, {
      value: k[key],
      this_month: k[`${key}_this_month`],
      last_month: k[`${key}_last_month`],
      change_pct: trendOf(k[`${key}_this_month`], k[`${key}_last_month`]),
      weekly: weeks.map((w) => w[key]),
    }]));

    return {
      kpis,
      health: { total: h.total, red: h.red, amber: h.amber, green: Math.max(0, h.total - h.red - h.amber) },
      dispatch_today: { count: leaving.length, total_qty: leaving.reduce((t, r) => t + Number(r.qty), 0), items: leaving.slice(0, 3) },
    };
  });
