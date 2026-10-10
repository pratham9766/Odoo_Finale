-- 008: rolls, roll genealogy (history + yarn lots), QC inspections and defects.
-- roll_history.shift_id / worker_id foreign keys are added in 010.

create table rolls (
  id uuid primary key default gen_random_uuid(),
  roll_no text not null unique,
  qr_token text not null unique,
  order_id uuid not null references orders(id),
  order_line_id uuid not null references order_lines(id),
  item_id uuid not null references items(id),
  work_order_id uuid not null references work_orders(id),     -- final-stage work order
  length_m numeric(10,2) not null check (length_m > 0), weight_kg numeric(10,3),
  dye_batch text,
  status text not null default 'pending_qc'
    check (status in ('produced','pending_qc','passed','rework','rejected','packed','dispatched','delivered')),
  created_at timestamptz not null default now(), created_by uuid
);
create index rolls_order_idx on rolls(order_id);
create index rolls_status_idx on rolls(status);      -- QC queue
create index rolls_wo_idx on rolls(work_order_id);

create table roll_history (
  id uuid primary key default gen_random_uuid(),
  roll_id uuid not null references rolls(id) on delete cascade,
  stage_id uuid references stages(id), machine_id uuid references machines(id),
  shift_id uuid, worker_id uuid,                 -- fks in 010
  work_order_id uuid references work_orders(id),
  event text not null,           -- 'spun','woven','dyed','created','inspected','reworked','dispatched'
  data jsonb not null default '{}'::jsonb,
  at timestamptz not null default now()
);
create index roll_history_roll_idx on roll_history(roll_id, at);

create table roll_yarn_lots (
  roll_id uuid not null references rolls(id) on delete cascade,
  lot_id uuid not null references stock_lots(id),
  primary key (roll_id, lot_id)
);
create index roll_yarn_lots_lot_idx on roll_yarn_lots(lot_id);   -- lot → rolls (bad supplier lot)

create table qc_inspections (
  id uuid primary key default gen_random_uuid(),
  roll_id uuid not null references rolls(id),
  inspector_id uuid not null references profiles(id),
  result text not null check (result in ('pass','rework','reject')),
  is_override boolean not null default false, override_reason text,
  remarks text, photo_path text,
  inspected_at timestamptz not null default now(),
  check (not is_override or nullif(btrim(override_reason), '') is not null)
);
create index qc_inspections_roll_idx on qc_inspections(roll_id, inspected_at);
create index qc_inspections_day_idx on qc_inspections(inspected_at);

create table qc_defects (
  id uuid primary key default gen_random_uuid(),
  inspection_id uuid not null references qc_inspections(id) on delete cascade,
  defect_type_id uuid not null references defect_types(id),
  count int not null check (count > 0), severity int not null default 1
);
create index qc_defects_inspection_idx on qc_defects(inspection_id);
