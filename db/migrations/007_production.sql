-- 007: machines, work orders, production, maintenance
-- owner: Hrishikesh (initial version copied from docs/02_BACKEND_EXECUTION.md §5.7)
create table machines (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  code text not null, name text,
  stage_id uuid not null references stages(id),
  capacity_per_hour numeric(12,3) not null, capacity_uom text not null,
  hourly_overhead numeric(12,2) not null default 0,
  status text not null default 'idle' check (status in ('idle','running','breakdown','maintenance')),
  status_since timestamptz not null default now(),
  current_work_order_id uuid,
  active boolean not null default true,
  unique (org_id, code)
);

create table work_orders (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  wo_no text not null,
  order_id uuid not null references orders(id),
  order_line_id uuid not null references order_lines(id),
  stage_id uuid not null references stages(id),
  output_item_id uuid not null references items(id),
  machine_id uuid references machines(id),
  target_qty numeric(14,3) not null, uom text not null,
  produced_qty numeric(14,3) not null default 0,
  waste_qty numeric(14,3) not null default 0,
  is_rework boolean not null default false,
  parent_work_order_id uuid references work_orders(id),
  status text not null default 'planned' check (status in ('planned','running','paused','done','cancelled')),
  planned_start timestamptz, started_at timestamptz, finished_at timestamptz,
  created_at timestamptz not null default now(), created_by uuid,
  unique (org_id, wo_no)
);
create index on work_orders(org_id, order_id);

alter table machines add constraint machines_current_wo_fk foreign key (current_work_order_id) references work_orders(id);

create table material_issues (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  work_order_id uuid not null references work_orders(id),
  lot_id uuid not null references stock_lots(id),
  item_id uuid not null references items(id),
  qty numeric(14,3) not null check (qty > 0),
  unit_cost numeric(14,4) not null,
  created_at timestamptz not null default now(), created_by uuid
);
create index on material_issues(org_id, work_order_id);

create table production_logs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  work_order_id uuid not null references work_orders(id),
  machine_id uuid not null references machines(id),
  shift_id uuid not null,                     -- fk in 010
  worker_id uuid,                             -- fk in 010
  qty numeric(14,3) not null check (qty > 0),
  run_minutes int not null default 0 check (run_minutes >= 0),
  logged_at timestamptz not null default now(), created_by uuid
);
create index on production_logs(org_id, machine_id, logged_at);

create table work_order_outputs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  work_order_id uuid not null references work_orders(id),
  good_qty numeric(14,3) not null, good_weight_kg numeric(14,3),
  waste_qty numeric(14,3) not null default 0, waste_item_id uuid references items(id),
  waste_type text,
  created_at timestamptz not null default now(), created_by uuid
);

create table assignments (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  date date not null, shift_id uuid not null,
  worker_id uuid not null, machine_id uuid not null references machines(id),
  created_at timestamptz not null default now(), created_by uuid,
  unique (org_id, date, shift_id, worker_id)
);

create table machine_events (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  machine_id uuid not null references machines(id),
  status text not null check (status in ('idle','running','breakdown','maintenance')),
  reason text,
  started_at timestamptz not null default now(), ended_at timestamptz,
  created_by uuid
);

create table maintenance_tickets (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  ticket_no text not null,
  machine_id uuid not null references machines(id),
  machine_event_id uuid references machine_events(id),
  reason text not null, priority text not null default 'high',
  assigned_to uuid,                               -- membership id of technician
  status text not null default 'open' check (status in ('open','in_progress','resolved')),
  resolution text, parts_used text,
  opened_at timestamptz not null default now(), resolved_at timestamptz,
  created_by uuid,
  unique (org_id, ticket_no)
);
