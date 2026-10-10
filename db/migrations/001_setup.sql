-- 001: extensions + the application's database role (run as postgres).
-- {{...}} placeholders are filled by db/migrate.js from server/.env.
create extension if not exists pgcrypto;

do $$ begin
  if not exists (select 1 from pg_roles where rolname = 'app_user') then
    create role app_user login password '{{APP_USER_PASSWORD}}';
  else
    alter role app_user login password '{{APP_USER_PASSWORD}}';
  end if;
end $$;

grant usage on schema public to app_user;
