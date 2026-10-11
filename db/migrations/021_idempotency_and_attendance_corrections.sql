-- 021: (1) idempotency keys, so a retried write whose response was lost returns the original result instead of repeating;
--      (2) who corrected an unresolved attendance row, when, and why.
-- Additive only. This is the first migration number that is unique: 019 and 020 each exist twice (see docs/MIGRATIONS.md).

-- One row per (actor, operation, client-generated key). The row is written in the SAME transaction as the business change,
-- so either both exist or neither does. request_hash is the hash of the validated input: the same key with different input is a conflict.
create table if not exists idempotency_keys (
  actor_id uuid not null,
  operation text not null check (length(operation) between 1 and 60),
  key text not null check (key ~ '^[A-Za-z0-9_-]{16,80}$'),
  request_hash text not null check (request_hash ~ '^[0-9a-f]{64}$'),
  status_code int not null,
  response jsonb not null,
  created_at timestamptz not null default now(),
  primary key (actor_id, operation, key)
);
create index if not exists idempotency_keys_created_idx on idempotency_keys(created_at);
grant select, insert, update, delete on idempotency_keys to app_user;
alter table idempotency_keys disable row level security;

-- attendance corrections: the supervisor's explicit corrected times, with an actor and a reason
alter table attendance add column if not exists corrected_by uuid;
alter table attendance add column if not exists corrected_at timestamptz;
alter table attendance add column if not exists correction_reason text;
create index if not exists attendance_needs_correction_idx on attendance(date) where needs_correction;
