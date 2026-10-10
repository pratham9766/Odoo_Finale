-- 009: dispatches to buyers and the rolls scanned onto them.

create table dispatches (
  id uuid primary key default gen_random_uuid(),
  dispatch_no text not null unique,
  to_contact_id uuid not null references contacts(id),          -- the buyer
  order_id uuid not null references orders(id),
  vehicle_no text, driver_name text, driver_phone text,
  status text not null default 'packing'
    check (status in ('packing','confirmed','in_transit','delivered','cancelled')),
  confirmed_at timestamptz, delivered_at timestamptz,
  created_at timestamptz not null default now(), created_by uuid
);
create index dispatches_order_idx on dispatches(order_id);
create index dispatches_status_idx on dispatches(status);

create table dispatch_rolls (
  dispatch_id uuid not null references dispatches(id) on delete cascade,
  roll_id uuid not null references rolls(id),
  length_m numeric(10,2) not null,
  scanned_at timestamptz not null default now(),
  primary key (dispatch_id, roll_id),
  constraint dispatch_rolls_roll_unique unique (roll_id)       -- no roll is ever dispatched twice
);
