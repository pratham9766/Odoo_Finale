-- 015: grants. The frontend never reads tables directly (no PostgREST access): only the Node API, as app_user.
revoke all on all tables in schema public from anon, authenticated;
alter default privileges in schema public revoke all on tables from anon, authenticated;
revoke execute on all functions in schema public from anon, authenticated;

grant select, insert, update, delete on all tables in schema public to app_user;
grant usage, select on all sequences in schema public to app_user;
grant execute on function public_track(text) to app_user;
alter default privileges in schema public grant select, insert, update, delete on tables to app_user;
alter default privileges in schema public grant usage, select on sequences to app_user;

-- migration bookkeeping is not for the app
revoke all on public.schema_migrations from app_user;

alter role app_user set statement_timeout = '15s';

-- this app has no RLS policies (the Node API enforces permissions); Supabase can switch RLS on for new tables
-- automatically, and a table with RLS on and no policy hides every row from app_user
do $$
declare t record;
begin
  for t in select tablename from pg_tables where schemaname = 'public' loop
    execute format('alter table public.%I disable row level security', t.tablename);
  end loop;
end $$;
