// Aggregate numbers for the login screen's preview (no login yet, so counts only: no names, prices or people).
import { withTx } from '../../db/tx.js';
import { TZ } from '../../utils/time.js';

const DAYS = 14;

const change = (now, before) => (before > 0 ? Math.round(((now - before) / before) * 100) : null);

export const millStats = () =>
  withTx(async (db) => {
    const { rows: stages } = await db.query(
      `select s.name, count(m.id)::int as total, count(m.id) filter (where m.status = 'running')::int as running
         from stages s left join machines m on m.stage_id = s.id and m.active
        group by s.id order by s.sequence`);

    const { rows: [c] } = await db.query(
      `select (select count(*)::int from v_stock where on_hand > 0) as skus_in_stock,
              (select count(*)::int from v_low_stock) as low_stock,
              (select count(*)::int from orders where status in ('draft','confirmed','waiting_material','material_ready','in_production','in_qc','ready_to_ship','partially_dispatched')) as open_orders,
              (select count(*)::int from orders where created_at >= now() - interval '7 days') as orders_this_week,
              (select count(*)::int from orders where created_at >= now() - interval '14 days' and created_at < now() - interval '7 days') as orders_last_week,
              (select coalesce(sum(qty), 0)::float from production_logs where logged_at >= now() - interval '7 days') as output_this_week,
              (select coalesce(sum(qty), 0)::float from production_logs where logged_at >= now() - interval '14 days' and logged_at < now() - interval '7 days') as output_last_week`);

    const { rows: output } = await db.query(
      `select s.name as label, to_char(d, 'YYYY-MM-DD') as day, coalesce(sum(pl.qty), 0)::float as qty
         from stages s
         cross join generate_series((now() at time zone '${TZ}')::date - ($1::int - 1), (now() at time zone '${TZ}')::date, interval '1 day') d
         left join machines m on m.stage_id = s.id
         left join production_logs pl on pl.machine_id = m.id and (pl.logged_at at time zone '${TZ}')::date = d::date
        group by s.id, s.name, s.sequence, d order by s.sequence, d`, [DAYS]);
    const { rows: placed } = await db.query(
      `select coalesce(count(o.id), 0)::int as qty
         from generate_series((now() at time zone '${TZ}')::date - ($1::int - 1), (now() at time zone '${TZ}')::date, interval '1 day') d
         left join orders o on (o.created_at at time zone '${TZ}')::date = d::date
        group by d order by d`, [DAYS]);

    const series = [...new Set(output.map((r) => r.label))].map((label) => ({ label, values: output.filter((r) => r.label === label).map((r) => r.qty) }));
    series.push({ label: 'Orders placed', values: placed.map((r) => r.qty) });

    return {
      active_lines: stages.reduce((t, s) => t + s.running, 0),
      skus_in_stock: c.skus_in_stock,
      low_stock: c.low_stock,
      open_orders: c.open_orders,
      output_change_pct: change(c.output_this_week, c.output_last_week),
      orders_change_pct: change(c.orders_this_week, c.orders_last_week),
      stages: stages.map((s) => ({ name: s.name, running: s.running, total: s.total, pct: s.total ? Math.round((s.running / s.total) * 100) : 0 })),
      series,
    };
  });
