-- 019 (Vipul): accepting an email partner invite. The row has target_org_id = null, so RLS hides it
-- from the accepting org; this definer function claims it for p_org in one atomic update.
create or replace function accept_partner_invite(p_token_hash text, p_org uuid)
returns table (partnership_id uuid, requester_org_id uuid, relation text)
language sql security definer set search_path = public as $$
  update partnerships p
     set target_org_id = p_org, status = 'active', responded_at = now(), token_hash = null
   where p.token_hash = p_token_hash and p.status = 'pending' and p.target_org_id is null
     and p.requester_org_id <> p_org
  returning p.id, p.requester_org_id, p.relation
$$;

revoke all on function accept_partner_invite from public;
grant execute on function accept_partner_invite to app_user;
