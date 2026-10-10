-- 010_workforce.sql
-- Shifts, workers, kiosk devices, attendance (punches, daily summary, corrections),
-- leave, holidays, wage runs, wage lines and advances.
-- Also adds the shift / worker foreign keys that 007 and 008 left open.
-- Depends on: 002 (organizations, stages), 007 (production_logs, assignments), 008 (roll_history).
-- RLS for every table here is enabled in 013.

create table shifts (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null, start_time time not null, end_time time not null,
  grace_min int not null default 10 check (grace_min >= 0),
  -- derived, so it can never disagree with the times (C shift 22:00–06:00 → true)
  crosses_midnight boolean generated always as (end_time < start_time) stored,
  unique (org_id, name),
  check (start_time <> end_time)
);

create table workers (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  emp_code text not null, name text not null, phone text, photo_path text,
  skill text, stage_id uuid references stages(id), default_shift_id uuid references shifts(id),
  employment_type text not null default 'permanent' check (employment_type in ('permanent','contract')),
  wage_type text not null check (wage_type in ('daily','hourly','piece')),
  rate numeric(10,2) not null default 0 check (rate >= 0),             -- per day or per hour
  ot_rate numeric(10,2) not null default 0 check (ot_rate >= 0),       -- per OT hour
  piece_rate numeric(10,4) not null default 0 check (piece_rate >= 0), -- per uom produced
  qr_token text not null unique,
  user_id uuid references auth.users(id),
  active boolean not null default true,
  created_at timestamptz not null default now(), created_by uuid,
  unique (org_id, emp_code)
);

alter table production_logs add constraint pl_shift_fk foreign key (shift_id) references shifts(id);
alter table production_logs add constraint pl_worker_fk foreign key (worker_id) references workers(id);
alter table assignments add constraint as_shift_fk foreign key (shift_id) references shifts(id);
alter table assignments add constraint as_worker_fk foreign key (worker_id) references workers(id);
alter table roll_history add constraint rh_shift_fk foreign key (shift_id) references shifts(id);
alter table roll_history add constraint rh_worker_fk foreign key (worker_id) references workers(id);

create table kiosk_devices (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  name text not null, token_hash text not null unique,
  active boolean not null default true, last_seen_at timestamptz,
  created_at timestamptz not null default now(), created_by uuid
);

create table attendance_punches (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  worker_id uuid not null references workers(id),
  punch_type text not null check (punch_type in ('in','out')),
  punched_at timestamptz not null default now(),
  method text not null check (method in ('kiosk','supervisor','mobile')),
  device_id uuid references kiosk_devices(id), photo_path text,
  created_by uuid
);
create index attendance_punches_worker_idx on attendance_punches(org_id, worker_id, punched_at);  -- 60 s duplicate check

create table attendance (                       -- daily summary per worker per shift
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  worker_id uuid not null references workers(id),
  date date not null, shift_id uuid not null references shifts(id),   -- night shift: date = shift start date
  check_in timestamptz, check_out timestamptz,
  worked_hours numeric(5,2) not null default 0,
  late_min int not null default 0, early_leave_min int not null default 0,
  ot_hours numeric(5,2) not null default 0, ot_approved boolean not null default false,
  status text not null default 'present'
    check (status in ('present','late','half_day','absent','leave','weekly_off','holiday')),
  needs_correction boolean not null default false,
  approved_by uuid,
  unique (worker_id, date, shift_id),
  check (check_out is null or check_in is null or check_out >= check_in)
);
create index attendance_date_idx on attendance(org_id, date, shift_id);   -- today board, register

create table attendance_corrections (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  attendance_id uuid not null references attendance(id),
  requested_by uuid not null, change jsonb not null, reason text not null,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  approved_by uuid, decided_at timestamptz,
  created_at timestamptz not null default now()
);
create index attendance_corrections_status_idx on attendance_corrections(org_id, status);

create table leave_requests (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  worker_id uuid not null references workers(id),
  from_date date not null, to_date date not null, type text not null, reason text,
  status text not null default 'pending' check (status in ('pending','approved','rejected')),
  approved_by uuid, created_at timestamptz not null default now(),
  check (to_date >= from_date)
);
create index leave_requests_worker_idx on leave_requests(org_id, worker_id, from_date);

create table holidays (
  org_id uuid not null references organizations(id) on delete cascade,
  date date not null, name text not null, primary key (org_id, date)
);

create table wage_runs (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  month date not null check (extract(day from month) = 1),   -- first day of month
  status text not null default 'draft' check (status in ('draft','approved','paid')),
  total_gross numeric(14,2) not null default 0, total_net numeric(14,2) not null default 0,
  prepared_by uuid, approved_by uuid, paid_at timestamptz,
  unique (org_id, month)
);

create table wage_lines (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  wage_run_id uuid not null references wage_runs(id) on delete cascade,
  worker_id uuid not null references workers(id),
  days numeric(5,2) not null default 0, half_days int not null default 0,
  hours numeric(7,2) not null default 0, ot_hours numeric(6,2) not null default 0,
  pieces numeric(14,3) not null default 0,
  gross numeric(12,2) not null, advances numeric(12,2) not null default 0,
  deductions numeric(12,2) not null default 0, net numeric(12,2) not null,
  unique (wage_run_id, worker_id)
);

create table wage_advances (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  worker_id uuid not null references workers(id),
  amount numeric(10,2) not null check (amount > 0), date date not null,
  recovered_in_run uuid references wage_runs(id) on delete set null
);
create index wage_advances_open_idx on wage_advances(org_id, worker_id) where recovered_in_run is null;
