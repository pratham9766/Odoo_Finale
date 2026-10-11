-- 022: make the built-in Office and Supervisor roles end up the same whichever branch a database came from.
-- 020_rfid_attendance.sql gives rfid.view to every role that can already see attendance. On a database that ran it BEFORE
-- 019_default_role_permissions.sql created Office and Supervisor (a database that came from main), those two roles never got it.
-- Only roles that nobody has ever edited through the app (no audit_logs row for the role) are touched, so a permission an owner
-- removed on purpose stays removed. Idempotent, additive, and a no-op on a fresh database.
insert into role_permissions (role_id, permission_key)
select r.id, 'rfid.view'
  from roles r
 where r.name in ('Office', 'Supervisor')
   and exists (select 1 from role_permissions rp where rp.role_id = r.id and rp.permission_key = 'attendance.view')
   and not exists (select 1 from audit_logs a where a.table_name = 'roles' and a.record_id = r.id)
on conflict do nothing;
