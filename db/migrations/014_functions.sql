-- 014: SECURITY DEFINER lookups — the only ways to cross tenants without a tenant context.
-- Each returns minimal fields and pins search_path.

-- find an org by connect code (partner connect)
create or replace function find_org_by_code(p_code text)
returns table (id uuid, name text, types text[], city text)
language sql security definer set search_path = public stable as $$
  select o.id, o.name, o.types, o.city from organizations o
  where o.connect_code = upper(trim(p_code)) and o.status = 'active'
$$;

-- resolve a staff invite token (hash) -> org, email, role
create or replace function resolve_staff_invite(p_token_hash text)
returns table (invite_id uuid, org_id uuid, org_name text, email text, role_id uuid, role_name text, scope jsonb)
language sql security definer set search_path = public stable as $$
  select i.id, i.org_id, o.name, i.email, i.role_id, r.name, i.scope
  from staff_invites i
  join organizations o on o.id = i.org_id
  join roles r on r.id = i.role_id
  where i.token_hash = p_token_hash and i.status = 'pending' and i.expires_at > now()
$$;

-- resolve a partner email invite token
create or replace function resolve_partner_invite(p_token_hash text)
returns table (partnership_id uuid, requester_org_id uuid, requester_name text, relation text, invited_email text)
language sql security definer set search_path = public stable as $$
  select p.id, p.requester_org_id, o.name, p.relation, p.invited_email
  from partnerships p join organizations o on o.id = p.requester_org_id
  where p.token_hash = p_token_hash and p.status = 'pending' and p.target_org_id is null
$$;

-- kiosk device token -> org
create or replace function resolve_kiosk_device(p_token_hash text)
returns table (device_id uuid, org_id uuid, org_name text)
language sql security definer set search_path = public stable as $$
  select d.id, d.org_id, o.name from kiosk_devices d join organizations o on o.id = d.org_id
  where d.token_hash = p_token_hash and d.active and o.status = 'active'
$$;

-- public tracking (no prices, no internals)
create or replace function public_track(p_token text) returns jsonb
language sql security definer set search_path = public stable as $$
  select jsonb_build_object(
    'order_no', o.order_no, 'mill', s.name, 'status', o.status, 'progress_pct', o.progress_pct,
    'current_stage', o.current_stage, 'deadline', o.deadline, 'expected_completion', o.expected_completion,
    'lines', (select jsonb_agg(jsonb_build_object('description', coalesce(l.description, i.name),
                                                  'colour', l.colour, 'qty', l.qty, 'uom', l.uom))
              from order_lines l join items i on i.id = l.item_id where l.order_id = o.id),
    'events', (select jsonb_agg(jsonb_build_object('event', e.event, 'at', e.created_at) order by e.created_at)
               from order_events e where e.order_id = o.id and e.visible_to_buyer))
  from orders o join organizations s on s.id = o.seller_org_id
  where o.tracking_token = p_token
$$;

-- platform admin overview (called only by platform-admin routes)
create or replace function platform_org_overview()
returns table (id uuid, name text, types text[], status text, city text, created_at timestamptz,
               users bigint, orders bigint)
language sql security definer set search_path = public stable as $$
  select o.id, o.name, o.types, o.status, o.city, o.created_at,
         (select count(*) from memberships m where m.org_id = o.id),
         (select count(*) from orders x where x.seller_org_id = o.id or x.buyer_org_id = o.id)
  from organizations o order by o.created_at desc
$$;

create or replace function platform_set_org_status(p_org uuid, p_status text) returns void
language sql security definer set search_path = public as $$
  update organizations set status = p_status where id = p_org
$$;

create or replace function platform_usage()
returns table (orgs bigint, active_orgs bigint, users bigint, orders_30d bigint, dispatches_30d bigint, ai_questions_30d bigint)
language sql security definer set search_path = public stable as $$
  select (select count(*) from organizations),
         (select count(*) from organizations where status = 'active'),
         (select count(distinct user_id) from memberships),
         (select count(*) from orders where created_at > now() - interval '30 days'),
         (select count(*) from dispatches where created_at > now() - interval '30 days'),
         (select count(*) from ai_messages where role = 'user' and created_at > now() - interval '30 days')
$$;

-- fix 22.6 #3: orgs of the calling user (roles RLS hides other orgs' roles when no org is set)
create or replace function my_orgs()
returns table (org_id uuid, name text, types text[], status text, connect_code text, logo_url text,
               membership_id uuid, role_id uuid, role_name text, rank int, membership_status text)
language sql security definer set search_path = public stable as $$
  select o.id, o.name, o.types, o.status, o.connect_code, o.logo_url,
         m.id, r.id, r.name, r.rank, m.status
  from memberships m
  join organizations o on o.id = m.org_id
  join roles r on r.id = m.role_id
  where m.user_id = app_uid()
  order by o.name
$$;

-- fix 22.6 #5: cron iteration
create or replace function list_active_orgs() returns setof uuid
language sql security definer set search_path = public stable as $$
  select id from organizations where status = 'active'
$$;

revoke all on function find_org_by_code, resolve_staff_invite, resolve_partner_invite,
  resolve_kiosk_device, public_track, platform_org_overview, platform_set_org_status, platform_usage,
  my_orgs, list_active_orgs from public;
grant execute on function find_org_by_code, resolve_staff_invite, resolve_partner_invite,
  resolve_kiosk_device, public_track, platform_org_overview, platform_set_org_status, platform_usage,
  my_orgs, list_active_orgs to app_user;
