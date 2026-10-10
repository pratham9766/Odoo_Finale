-- 015: reporting views (security_invoker so RLS applies to the caller)
-- owner: Hrishikesh (initial version extracted from docs/02_BACKEND_EXECUTION.md §7)

create view v_stock with (security_invoker = true) as
select i.org_id, i.id as item_id, i.name, i.kind, i.colour, i.uom, i.reorder_level,
       coalesce(m.on_hand, 0) as on_hand,
       coalesce(r.reserved, 0) as reserved,
       coalesce(m.on_hand, 0) - coalesce(r.reserved, 0) as available,
       (coalesce(m.on_hand, 0) - coalesce(r.reserved, 0)) < i.reorder_level as is_low
from items i
left join (select item_id, sum(qty) as on_hand from stock_movements group by item_id) m on m.item_id = i.id
left join (select item_id, sum(qty) as reserved from reservations where status = 'active' group by item_id) r on r.item_id = i.id
where i.active;

create view v_low_stock with (security_invoker = true) as
select * from v_stock where is_low;

create view v_stock_days_left with (security_invoker = true) as
select s.*, round(s.available / nullif(c.avg_daily, 0), 1) as days_left
from v_stock s
left join (select item_id, sum(-qty) / 30.0 as avg_daily
           from stock_movements where type = 'consume' and created_at > now() - interval '30 days'
           group by item_id) c on c.item_id = s.item_id;

create view v_finished_stock with (security_invoker = true) as
select r.org_id, r.id as roll_id, r.roll_no, r.order_id, o.order_no, r.item_id, i.name as item_name,
       i.colour, r.length_m, r.dye_batch, r.created_at,
       extract(day from now() - r.created_at)::int as days_on_shelf
from rolls r join orders o on o.id = r.order_id join items i on i.id = r.item_id
where r.status in ('passed','packed');

create view v_machine_board with (security_invoker = true) as
select m.org_id, m.id as machine_id, m.code, m.status, m.status_since, s.name as stage, s.sequence,
       wo.id as work_order_id, wo.wo_no, o.order_no, wo.target_qty, wo.produced_qty,
       round(100 * wo.produced_qty / nullif(wo.target_qty, 0), 1) as pct,
       (select coalesce(sum(pl.qty), 0) from production_logs pl
         where pl.machine_id = m.id and pl.logged_at >= date_trunc('day', now())) as today_qty
from machines m
join stages s on s.id = m.stage_id
left join work_orders wo on wo.id = m.current_work_order_id
left join orders o on o.id = wo.order_id
where m.active;

create view v_production_daily with (security_invoker = true) as
select pl.org_id, pl.machine_id, m.code, date_trunc('day', pl.logged_at)::date as day,
       pl.shift_id, sum(pl.qty) as qty, sum(pl.run_minutes) / 60.0 as run_hours
from production_logs pl join machines m on m.id = pl.machine_id
group by 1, 2, 3, 4, 5;

create view v_qc_summary with (security_invoker = true) as
select q.org_id, date_trunc('day', q.inspected_at)::date as day, r.work_order_id,
       count(*) filter (where q.result = 'pass')   as passed,
       count(*) filter (where q.result = 'rework') as rework,
       count(*) filter (where q.result = 'reject') as rejected,
       count(*) as total
from qc_inspections q join rolls r on r.id = q.roll_id
where not q.is_override
group by 1, 2, 3;

create view v_defects_by_cause with (security_invoker = true) as
select d.org_id, dt.name as defect, q.inspected_at::date as day,
       rh.machine_id, m.code as machine_code, rh.shift_id, r.dye_batch,
       sl.supplier_org_id, sum(d.count) as defects
from qc_defects d
join defect_types dt on dt.id = d.defect_type_id
join qc_inspections q on q.id = d.inspection_id
join rolls r on r.id = q.roll_id
left join roll_history rh on rh.roll_id = r.id and rh.event = 'woven'
left join machines m on m.id = rh.machine_id
left join roll_yarn_lots ryl on ryl.roll_id = r.id
left join stock_lots sl on sl.id = ryl.lot_id
group by 1, 2, 3, 4, 5, 6, 7, 8;

