-- 007: machines, work orders, material issues, production logs, outputs, assignments,
-- machine events (breakdowns) and maintenance tickets.
-- shift_id / worker_id foreign keys are added in 010 once shifts and workers exist.

create table machines (
  id uuid primary key default gen_random_uuid(),
  code text not null unique, name text,
  stage_id uuid not null references stages(id),
  capacity_per_hour numeric(12,3) not null check (capacity_per_hour > 0), capacity_uom text not null,
  hourly_overhead numeric(12,2) not null default 0 check (hourly_overhead >= 0),
  status text not null default 'idle' check (status in ('idle','running','breakdown','maintenance')),
  status_since timestamptz not null default now(),
  current_work_order_id uuid,                     -- fk added below, after work_orders
  active boolean not null default true
);

create table work_orders (
  id uuid primary key default gen_random_uuid(),
  wo_no text not null unique,
  order_id uuid not null references orders(id),
  order_line_id uuid not null references order_lines(id),
  stage_id uuid not null references stages(id),
  output_item_id uuid not null references items(id),
  machine_id uuid references machines(id),
  target_qty numeric(14,3) not null check (target_qty > 0), uom text not null,
  produced_qty numeric(14,3) not null default 0,
  waste_qty numeric(14,3) not null default 0,
  is_rework boolean not null default false,
  parent_work_order_id uuid references work_orders(id),
  status text not null default 'planned' check (status in ('planned','running','paused','done','cancelled')),
  planned_start timestamptz, started_at timestamptz, finished_at timestamptz,
  created_at timestamptz not null default now(), created_by uuid
);
create index work_orders_order_idx on work_orders(order_id);
create index work_orders_status_idx on work_orders(status);
create index work_orders_machine_idx on work_orders(machine_id);

alter table machines add constraint machines_current_wo_fk
  foreign key (current_work_order_id) references work_orders(id) on delete set null;

create table material_issues (
  id uuid primary key default gen_random_uuid(),
  work_order_id uuid not null references work_orders(id),
  lot_id uuid not null references stock_lots(id),
  item_id uuid not null references items(id),
  qty numeric(14,3) not null check (qty > 0),
  unit_cost numeric(14,4) not null,
  created_at timestamptz not null default now(), created_by uuid
);
create index material_issues_wo_idx on material_issues(work_order_id);
create index material_issues_lot_idx on material_issues(lot_id);   -- lot → work orders (trace)

create table production_logs (
  id uuid primary key default gen_random_uuid(),
  work_order_id uuid not null references work_orders(id),
  machine_id uuid not null references machines(id),
  shift_id uuid not null,                     -- fk in 010
  worker_id uuid,                             -- fk in 010
  qty numeric(14,3) not null check (qty > 0),
  run_minutes int not null default 0 check (run_minutes >= 0),
  logged_at timestamptz not null default now(), created_by uuid
);
create index production_logs_machine_idx on production_logs(machine_id, logged_at);
create index production_logs_wo_idx on production_logs(work_order_id);
create index production_logs_worker_idx on production_logs(worker_id, logged_at);  -- piece wages

create table work_order_outputs (
  id uuid primary key default gen_random_uuid(),
  work_order_id uuid not null references work_orders(id),
  good_qty numeric(14,3) not null check (good_qty >= 0), good_weight_kg numeric(14,3),
  waste_qty numeric(14,3) not null default 0 check (waste_qty >= 0), waste_item_id uuid references items(id),
  waste_type text,
  created_at timestamptz not null default now(), created_by uuid
);
create index work_order_outputs_wo_idx on work_order_outputs(work_order_id);

create table assignments (
  id uuid primary key default gen_random_uuid(),
  date date not null, shift_id uuid not null,   -- fk in 010
  worker_id uuid not null,                      -- fk in 010
  machine_id uuid not null references machines(id),
  created_at timestamptz not null default now(), created_by uuid,
  unique (date, shift_id, worker_id)
);
create index assignments_machine_idx on assignments(date, shift_id, machine_id);  -- default worker for a log

create table machine_events (
  id uuid primary key default gen_random_uuid(),
  machine_id uuid not null references machines(id),
  status text not null check (status in ('idle','running','breakdown','maintenance')),
  reason text,
  started_at timestamptz not null default now(), ended_at timestamptz,
  created_by uuid,
  check (ended_at is null or ended_at >= started_at)
);
create index machine_events_machine_idx on machine_events(machine_id, started_at);
-- at most one open event per machine: close the previous event before opening the next
create unique index machine_events_one_open on machine_events(machine_id) where ended_at is null;

create table maintenance_tickets (
  id uuid primary key default gen_random_uuid(),
  ticket_no text not null unique,
  machine_id uuid not null references machines(id),
  machine_event_id uuid references machine_events(id),
  reason text not null,
  priority text not null default 'high' check (priority in ('low','normal','high','urgent')),
  assigned_to uuid references profiles(id) on delete set null,   -- who fixes it
  status text not null default 'open' check (status in ('open','in_progress','resolved')),
  resolution text, parts_used text,
  opened_at timestamptz not null default now(), resolved_at timestamptz,
  created_by uuid
);
create index maintenance_tickets_status_idx on maintenance_tickets(status);
create index maintenance_tickets_machine_idx on maintenance_tickets(machine_id);
