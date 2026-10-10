-- 010: shifts, workers, attendance (daily, marked by the supervisor), wage runs and wage lines.
-- Also adds the shift / worker foreign keys that 007 and 008 left open.

create table shifts (
  id uuid primary key default gen_random_uuid(),
  name text not null unique, start_time time not null, end_time time not null,
  grace_min int not null default 10 check (grace_min >= 0),
  -- derived, so it can never disagree with the times (C shift 22:00–06:00 → true)
  crosses_midnight boolean generated always as (end_time < start_time) stored,
  check (start_time <> end_time)
);

create table workers (
  id uuid primary key default gen_random_uuid(),
  emp_code text not null unique, name text not null, phone text, photo_path text,
  skill text, stage_id uuid references stages(id), default_shift_id uuid references shifts(id),
  employment_type text not null default 'permanent' check (employment_type in ('permanent','contract')),
  wage_type text not null check (wage_type in ('daily','hourly','piece')),
  rate numeric(10,2) not null default 0 check (rate >= 0),             -- per day or per hour
  ot_rate numeric(10,2) not null default 0 check (ot_rate >= 0),       -- per OT hour
  piece_rate numeric(10,4) not null default 0 check (piece_rate >= 0), -- per uom produced
  user_id uuid references auth.users(id),                              -- set when the worker also logs in (operator)
  active boolean not null default true,
  created_at timestamptz not null default now(), created_by uuid
);

alter table production_logs add constraint pl_shift_fk foreign key (shift_id) references shifts(id);
alter table production_logs add constraint pl_worker_fk foreign key (worker_id) references workers(id);
alter table assignments add constraint as_shift_fk foreign key (shift_id) references shifts(id);
alter table assignments add constraint as_worker_fk foreign key (worker_id) references workers(id);
alter table roll_history add constraint rh_shift_fk foreign key (shift_id) references shifts(id);
alter table roll_history add constraint rh_worker_fk foreign key (worker_id) references workers(id);

create table attendance (                       -- one row per worker per shift per day
  id uuid primary key default gen_random_uuid(),
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
create index attendance_date_idx on attendance(date, shift_id);   -- today board, register

create table wage_runs (
  id uuid primary key default gen_random_uuid(),
  month date not null unique check (extract(day from month) = 1),   -- first day of month
  status text not null default 'draft' check (status in ('draft','approved','paid')),
  total_gross numeric(14,2) not null default 0, total_net numeric(14,2) not null default 0,
  prepared_by uuid, approved_by uuid, paid_at timestamptz
);

create table wage_lines (
  id uuid primary key default gen_random_uuid(),
  wage_run_id uuid not null references wage_runs(id) on delete cascade,
  worker_id uuid not null references workers(id),
  days numeric(5,2) not null default 0, half_days int not null default 0,
  hours numeric(7,2) not null default 0, ot_hours numeric(6,2) not null default 0,
  pieces numeric(14,3) not null default 0,
  gross numeric(12,2) not null,
  deductions numeric(12,2) not null default 0, net numeric(12,2) not null,
  unique (wage_run_id, worker_id)
);