create view v_wastage with (security_invoker = true) as
select wo.org_id, wo.id as work_order_id, wo.wo_no, wo.order_id, wo.stage_id, s.name as stage,
       wo.machine_id, mi.input_qty, out.good_qty, out.waste_qty,
       round(100 * (1 - out.good_weight / nullif(mi.input_qty, 0)), 2) as actual_waste_pct,
       sl.weight_loss_pct as planned_waste_pct
from work_orders wo
join stages s on s.id = wo.stage_id
left join stage_losses sl on sl.stage_id = wo.stage_id
left join (select work_order_id, sum(qty) as input_qty from material_issues group by 1) mi on mi.work_order_id = wo.id
left join (select work_order_id, sum(good_qty) as good_qty, sum(coalesce(good_weight_kg, good_qty)) as good_weight,
                  sum(waste_qty) as waste_qty from work_order_outputs group by 1) out on out.work_order_id = wo.id
where wo.status = 'done';

create view v_worker_hourly_cost with (security_invoker = true) as
select w.org_id, w.id as worker_id,
       case w.wage_type when 'daily' then w.rate / 8.0 when 'hourly' then w.rate else 0 end as hourly_cost,
       w.piece_rate
from workers w;

create view v_attendance_daily with (security_invoker = true) as
select a.org_id, a.date, a.shift_id, sh.name as shift, w.stage_id,
       count(*) filter (where a.status in ('present','late','half_day')) as present,
       count(*) filter (where a.status = 'absent') as absent,
       count(*) filter (where a.status = 'late') as late,
       count(*) filter (where a.status = 'leave') as on_leave,
       sum(a.ot_hours) as ot_hours
from attendance a join workers w on w.id = a.worker_id join shifts sh on sh.id = a.shift_id
group by 1, 2, 3, 4, 5;

create view v_wages_monthly with (security_invoker = true) as
select wr.org_id, wr.month, wr.status, wl.worker_id, w.name, w.wage_type,
       wl.days, wl.hours, wl.ot_hours, wl.pieces, wl.gross, wl.advances, wl.deductions, wl.net
from wage_runs wr join wage_lines wl on wl.wage_run_id = wr.id join workers w on w.id = wl.worker_id;

create view v_order_cost with (security_invoker = true) as
with
material as (
  select wo.order_id, sum(mi.qty * mi.unit_cost) as material_cost
  from material_issues mi join work_orders wo on wo.id = mi.work_order_id group by 1),
labour as (
  select wo.order_id,
         sum(pl.run_minutes / 60.0 * hc.hourly_cost + pl.qty * hc.piece_rate) as labour_cost
  from production_logs pl join work_orders wo on wo.id = pl.work_order_id
  left join v_worker_hourly_cost hc on hc.worker_id = pl.worker_id group by 1),
machine as (
  select wo.order_id, sum(pl.run_minutes / 60.0 * m.hourly_overhead) as machine_cost
  from production_logs pl join work_orders wo on wo.id = pl.work_order_id
  join machines m on m.id = pl.machine_id group by 1),
rolls_agg as (
  select order_id, sum(length_m) as produced_m,
         sum(length_m) filter (where status = 'rejected') as rejected_m
  from rolls group by 1),
freight as (
  select order_id, sum(total) as freight_cost from invoices where kind = 'freight' group by 1),
revenue as (
  select order_id, sum(subtotal) as revenue from invoices where kind = 'sales' and status <> 'cancelled' group by 1)
