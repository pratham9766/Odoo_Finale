-- 016: grants. The frontend never reads tables directly (no PostgREST access).
revoke all on all tables in schema public from anon, authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;
revoke execute on all functions in schema public from anon, authenticated;

grant select, insert, update, delete on all tables in schema public to app_user;
grant usage, select on all sequences in schema public to app_user;
alter default privileges in schema public grant select, insert, update, delete on tables to app_user;
alter default privileges in schema public grant usage, select on sequences to app_user;

-- migration bookkeeping is not for the app
revoke all on public.schema_migrations from app_user, ai_reader;

-- ai_reader: SELECT only; with security_invoker views it needs SELECT on base tables too.
-- RLS still limits rows to the session org; sqlGuard limits it to allowed views.
grant select on all tables in schema public to ai_reader;
revoke select on audit_logs, staff_invites, kiosk_devices, partnerships, profiles, organizations,
  memberships, notifications, notification_reads, ai_chats, ai_messages from ai_reader;
revoke all on public.schema_migrations from ai_reader;

alter role app_user set statement_timeout = '15s';
alter role ai_reader set statement_timeout = '5s';
alter role ai_reader set default_transaction_read_only = on;
