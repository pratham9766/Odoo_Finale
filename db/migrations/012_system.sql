-- 012: in-app notifications and the audit log
create table notifications (
  id uuid primary key default gen_random_uuid(),
  user_id uuid,                          -- null = everyone with the matching permission
  required_permission text,
  type text not null, title text not null, body text, link text,
  data jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index on notifications(created_at desc);

-- per-user read state for broadcast notifications (user_id is null)
create table notification_reads (
  notification_id uuid not null references notifications(id) on delete cascade,
  user_id uuid not null,
  read_at timestamptz not null default now(),
  primary key (notification_id, user_id)
);

create table audit_logs (
  id bigint generated always as identity primary key,
  user_id uuid, action text not null, table_name text not null, record_id uuid,
  before jsonb, after jsonb,
  at timestamptz not null default now()
);
create index on audit_logs(at desc);
