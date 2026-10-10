-- 020: RFID attendance. Card credentials, scanner devices and the raw scan log; a valid scan checks the worker in
-- through the existing `attendance` table (no second attendance system). Additive only: nothing is dropped or rewritten.
-- One database = one mill (see 002), so the mill is the organisation: devices, cards and scans need no tenant column.

-- where a worker normally stands (the RFID dashboard shows it; assignments still say which machine on which shift)
alter table workers add column if not exists department text;
alter table workers add column if not exists work_area text;

-- scanner devices: a physical reader authenticates with a random key, stored only as a SHA-256 hash;
-- the virtual (simulator) scanner has no key and can never be used through the hardware endpoint
create table rfid_devices (
  id uuid primary key default gen_random_uuid(),
  code text not null unique check (code ~ '^[A-Z0-9_-]{2,40}$'),
  name text,
  kind text not null default 'hardware' check (kind in ('hardware','virtual')),
  key_hash text check (key_hash is null or key_hash ~ '^[0-9a-f]{64}$'),
  active boolean not null default true,
  last_seen_at timestamptz,
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), created_by uuid,
  check (kind = 'virtual' or key_hash is not null)
);
insert into rfid_devices (code, name, kind) values ('VIRTUAL_SCANNER', 'Virtual scanner (simulator)', 'virtual');

-- a card UID assigned to a worker; replacing a card deactivates the old row, so history keeps every UID ever used
create table rfid_credentials (
  id uuid primary key default gen_random_uuid(),
  worker_id uuid not null references workers(id),
  card_uid text not null check (card_uid ~ '^[0-9A-F]{8,20}$'),     -- normalised: upper-case hex, no separators
  active boolean not null default true,
  is_placeholder boolean not null default false,                     -- demo UID waiting for the physical card
  created_at timestamptz not null default now(), updated_at timestamptz not null default now(), created_by uuid,
  deactivated_at timestamptz, deactivated_by uuid
);
create unique index rfid_credentials_active_uid on rfid_credentials(card_uid) where active;     -- one owner per card
create unique index rfid_credentials_active_worker on rfid_credentials(worker_id) where active; -- one card per worker
create index rfid_credentials_worker_idx on rfid_credentials(worker_id);

-- every scan, accepted or not; the timestamp is always the server's
create table rfid_scan_events (
  id uuid primary key default gen_random_uuid(),
  device_id uuid not null references rfid_devices(id),
  source text not null check (source in ('hardware','simulator')),
  card_uid text not null,
  credential_id uuid references rfid_credentials(id),
  worker_id uuid references workers(id),                            -- null for an unknown card
  scanned_at timestamptz not null default now(),
  status text not null check (status in ('accepted','duplicate','unknown_card','invalid_employee','rejected')),
  attendance_action text check (attendance_action in ('checked_in','already_checked_in','outside_shift','manual_record_kept')),
  attendance_id uuid references attendance(id) on delete set null,
  shift_id uuid references shifts(id), shift_date date,
  message text,
  request_event_id text check (request_event_id is null or length(request_event_id) between 1 and 64),
  scanned_by uuid,                                                   -- the signed-in user, for simulator scans
  unique (device_id, request_event_id)                               -- a retried request is answered, not repeated
);
create index rfid_scan_events_at_idx on rfid_scan_events(scanned_at desc);
create index rfid_scan_events_worker_idx on rfid_scan_events(worker_id, scanned_at desc);

-- attendance remembers where its check-in came from
alter table attendance add column if not exists source text not null default 'manual';
alter table attendance add constraint attendance_source_check check (source in ('manual','hardware','simulator'));
alter table attendance add column if not exists check_in_event_id uuid
  references rfid_scan_events(id) on delete set null deferrable initially deferred;   -- the event row is written last

-- permissions (Roles & permissions shows them under "Rfid")
insert into permissions (key, domain, description, confidential) values
 ('rfid.view','workforce','View RFID cards, scanners and scan history',false),
 ('rfid.manage','workforce','Assign, replace and deactivate RFID cards; register scanners',false),
 ('rfid.simulate','workforce','Use the virtual RFID scanner (demo / development only)',false)
on conflict (key) do nothing;

insert into role_permissions (role_id, permission_key)
select r.id, p.key from roles r cross join permissions p where r.rank = 100 and p.key like 'rfid.%'
on conflict do nothing;

-- whoever can already see attendance can see the scans behind it
insert into role_permissions (role_id, permission_key)
select distinct rp.role_id, 'rfid.view' from role_permissions rp where rp.permission_key = 'attendance.view'
on conflict do nothing;

-- same access model as 015: only the Node API (app_user) reads these tables, no RLS
grant select, insert, update, delete on rfid_devices, rfid_credentials, rfid_scan_events to app_user;
alter table rfid_devices disable row level security;
alter table rfid_credentials disable row level security;
alter table rfid_scan_events disable row level security;
