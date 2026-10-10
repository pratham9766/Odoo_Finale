-- 019: repair permission assignments after 018, add worker badge tokens, and restore freight reporting.

-- 018 replaced the permission catalogue. Custom role changes are audited with their full permission list,
-- so translate the latest audited list instead of granting broad access or asking owners to rebuild it by hand.
with legacy_map(old_key, new_key) as (values
  ('staff.invite','staff.create'), ('staff.invite','staff.delete'), ('staff.edit_role','staff.update'),
  ('roles.manage','roles.view'), ('roles.manage','roles.create'), ('roles.manage','roles.update'), ('roles.manage','roles.delete'),
  ('settings.manage','settings.create'), ('settings.manage','settings.update'), ('settings.manage','settings.delete'),
  ('settings.manage','machines.view'), ('settings.manage','machines.create'),
  ('settings.manage','machines.update'), ('settings.manage','machines.delete'),
  ('contacts.manage','contacts.create'), ('contacts.manage','contacts.update'), ('contacts.manage','contacts.delete'),
  ('items.manage','items.create'), ('items.manage','items.update'), ('items.manage','items.delete'),
  ('bom.manage','bom.create'), ('bom.manage','bom.update'), ('bom.manage','bom.delete'),
  ('receipt.create','receipt.create'), ('receipt.create','receipt.post'), ('receipt.create','receipt.delete'),
  ('po.create','po.create'), ('po.create','po.update'), ('po.create','po.delete'),
  ('assignment.manage','assignment.view'), ('assignment.manage','assignment.create'), ('assignment.manage','assignment.update'), ('assignment.manage','assignment.delete'),
  ('payment.record','payment.create'),
  ('bill.manage','expense.view'), ('bill.manage','expense.create'), ('bill.manage','expense.update'), ('bill.manage','expense.delete'),
  ('expense.manage','expense.view'), ('expense.manage','expense.create'), ('expense.manage','expense.update'), ('expense.manage','expense.delete'),
  ('workers.manage','workers.view'), ('workers.manage','workers.create'), ('workers.manage','workers.update'), ('workers.manage','workers.delete')
), latest as (
  select distinct on (record_id) record_id as role_id, after->'permissions' as permissions
    from audit_logs
   where table_name = 'roles' and after ? 'permissions' and jsonb_typeof(after->'permissions') = 'array'
   order by record_id, at desc
), recovered as (
  select l.role_id, coalesce(m.new_key, p.value) as permission_key
    from latest l
    cross join lateral jsonb_array_elements_text(l.permissions) p(value)
    left join legacy_map m on m.old_key = p.value
)
insert into role_permissions (role_id, permission_key)
select distinct r.role_id, r.permission_key
  from recovered r join roles ro on ro.id = r.role_id join permissions p on p.key = r.permission_key
on conflict do nothing;

-- Owner is invariant even if the permission catalogue changes again.
insert into role_permissions (role_id, permission_key)
select r.id, p.key from roles r cross join permissions p where r.rank = 100
on conflict do nothing;

-- Stable, non-guessable worker badge value. It is intentionally omitted from normal worker list responses.
alter table workers add column if not exists qr_token text;
update workers set qr_token = encode(gen_random_bytes(16), 'hex') where qr_token is null;
alter table workers alter column qr_token set default encode(gen_random_bytes(16), 'hex');
alter table workers alter column qr_token set not null;
create unique index if not exists workers_qr_token_unique on workers(qr_token);

-- Freight is a first-class operating cost rather than being hidden inside generic expenses.
alter table expenses drop constraint if exists expenses_category_check;
alter table expenses add constraint expenses_category_check
  check (category in ('power','maintenance','rent','salary_staff','supplier_bill','freight','other'));

drop view if exists v_monthly_pnl;
create view v_monthly_pnl as
with months as (select generate_series(date_trunc('month', now()) - interval '11 months',
                                       date_trunc('month', now()), interval '1 month')::date as month),
rev as (select date_trunc('month', invoice_date)::date m, sum(subtotal) v from invoices
        where status <> 'cancelled' group by 1),
mat as (select date_trunc('month', created_at)::date m, sum(qty * unit_cost) v from material_issues group by 1),
wag as (select month m, sum(total_gross) v from wage_runs group by 1),
ovh as (select date_trunc('month', pl.logged_at)::date m, sum(pl.run_minutes / 60.0 * mc.hourly_overhead) v
        from production_logs pl join machines mc on mc.id = pl.machine_id group by 1),
frt as (select date_trunc('month', date)::date m, sum(amount) v from expenses where category = 'freight' group by 1),
exp as (select date_trunc('month', date)::date m, sum(amount) v from expenses
        where category not in ('supplier_bill', 'freight') group by 1)
select mo.month,
       coalesce(rev.v,0) revenue, coalesce(mat.v,0) material, coalesce(wag.v,0) wages,
       coalesce(ovh.v,0) overhead, coalesce(frt.v,0) freight, coalesce(exp.v,0) expenses,
       coalesce(rev.v,0) - coalesce(mat.v,0) - coalesce(wag.v,0) - coalesce(ovh.v,0)
         - coalesce(frt.v,0) - coalesce(exp.v,0) as net_profit
from months mo
left join rev on rev.m = mo.month left join mat on mat.m = mo.month left join wag on wag.m = mo.month
left join ovh on ovh.m = mo.month left join frt on frt.m = mo.month left join exp on exp.m = mo.month;
