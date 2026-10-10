-- 003: B2B partnerships + offline contacts
create table partnerships (
  id uuid primary key default gen_random_uuid(),
  requester_org_id uuid not null references organizations(id),
  target_org_id uuid references organizations(id),       -- null while an email invite is pending
  relation text not null check (relation in ('buyer','supplier','transporter')),
  -- relation = what the TARGET is to the REQUESTER (e.g. 'supplier': target supplies requester)
  invited_email text,
  token_hash text unique,
  status text not null default 'pending' check (status in ('pending','active','rejected','blocked')),
  blocked_by_org_id uuid references organizations(id),
  created_at timestamptz not null default now(),
  responded_at timestamptz,
  created_by uuid,
  unique (requester_org_id, target_org_id, relation),
  check (requester_org_id is distinct from target_org_id)
);
create index on partnerships(target_org_id);

create table contacts (                       -- offline partners
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  type text not null check (type in ('buyer','supplier','transporter')),
  name text not null, phone text, email text, gstin text, address text, city text,
  linked_org_id uuid references organizations(id),
  created_at timestamptz not null default now(), created_by uuid
);
