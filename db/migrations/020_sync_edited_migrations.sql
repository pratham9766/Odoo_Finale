-- 020 (Vipul): bring databases migrated with the FIRST versions of 007–011, 015 and 018 up to the edited files.
-- migrate.js never re-runs an applied file, so the edits (constraints, indexes, generated column, FKs, view columns)
-- are applied here. Each block is guarded by an object that only the edited file creates, so on a fresh database
-- (where the edited files already ran) this migration changes nothing.

do $$
begin
  -- ---------- 007 production ----------
  if to_regclass('public.work_orders_order_idx') is null then
    drop index if exists work_orders_org_id_order_id_idx;
    drop index if exists material_issues_org_id_work_order_id_idx;
    drop index if exists production_logs_org_id_machine_id_logged_at_idx;

    alter table machines add constraint machines_capacity_per_hour_check check (capacity_per_hour > 0);
    alter table machines add constraint machines_hourly_overhead_check check (hourly_overhead >= 0);
    alter table work_orders add constraint work_orders_target_qty_check check (target_qty > 0);
    create index work_orders_order_idx on work_orders(org_id, order_id);
    create index work_orders_status_idx on work_orders(org_id, status);
    create index work_orders_machine_idx on work_orders(org_id, machine_id);
    alter table machines drop constraint if exists machines_current_wo_fk;
    alter table machines add constraint machines_current_wo_fk
      foreign key (current_work_order_id) references work_orders(id) on delete set null;
    create index material_issues_wo_idx on material_issues(work_order_id);
    create index material_issues_lot_idx on material_issues(org_id, lot_id);
    create index production_logs_machine_idx on production_logs(org_id, machine_id, logged_at);
    create index production_logs_wo_idx on production_logs(work_order_id);
    create index production_logs_worker_idx on production_logs(org_id, worker_id, logged_at);
    alter table work_order_outputs add constraint work_order_outputs_good_qty_check check (good_qty >= 0);
    alter table work_order_outputs add constraint work_order_outputs_waste_qty_check check (waste_qty >= 0);
    create index work_order_outputs_wo_idx on work_order_outputs(work_order_id);
    create index assignments_machine_idx on assignments(org_id, date, shift_id, machine_id);
    alter table machine_events add constraint machine_events_check check (ended_at is null or ended_at >= started_at);
    create index machine_events_machine_idx on machine_events(org_id, machine_id, started_at);
    create unique index machine_events_one_open on machine_events(machine_id) where ended_at is null;
    alter table maintenance_tickets add constraint maintenance_tickets_priority_check check (priority in ('low','normal','high','urgent'));
    alter table maintenance_tickets add constraint maintenance_tickets_assigned_to_fkey
      foreign key (assigned_to) references memberships(id) on delete set null;
    create index maintenance_tickets_status_idx on maintenance_tickets(org_id, status);
    create index maintenance_tickets_machine_idx on maintenance_tickets(machine_id);
  end if;

  -- ---------- 008 quality ----------
  if to_regclass('public.rolls_status_idx') is null then
    drop index if exists rolls_org_id_order_id_idx;
    alter table rolls add constraint rolls_length_m_check check (length_m > 0);
    create index rolls_order_idx on rolls(org_id, order_id);
    create index rolls_status_idx on rolls(org_id, status);
    create index rolls_wo_idx on rolls(work_order_id);
    create index roll_history_roll_idx on roll_history(roll_id, at);
    create index roll_yarn_lots_lot_idx on roll_yarn_lots(lot_id);
    alter table qc_inspections add constraint qc_inspections_check
      check (not is_override or nullif(btrim(override_reason), '') is not null);
    create index qc_inspections_roll_idx on qc_inspections(roll_id, inspected_at);
    create index qc_inspections_day_idx on qc_inspections(org_id, inspected_at);
  end if;

  -- ---------- 009 gate / dispatch / transport ----------
  if to_regclass('public.dispatches_to_idx') is null then
    alter table dispatches add constraint dispatches_check check (to_org_id is not null or to_contact_id is not null);
    create index dispatches_order_idx on dispatches(from_org_id, order_id);
    create index dispatches_to_idx on dispatches(to_org_id, status);
    create index dispatches_transporter_idx on dispatches(transporter_org_id) where transporter_org_id is not null;
    create index dispatch_rolls_from_idx on dispatch_rolls(from_org_id, dispatch_id);
    create index trips_dispatch_idx on trips(dispatch_id);
    create index trips_transporter_idx on trips(transporter_org_id, status);
    create index trips_requester_idx on trips(requester_org_id, status);
    create index trip_events_trip_idx on trip_events(trip_id, at);
    create index gate_entries_at_idx on gate_entries(org_id, at desc);
    create index gate_entries_vehicle_idx on gate_entries(org_id, vehicle_no, at desc);
  end if;

  -- ---------- 010 workforce ----------
  if to_regclass('public.attendance_date_idx') is null then
    -- crosses_midnight becomes derived from the times
    alter table shifts drop column crosses_midnight;
    alter table shifts add column crosses_midnight boolean generated always as (end_time < start_time) stored;
    alter table shifts add constraint shifts_grace_min_check check (grace_min >= 0);
    alter table shifts add constraint shifts_check check (start_time <> end_time);
    alter table workers add constraint workers_rate_check check (rate >= 0);
    alter table workers add constraint workers_ot_rate_check check (ot_rate >= 0);
    alter table workers add constraint workers_piece_rate_check check (piece_rate >= 0);
    alter table roll_history add constraint rh_shift_fk foreign key (shift_id) references shifts(id);
    alter table roll_history add constraint rh_worker_fk foreign key (worker_id) references workers(id);
    create index attendance_punches_worker_idx on attendance_punches(org_id, worker_id, punched_at);
    alter table attendance add constraint attendance_check check (check_out is null or check_in is null or check_out >= check_in);
    create index attendance_date_idx on attendance(org_id, date, shift_id);
    create index attendance_corrections_status_idx on attendance_corrections(org_id, status);
    alter table leave_requests add constraint leave_requests_check check (to_date >= from_date);
    create index leave_requests_worker_idx on leave_requests(org_id, worker_id, from_date);
    alter table wage_runs add constraint wage_runs_month_check check (extract(day from month) = 1);
    alter table wage_lines add constraint wage_lines_wage_run_id_worker_id_key unique (wage_run_id, worker_id);
    alter table wage_advances add constraint wage_advances_amount_check check (amount > 0);
    alter table wage_advances add constraint wage_advances_recovered_in_run_fkey
      foreign key (recovered_in_run) references wage_runs(id) on delete set null;
    create index wage_advances_open_idx on wage_advances(org_id, worker_id) where recovered_in_run is null;
  end if;

  -- ---------- 011 finance ----------
  if to_regclass('public.invoices_one_sales_per_dispatch') is null then
    alter table invoices add constraint invoices_paid_amount_check check (paid_amount >= 0 and paid_amount <= total);
    alter table invoices add constraint invoices_check check (buyer_org_id is not null or buyer_contact_id is not null);
    create index invoices_seller_idx on invoices(seller_org_id, status);
    create index invoices_buyer_idx on invoices(buyer_org_id, status);
    create index invoices_order_idx on invoices(order_id);
    create index invoices_due_idx on invoices(seller_org_id, due_date) where status in ('unpaid','partial');
    create unique index invoices_one_sales_per_dispatch on invoices(dispatch_id) where kind = 'sales' and status <> 'cancelled';
    create index invoice_lines_invoice_idx on invoice_lines(invoice_id);
    create index payments_invoice_idx on payments(invoice_id);
    alter table expenses add constraint expenses_amount_check check (amount > 0);
    create index expenses_date_idx on expenses(org_id, date);
  end if;

  -- ---------- 018: the first version created two auto-named trips indexes ----------
  drop index if exists trips_transporter_org_id_status_idx;   -- duplicate of trips_transporter_idx
  drop index if exists trips_driver_id_idx;
  if to_regclass('public.trips_driver_idx') is null then
    create index trips_driver_idx on trips(driver_id) where driver_id is not null;
  end if;
