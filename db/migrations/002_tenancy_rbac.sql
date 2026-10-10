-- 002: organizations, users, RBAC, org settings masters
create table organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null,
  types text[] not null check (cardinality(types) > 0 and
        types <@ array['manufacturer','buyer','supplier','transporter']),
  gstin text, address text, city text, state text, pincode text, phone text, email text,
  logo_url text,
  connect_code text not null unique,
  status text not null default 'active' check (status in ('pending','active','suspended')),
  settings jsonb not null default '{}'::jsonb,   -- {modules:{...}, timezone, currency, invoice_prefix, unmoved_days}
  created_at timestamptz not null default now(),
  created_by uuid
);

create table profiles (
  id uuid primary key references auth.users(id) on delete cascade,
  email text,                                    -- copied from the JWT (app_user cannot read auth.users)
  full_name text, phone text, avatar_url text,
  is_platform_admin boolean not null default false,
  created_at timestamptz not null default now()
);

create table permissions (                -- global, fixed list (seeded in 017)
  key text primary key,                   -- e.g. 'dispatch.confirm'
  domain text not null,
  description text not null,
  confidential boolean not null default false
);

create table roles (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null,
  rank int not null check (rank between 1 and 100),
  is_system boolean not null default false,
  created_at timestamptz not null default now(),
  unique (org_id, name)
);

create table role_permissions (
  role_id uuid not null references roles(id) on delete cascade,
  permission_key text not null references permissions(key),
  org_id uuid not null references organizations(id) on delete cascade,
  primary key (role_id, permission_key)
);

create table memberships (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null references auth.users(id) on delete cascade,
  role_id uuid not null references roles(id),
  status text not null default 'active' check (status in ('active','disabled')),
  scope jsonb not null default '{}'::jsonb,  -- {"stage_ids":[], "machine_ids":[], "shift_ids":[], "warehouse_ids":[]}
  reports_to uuid references memberships(id),
  created_at timestamptz not null default now(),
  unique (org_id, user_id)
);
create index on memberships(user_id);

create table staff_invites (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  email text not null,
  role_id uuid not null references roles(id),
  scope jsonb not null default '{}'::jsonb,
  token_hash text not null unique,
  status text not null default 'pending' check (status in ('pending','accepted','revoked','expired')),
  expires_at timestamptz not null,
  created_at timestamptz not null default now(),
  created_by uuid
);

create table org_counters (
  org_id uuid not null references organizations(id) on delete cascade,
  key text not null,                        -- 'ORD-2026', 'INV-2026', ...
  value int not null default 0,
  primary key (org_id, key)
);

create table stages (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null, sequence int not null,
  output_kind text,                          -- yarn | grey_fabric | finished_fabric
  unique (org_id, sequence)
);

create table stage_losses (
  org_id uuid not null references organizations(id) on delete cascade,
  stage_id uuid not null references stages(id) on delete cascade,
  weight_loss_pct numeric(5,2) not null default 0,
  length_shrink_pct numeric(5,2) not null default 0,
  primary key (org_id, stage_id)
);

create table defect_types (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  code text not null, name text not null, severity_default int not null default 1,
  unique (org_id, code)
);

create table warehouses (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null, kind text not null check (kind in ('raw','wip','finished','scrap'))
);
