-- 013: row level security. Every tenant table is isolated by app_org().

-- single-tenant tables (have org_id)
create or replace function enable_tenant_rls(t regclass) returns void language plpgsql as $$
begin
  execute format('alter table %s enable row level security', t);
  execute format('create policy tenant_rw on %s for all to app_user
                  using (org_id = app_org()) with check (org_id = app_org())', t);
  execute format('create policy tenant_ro on %s for select to ai_reader
                  using (org_id = app_org())', t);
end $$;

-- two-party tables
create or replace function enable_party_rls(t regclass, a text, b text) returns void language plpgsql as $$
begin
  execute format('alter table %s enable row level security', t);
  execute format('create policy party_rw on %s for all to app_user
                  using (%I = app_org() or %I = app_org())
                  with check (%I = app_org() or %I = app_org())', t, a, b, a, b);
  execute format('create policy party_ro on %s for select to ai_reader
                  using (%I = app_org() or %I = app_org())', t, a, b);
end $$;

select enable_tenant_rls(t) from unnest(array[
  'roles','role_permissions','staff_invites','org_counters','stages','stage_losses','defect_types',
  'warehouses','contacts','items','boms','bom_lines','stock_lots','stock_movements','reservations',
  'goods_receipts','receipt_lines','stock_adjustments','machines','work_orders','material_issues','production_logs',
  'work_order_outputs','assignments','machine_events','maintenance_tickets','rolls','roll_history',
  'roll_yarn_lots','qc_inspections','qc_defects','vehicles','drivers','gate_entries','shifts','workers',
  'kiosk_devices','attendance_punches','attendance','attendance_corrections','leave_requests','holidays',
  'wage_advances','wage_runs','wage_lines','expenses','notifications','notification_reads','audit_logs','ai_chats',
  'ai_messages','ai_insights'
]::regclass[]) as t;

select enable_party_rls('orders', 'seller_org_id', 'buyer_org_id');
select enable_party_rls('order_lines', 'seller_org_id', 'buyer_org_id');
select enable_party_rls('order_events', 'seller_org_id', 'buyer_org_id');
select enable_party_rls('purchase_orders', 'buyer_org_id', 'supplier_org_id');
select enable_party_rls('po_lines', 'buyer_org_id', 'supplier_org_id');
select enable_party_rls('dispatches', 'from_org_id', 'to_org_id');
select enable_party_rls('dispatch_rolls', 'from_org_id', 'to_org_id');
select enable_party_rls('dispatch_lots', 'from_org_id', 'to_org_id');
select enable_party_rls('invoices', 'seller_org_id', 'buyer_org_id');
select enable_party_rls('invoice_lines', 'seller_org_id', 'buyer_org_id');
select enable_party_rls('payments', 'seller_org_id', 'buyer_org_id');

-- trips: three parties
alter table trips enable row level security;
create policy trip_rw on trips for all to app_user
  using (app_org() in (transporter_org_id, requester_org_id, receiver_org_id))
  with check (app_org() in (transporter_org_id, requester_org_id, receiver_org_id));
create policy trip_ro on trips for select to ai_reader
  using (app_org() in (transporter_org_id, requester_org_id, receiver_org_id));
alter table trip_events enable row level security;
create policy trip_ev_rw on trip_events for all to app_user
  using (app_org() in (transporter_org_id, requester_org_id, receiver_org_id))
  with check (app_org() in (transporter_org_id, requester_org_id, receiver_org_id));
create policy trip_ev_ro on trip_events for select to ai_reader
  using (app_org() in (transporter_org_id, requester_org_id, receiver_org_id));

-- the dispatch's transporter can read the dispatch header
create policy dispatch_transporter_ro on dispatches for select to app_user
  using (transporter_org_id = app_org());

-- organizations: own org, orgs I'm a member of, and partner orgs (names only via API)
alter table organizations enable row level security;
create policy org_select on organizations for select to app_user using (
  id = app_org()
  or exists (select 1 from memberships m where m.org_id = organizations.id and m.user_id = app_uid())
  or exists (select 1 from partnerships p where p.status in ('pending','active') and
       ((p.requester_org_id = app_org() and p.target_org_id = organizations.id) or
        (p.target_org_id = app_org() and p.requester_org_id = organizations.id)))
);
create policy org_insert on organizations for insert to app_user with check (id = app_org());
create policy org_update on organizations for update to app_user using (id = app_org()) with check (id = app_org());

-- memberships: my own rows (for /me/orgs) or rows of the current org
alter table memberships enable row level security;
create policy mem_select on memberships for select to app_user
  using (user_id = app_uid() or org_id = app_org());
create policy mem_write on memberships for insert to app_user with check (org_id = app_org());
create policy mem_update on memberships for update to app_user using (org_id = app_org()) with check (org_id = app_org());
create policy mem_delete on memberships for delete to app_user using (org_id = app_org());

-- partnerships: either side
alter table partnerships enable row level security;
create policy part_rw on partnerships for all to app_user
  using (requester_org_id = app_org() or target_org_id = app_org())
  with check (requester_org_id = app_org() or target_org_id = app_org());

-- profiles: own profile + profiles of members of the current org
alter table profiles enable row level security;
create policy prof_select on profiles for select to app_user using (
  id = app_uid() or exists (select 1 from memberships m where m.user_id = profiles.id and m.org_id = app_org()));
create policy prof_upsert on profiles for insert to app_user with check (id = app_uid());
create policy prof_update on profiles for update to app_user using (id = app_uid()) with check (id = app_uid());

-- permissions: global read-only
alter table permissions enable row level security;
create policy perm_read on permissions for select to app_user, ai_reader using (true);

-- platform announcements: everyone reads; writes go through platform-admin routes
alter table platform_announcements enable row level security;
create policy ann_read on platform_announcements for select to app_user using (true);
create policy ann_write on platform_announcements for insert to app_user
  with check (exists (select 1 from profiles p where p.id = app_uid() and p.is_platform_admin));
