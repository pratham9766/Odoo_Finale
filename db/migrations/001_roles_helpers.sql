-- 001: DB roles + tenant helper functions (run as postgres).
-- {{...}} placeholders are filled by db/migrate.js from server/.env.
create extension if not exists pgcrypto;

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'app_user') then
    create role app_user login password '{{APP_USER_PASSWORD}}' nobypassrls;
  else
    alter role app_user login password '{{APP_USER_PASSWORD}}' nobypassrls;
  end if;
  if not exists (select 1 from pg_roles where rolname = 'ai_reader') then
    create role ai_reader login password '{{AI_READER_PASSWORD}}' nobypassrls;
  else
    alter role ai_reader login password '{{AI_READER_PASSWORD}}' nobypassrls;
  end if;
end $$;

grant usage on schema public to app_user, ai_reader;

-- current tenant / user from transaction-local settings
create or replace function app_org() returns uuid language sql stable as $$
  select nullif(current_setting('app.org_id', true), '')::uuid
$$;
create or replace function app_uid() returns uuid language sql stable as $$
  select nullif(current_setting('app.user_id', true), '')::uuid
$$;

create or replace function touch_updated_at() returns trigger language plpgsql as $$
begin new.updated_at = now(); return new; end $$;
