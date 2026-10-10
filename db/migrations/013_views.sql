-- 013: reporting views (stock, production, QC, wastage, attendance, wages, order cost, P&L, receivables).

-- Stock
create view v_stock as
select i.id as item_id, i.name, i.kind, i.colour, i.uom, i.reorder_level,
       coalesce(m.on_hand, 0) as on_hand,
       coalesce(r.reserved, 0) as reserved,
       coalesce(m.on_hand, 0) - coalesce(r.reserved, 0) as available,
       (coalesce(m.on_hand, 0) - coalesce(r.reserved, 0)) < i.reorder_level as is_low
from items i
left join (select item_id, sum(qty) as on_hand from stock_movements group by item_id) m on m.item_id = i.id
left join (select item_id, sum(qty) as reserved from reservations where status = 'active' group by item_id) r on r.item_id = i.id
where i.active;

create view v_low_stock as
select * from v_stock where is_low;

create view v_finished_stock as
select r.id as roll_id, r.roll_no, r.order_id, o.order_no, r.item_id, i.name as item_name,
       i.colour, r.length_m, r.dye_batch, r.created_at,
       extract(day from now() - r.created_at)::int as days_on_shelf
from rolls r join orders o on o.id = r.order_id join items i on i.id = r.item_id
where r.status in ('passed','packed');

-- Production, QC, wastage
create view v_machine_board as
select m.id as machine_id, m.code, m.status, m.status_since, s.name as stage, s.sequence,
       wo.id as work_order_id, wo.wo_no, o.order_no, wo.target_qty, wo.produced_qty,
       round(100 * wo.produced_qty / nullif(wo.target_qty, 0), 1) as pct,
       (select coalesce(sum(pl.qty), 0) from production_logs pl
         where pl.machine_id = m.id and pl.logged_at >= date_trunc('day', now())) as today_qty
from machines m
join stages s on s.id = m.stage_id
left join work_orders wo on wo.id = m.current_work_order_id
left join orders o on o.id = wo.order_id
where m.active;

create view v_production_daily as
select pl.machine_id, m.code, date_trunc('day', pl.logged_at)::date as day,
       pl.shift_id, sum(pl.qty) as qty, sum(pl.run_minutes) / 60.0 as run_hours
from production_logs pl join machines m on m.id = pl.machine_id
group by 1, 2, 3, 4;

create view v_qc_summary as
select date_trunc('day', q.inspected_at)::date as day, r.work_order_id,
       count(*) filter (where q.result = 'pass')   as passed,
       count(*) filter (where q.result = 'rework') as rework,
       count(*) filter (where q.result = 'reject') as rejected,
       count(*) as total
from qc_inspections q join rolls r on r.id = q.roll_id
where not q.is_override
group by 1, 2;

create view v_defects_by_cause as
select dt.name as defect, q.inspected_at::date as day,
       rh.machine_id, m.code as machine_code, rh.shift_id, sh.name as shift, r.dye_batch,
       sl.supplier_contact_id, sc.name as supplier, sum(d.count) as defects
from qc_defects d
join defect_types dt on dt.id = d.defect_type_id
join qc_inspections q on q.id = d.inspection_id
join rolls r on r.id = q.roll_id
left join roll_history rh on rh.roll_id = r.id and rh.event = 'woven'
left join machines m on m.id = rh.machine_id
left join shifts sh on sh.id = rh.shift_id
left join roll_yarn_lots ryl on ryl.roll_id = r.id
left join stock_lots sl on sl.id = ryl.lot_id
left join contacts sc on sc.id = sl.supplier_contact_id
group by dt.name, q.inspected_at::date, rh.machine_id, m.code, rh.shift_id, sh.name, r.dye_batch,
         sl.supplier_contact_id, sc.name;

create view v_wastage as
select wo.id as work_order_id, wo.wo_no, wo.order_id, wo.stage_id, s.name as stage,
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

-- Workforce
create view v_worker_hourly_cost as
select w.id as worker_id,
       case w.wage_type when 'daily' then w.rate / 8.0 when 'hourly' then w.rate else 0 end as hourly_cost,
       w.piece_rate
