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
