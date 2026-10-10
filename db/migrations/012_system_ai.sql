-- 012: notifications, audit, AI, platform
create table notifications (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  user_id uuid,                          -- null = everyone with the matching permission
  required_permission text,
  type text not null, title text not null, body text, link text,
  data jsonb,
  read_at timestamptz,
  created_at timestamptz not null default now()
);
create index on notifications(org_id, created_at desc);

-- per-user read state for broadcast notifications (user_id is null)
create table notification_reads (
  notification_id uuid not null references notifications(id) on delete cascade,
  user_id uuid not null,
  org_id uuid not null references organizations(id) on delete cascade,
  read_at timestamptz not null default now(),
  primary key (notification_id, user_id)
);

create table audit_logs (
  id bigint generated always as identity primary key,
  org_id uuid not null,
  user_id uuid, action text not null, table_name text not null, record_id uuid,
  before jsonb, after jsonb,
  at timestamptz not null default now()
);
create index on audit_logs(org_id, at desc);

create table ai_chats (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  user_id uuid not null, title text,
  created_at timestamptz not null default now()
);

create table ai_messages (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  chat_id uuid not null references ai_chats(id) on delete cascade,
  role text not null check (role in ('user','assistant')),
  content text not null, sql text, result jsonb, chart jsonb,
  created_at timestamptz not null default now()
);
create index on ai_messages(chat_id, created_at);

create table ai_insights (
  id uuid primary key default gen_random_uuid(),
  org_id uuid not null references organizations(id) on delete cascade,
  type text not null, severity text not null check (severity in ('info','warning','critical')),
  title text not null, body text not null, data jsonb, required_permission text,
  created_at timestamptz not null default now(), dismissed_at timestamptz
);

create table platform_announcements (
  id uuid primary key default gen_random_uuid(),
  title text not null, body text not null,
  created_at timestamptz not null default now()
);