select o.seller_org_id as org_id, o.id as order_id, o.order_no, o.status,
       coalesce(r.revenue, 0) as revenue,
       coalesce(ma.material_cost, 0) as material_cost,
       coalesce(l.labour_cost, 0) as labour_cost,
       coalesce(mc.machine_cost, 0) as machine_cost,
       coalesce(f.freight_cost, 0) as freight_cost,
       round((coalesce(ma.material_cost,0) + coalesce(l.labour_cost,0) + coalesce(mc.machine_cost,0))
             * coalesce(ra.rejected_m, 0) / nullif(ra.produced_m, 0), 2) as reject_loss,
       coalesce(ma.material_cost,0) + coalesce(l.labour_cost,0) + coalesce(mc.machine_cost,0)
         + coalesce(f.freight_cost,0) as total_cost,
       coalesce(r.revenue,0) - (coalesce(ma.material_cost,0) + coalesce(l.labour_cost,0)
         + coalesce(mc.machine_cost,0) + coalesce(f.freight_cost,0)) as profit
from orders o
left join material ma on ma.order_id = o.id
left join labour l on l.order_id = o.id
left join machine mc on mc.order_id = o.id
left join rolls_agg ra on ra.order_id = o.id
left join freight f on f.order_id = o.id
left join revenue r on r.order_id = o.id
where o.seller_org_id = app_org();

create view v_monthly_pnl with (security_invoker = true) as
with months as (select generate_series(date_trunc('month', now()) - interval '11 months',
                                       date_trunc('month', now()), interval '1 month')::date as month),
rev as (select date_trunc('month', invoice_date)::date m, sum(subtotal) v from invoices
        where kind = 'sales' and seller_org_id = app_org() and status <> 'cancelled' group by 1),
mat as (select date_trunc('month', created_at)::date m, sum(qty * unit_cost) v from material_issues group by 1),
wag as (select month m, sum(total_gross) v from wage_runs group by 1),
ovh as (select date_trunc('month', pl.logged_at)::date m, sum(pl.run_minutes / 60.0 * mc.hourly_overhead) v
        from production_logs pl join machines mc on mc.id = pl.machine_id group by 1),
frt as (select date_trunc('month', invoice_date)::date m, sum(total) v from invoices
        where kind = 'freight' and buyer_org_id = app_org() group by 1),
exp as (select date_trunc('month', date)::date m, sum(amount) v from expenses
        where category <> 'supplier_bill' group by 1)
select app_org() as org_id, mo.month,
       coalesce(rev.v,0) revenue, coalesce(mat.v,0) material, coalesce(wag.v,0) wages,
       coalesce(ovh.v,0) overhead, coalesce(frt.v,0) freight, coalesce(exp.v,0) expenses,
       coalesce(rev.v,0) - coalesce(mat.v,0) - coalesce(wag.v,0) - coalesce(ovh.v,0)
         - coalesce(frt.v,0) - coalesce(exp.v,0) as net_profit
from months mo
left join rev on rev.m = mo.month left join mat on mat.m = mo.month left join wag on wag.m = mo.month
left join ovh on ovh.m = mo.month left join frt on frt.m = mo.month left join exp on exp.m = mo.month;

create view v_receivables with (security_invoker = true) as
select seller_org_id as org_id, id as invoice_id, invoice_no, buyer_org_id, buyer_contact_id, total, paid_amount,
       total - paid_amount as outstanding, due_date, (due_date < current_date) as overdue,
       current_date - due_date as days_overdue
from invoices where seller_org_id = app_org() and status in ('unpaid','partial');

create view v_payables with (security_invoker = true) as
select buyer_org_id as org_id, id as invoice_id, invoice_no, kind, seller_org_id, total, paid_amount,
       total - paid_amount as outstanding, due_date, (due_date < current_date) as overdue
from invoices where buyer_org_id = app_org() and status in ('unpaid','partial');

create view v_order_progress with (security_invoker = true) as
select o.seller_org_id as org_id, o.id as order_id, o.order_no, o.buyer_org_id, o.status, o.progress_pct,
       o.current_stage, o.deadline, o.expected_completion, o.risk
from orders o;

create view v_trip_status with (security_invoker = true) as
select t.id as trip_id, t.trip_no, t.status, t.dispatch_id, t.transporter_org_id, t.requester_org_id,
       t.receiver_org_id, t.eta, t.delivered_at
from trips t;

