-- 002: the mill, its staff (users + roles + permissions), numbering, and the floor masters.
-- One system = one mill. There is no organization / tenant concept.

-- the mill's own details (invoice header, settings). Exactly one row.
create table mill (
  id boolean primary key default true check (id),
  name text not null,
  gstin text, address text, city text, state text, pincode text, phone text, email text,
  logo_url text,
  settings jsonb not null default '{}'::jsonb,   -- {modules:{...}, timezone, currency, invoice_prefix}
  created_at timestamptz not null default now()
);

create table permissions (                -- fixed list (seeded in 016)
  key text primary key,                   -- e.g. 'dispatch.confirm'
  domain text not null,
  description text not null,
  confidential boolean not null default false
);

create table roles (
  id uuid primary key default gen_random_uuid(),
  name text not null unique,
  rank int not null check (rank between 1 and 100),
  is_system boolean not null default false,
  created_at timestamptz not null default now()
);

create table role_permissions (
  role_id uuid not null references roles(id) on delete cascade,
  permission_key text not null references permissions(key),
  primary key (role_id, permission_key)
);

-- staff of the mill: one row per login (Supabase auth user)
create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,                                    -- copied from the JWT
  full_name text, phone text, avatar_url text,
  role_id uuid references roles(id),             -- null = signed up but not given access yet
  status text not null default 'active' check (status in ('active','disabled')),
  scope jsonb not null default '{}'::jsonb,      -- {"stage_ids":[], "machine_ids":[], "shift_ids":[], "warehouse_ids":[]}
  reports_to uuid references profiles(id),
  created_at timestamptz not null default now()
);

create table staff_invites (
  id uuid primary key default gen_random_uuid(),
  email text not null,
  role_id uuid not null references roles(id),
  scope jsonb not null default '{}'::jsonb,
  token_hash text not null unique,
  status text not null default 'pending' check (status in ('pending','accepted','revoked','expired')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  created_by uuid
);

create table counters (
  key text primary key,                     -- 'ORD-2026', 'INV-2026', ...
  value int not null default 0
);

create table stages (
  id uuid primary key default gen_random_uuid(),
  name text not null, sequence int not null unique,
  output_kind text                           -- yarn | grey_fabric | finished_fabric
);

create table stage_losses (
  stage_id uuid primary key references stages(id) on delete cascade,
  weight_loss_pct numeric(5,2) not null default 0,
  length_shrink_pct numeric(5,2) not null default 0
);

create table defect_types (
  id uuid primary key default gen_random_uuid(),
  code text not null unique, name text not null, severity_default int not null default 1
);

create table warehouses (
  id uuid primary key default gen_random_uuid(),
  name text not null, kind text not null check (kind in ('raw','wip','finished','scrap'))
);
