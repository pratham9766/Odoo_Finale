-- 003: buyers and suppliers of the mill (names on orders, GRNs, POs, invoices). They don't log in.
create table contacts (
  id uuid primary key default gen_random_uuid(),
  type text not null check (type in ('buyer','supplier')),
  name text not null, phone text, email text, gstin text, address text, city text,
  created_at timestamptz not null default now(), created_by uuid
);
create index on contacts(type, name);
