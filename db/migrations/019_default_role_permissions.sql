-- 019: starting permissions for the non-owner roles (018 wiped them). Creates a role if it is missing, then adds its
-- permissions. Additive only: nothing already ticked in Settings -> Roles & permissions is removed.
-- Keep the lists in sync with server/src/modules/staff/defaultRoles.js.

create temporary table _role_defs (name text, rank int, keys text[]) on commit drop;

insert into _role_defs values
 ('Office', 70, array[
   'orders.view','orders.create','orders.confirm','orders.cancel','orders.view_price',
   'contacts.view','contacts.create','contacts.update',
   'items.view','bom.view','stock.view','receipt.view',
   'po.view','po.create','po.update',
   'production.view','machines.view','qc.view',
   'dispatch.view','dispatch.confirm',
   'invoice.view','invoice.create','payment.view','payment.create',
   'expense.view','expense.create','expense.update',
   'workers.view','attendance.view','wages.view','wages.run',
   'staff.view',
   'reports.production','reports.qc','reports.attendance','reports.cost']),
 ('Supervisor', 60, array[
   'orders.view','items.view','bom.view','stock.view',
   'production.view','production.plan','production.log','machine.status','machines.view',
   'assignment.view','assignment.create','assignment.update','assignment.delete',
   'breakdown.report','breakdown.close','maintenance.fix',
   'qc.view','dispatch.view',
   'workers.view','attendance.view','attendance.mark','attendance.approve',
   'reports.production','reports.qc','reports.attendance']),
 ('QC Inspector', 40, array[
   'qc.view','qc.inspect','production.view','machines.view','breakdown.report','reports.qc']),
 ('Store Keeper', 40, array[
   'orders.view','contacts.view','items.view','bom.view',
   'stock.view','stock.adjust','receipt.view','receipt.create','receipt.post',
   'po.view','qc.view','dispatch.view','dispatch.create']),
 ('Operator', 20, array[
   'production.view','production.log','machine.status','machines.view','assignment.view','breakdown.report']);

insert into roles (name, rank)
select d.name, d.rank from _role_defs d
where not exists (select 1 from roles r where lower(r.name) = lower(d.name));

insert into role_permissions (role_id, permission_key)
select r.id, k
from _role_defs d
join roles r on lower(r.name) = lower(d.name)
cross join unnest(d.keys) k
join permissions p on p.key = k
on conflict do nothing;
