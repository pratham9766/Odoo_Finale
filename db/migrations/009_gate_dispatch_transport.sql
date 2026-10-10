-- 009: fleet, dispatches, trips, gate
-- owner: Hrishikesh (initial version copied from docs/02_BACKEND_EXECUTION.md §5.9)
create table vehicles (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,   -- transporter org
  vehicle_no text not null, type text, capacity_kg numeric(10,2),
  unique (org_id, vehicle_no)
);

create table drivers (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null, phone text, licence_no text,
  user_id uuid references auth.users(id)
);

create table dispatches (
  id uuid primary key default gen_random_uuid(),
  dispatch_no text not null,
  from_org_id uuid not null references organizations(id),     -- sender (mill or supplier)
  to_org_id uuid references organizations(id),                -- receiver (buyer or mill)
  to_contact_id uuid references contacts(id),
  kind text not null check (kind in ('sales','supply')),      -- sales: mill->buyer, supply: supplier->mill
  order_id uuid references orders(id),
  po_id uuid references purchase_orders(id),
  transporter_org_id uuid references organizations(id),
  vehicle_no text, driver_name text, driver_phone text,
  status text not null default 'packing'
    check (status in ('packing','confirmed','in_transit','delivered','disputed','cancelled')),
  confirmed_at timestamptz, delivered_at timestamptz,
  created_at timestamptz not null default now(), created_by uuid,
  unique (from_org_id, dispatch_no)
);

create table dispatch_rolls (
  dispatch_id uuid not null references dispatches(id) on delete cascade,
  roll_id uuid not null references rolls(id),
  from_org_id uuid not null, to_org_id uuid,
  length_m numeric(10,2) not null,
  scanned_at timestamptz not null default now(),
  primary key (dispatch_id, roll_id),
  constraint dispatch_rolls_roll_unique unique (roll_id)       -- no double dispatch
);

create table dispatch_lots (                                    -- supplier yarn dispatches
  id uuid primary key default gen_random_uuid(),
  dispatch_id uuid not null references dispatches(id) on delete cascade,
  from_org_id uuid not null, to_org_id uuid,
  po_line_id uuid references po_lines(id),
  lot_no text not null, colour text, qty numeric(14,3) not null, uom text not null
);

create table trips (
  id uuid primary key default gen_random_uuid(),
  trip_no text not null,
  dispatch_id uuid not null references dispatches(id),
  transporter_org_id uuid not null references organizations(id),
  requester_org_id uuid not null references organizations(id),  -- dispatch sender
  receiver_org_id uuid references organizations(id),
  vehicle_id uuid references vehicles(id), driver_id uuid references drivers(id),
  pickup_address text, drop_address text,
  roll_count int, weight_kg numeric(10,2),
  status text not null default 'requested'
    check (status in ('requested','accepted','rejected','assigned','picked_up','in_transit','reached','delivered')),
  otp_hash text, pod_photo_path text, receiver_name text,
  freight_amount numeric(12,2),
  eta timestamptz, delivered_at timestamptz,
  created_at timestamptz not null default now(),
  unique (transporter_org_id, trip_no)
);

create table trip_events (
  id uuid primary key default gen_random_uuid(),
  trip_id uuid not null references trips(id) on delete cascade,
  transporter_org_id uuid not null, requester_org_id uuid not null, receiver_org_id uuid,
  status text not null, note text,
  at timestamptz not null default now(), created_by uuid
);

create table gate_entries (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  direction text not null check (direction in ('in','out')),
  vehicle_no text not null, driver_name text,
  purpose text not null check (purpose in ('supply','dispatch','visitor','other')),
  dispatch_id uuid references dispatches(id), trip_id uuid references trips(id),
  at timestamptz not null default now(), created_by uuid
);