end $$;

-- ---------- 015: v_defects_by_cause gained shift and supplier names (columns inserted mid-list → recreate) ----------
drop view if exists v_defects_by_cause;
create view v_defects_by_cause with (security_invoker = true) as
select d.org_id, dt.name as defect, q.inspected_at::date as day,
       rh.machine_id, m.code as machine_code, rh.shift_id, sh.name as shift, r.dye_batch,
       sl.supplier_org_id, coalesce(so.name, sc.name) as supplier, sum(d.count) as defects
from qc_defects d
join defect_types dt on dt.id = d.defect_type_id
join qc_inspections q on q.id = d.inspection_id
join rolls r on r.id = q.roll_id
left join roll_history rh on rh.roll_id = r.id and rh.event = 'woven'
left join machines m on m.id = rh.machine_id
left join shifts sh on sh.id = rh.shift_id
left join roll_yarn_lots ryl on ryl.roll_id = r.id
left join stock_lots sl on sl.id = ryl.lot_id
left join organizations so on so.id = sl.supplier_org_id
left join contacts sc on sc.id = sl.supplier_contact_id
group by d.org_id, dt.name, q.inspected_at::date, rh.machine_id, m.code, rh.shift_id, sh.name, r.dye_batch,
         sl.supplier_org_id, coalesce(so.name, sc.name);

grant select on v_defects_by_cause to app_user, ai_reader;

-- The view now names suppliers, so the AI role (security_invoker) needs organization names: only id + name,
-- and RLS limits rows to the current org and its active partners.
create or replace function app_partner_org_ids() returns setof uuid
language sql security definer set search_path = public stable as $$
  select case when requester_org_id = app_org() then target_org_id else requester_org_id end
    from partnerships
   where status = 'active' and app_org() in (requester_org_id, target_org_id)
$$;
revoke all on function app_partner_org_ids() from public;
grant execute on function app_partner_org_ids() to app_user, ai_reader;

grant select (id, name) on organizations to ai_reader;
drop policy if exists org_ai_ro on organizations;
create policy org_ai_ro on organizations for select to ai_reader
  using (id = app_org() or id in (select app_partner_org_ids()));