from workers w;

create view v_attendance_daily as
select a.date, a.shift_id, sh.name as shift, w.stage_id,
       count(*) filter (where a.status in ('present','late','half_day')) as present,
       count(*) filter (where a.status = 'absent') as absent,
       count(*) filter (where a.status = 'late') as late,
       count(*) filter (where a.status = 'leave') as on_leave,
       sum(a.ot_hours) as ot_hours
from attendance a join workers w on w.id = a.worker_id join shifts sh on sh.id = a.shift_id
group by 1, 2, 3, 4;

create view v_wages_monthly as
select wr.month, wr.status, wl.worker_id, w.name, w.wage_type,
       wl.days, wl.hours, wl.ot_hours, wl.pieces, wl.gross, wl.deductions, wl.net
from wage_runs wr join wage_lines wl on wl.wage_run_id = wr.id join workers w on w.id = wl.worker_id;

-- Order cost and P&L
create view v_order_cost as
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
revenue as (
  select order_id, sum(subtotal) as revenue from invoices where status <> 'cancelled' group by 1)
select o.id as order_id, o.order_no, o.status,
       coalesce(r.revenue, 0) as revenue,
       coalesce(ma.material_cost, 0) as material_cost,
       coalesce(l.labour_cost, 0) as labour_cost,
       coalesce(mc.machine_cost, 0) as machine_cost,
       -- shown as a breakdown line; already inside material + labour + machine
       round((coalesce(ma.material_cost,0) + coalesce(l.labour_cost,0) + coalesce(mc.machine_cost,0))
             * coalesce(ra.rejected_m, 0) / nullif(ra.produced_m, 0), 2) as reject_loss,
       coalesce(ma.material_cost,0) + coalesce(l.labour_cost,0) + coalesce(mc.machine_cost,0) as total_cost,
       coalesce(r.revenue,0) - (coalesce(ma.material_cost,0) + coalesce(l.labour_cost,0)
         + coalesce(mc.machine_cost,0)) as profit
from orders o
left join material ma on ma.order_id = o.id
left join labour l on l.order_id = o.id
left join machine mc on mc.order_id = o.id
left join rolls_agg ra on ra.order_id = o.id
left join revenue r on r.order_id = o.id;

create view v_monthly_pnl as
with months as (select generate_series(date_trunc('month', now()) - interval '11 months',
                                       date_trunc('month', now()), interval '1 month')::date as month),
rev as (select date_trunc('month', invoice_date)::date m, sum(subtotal) v from invoices
        where status <> 'cancelled' group by 1),
mat as (select date_trunc('month', created_at)::date m, sum(qty * unit_cost) v from material_issues group by 1),
wag as (select month m, sum(total_gross) v from wage_runs group by 1),
ovh as (select date_trunc('month', pl.logged_at)::date m, sum(pl.run_minutes / 60.0 * mc.hourly_overhead) v
        from production_logs pl join machines mc on mc.id = pl.machine_id group by 1),
-- supplier bills are left out: material cost is counted when it is consumed (mat)
exp as (select date_trunc('month', date)::date m, sum(amount) v from expenses
        where category <> 'supplier_bill' group by 1)
select mo.month,
       coalesce(rev.v,0) revenue, coalesce(mat.v,0) material, coalesce(wag.v,0) wages,
       coalesce(ovh.v,0) overhead, coalesce(exp.v,0) expenses,
       coalesce(rev.v,0) - coalesce(mat.v,0) - coalesce(wag.v,0) - coalesce(ovh.v,0) - coalesce(exp.v,0) as net_profit
from months mo
left join rev on rev.m = mo.month left join mat on mat.m = mo.month left join wag on wag.m = mo.month
left join ovh on ovh.m = mo.month left join exp on exp.m = mo.month;

create view v_receivables as
select id as invoice_id, invoice_no, buyer_contact_id, total, paid_amount,
       total - paid_amount as outstanding, due_date, (due_date < current_date) as overdue,
       current_date - due_date as days_overdue
from invoices where status in ('unpaid','partial');
