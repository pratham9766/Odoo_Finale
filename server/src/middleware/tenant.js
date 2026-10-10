import { z } from 'zod';
import { withTenant } from '../db/withTenant.js';
import { AppError } from '../utils/errors.js';

const uuid = z.string().uuid();

// membership + role + permissions of a user in an org; runs inside an open transaction
export async function loadMemberContext(db, userId, orgId) {
  const { rows } = await db.query(
    `select m.id, m.scope, r.id as role_id, r.name as role, r.rank,
            o.name as org_name, o.types, o.status as org_status, o.settings, o.connect_code,
            coalesce(array_agg(rp.permission_key) filter (where rp.permission_key is not null), '{}') as permissions
       from memberships m
       join roles r on r.id = m.role_id
       join organizations o on o.id = m.org_id
       left join role_permissions rp on rp.role_id = r.id
      where m.user_id = $1 and m.org_id = $2 and m.status = 'active'
      group by m.id, r.id, o.id`,
    [userId, orgId],
  );
  return rows[0] ?? null;
}

export function buildCtx(user, orgId, m) {
  return {
    userId: user.id,
    email: user.email,
    orgId,
    orgName: m.org_name,
    membershipId: m.id,
    roleId: m.role_id,
    role: m.role,
    rank: m.rank,
    permissions: new Set(m.permissions),
    scope: m.scope ?? {},
    orgTypes: m.types,
    modules: m.settings?.modules ?? {},
    settings: m.settings ?? {},
  };
}

export async function tenant(req, _res, next) {
  const orgId = req.headers['x-org-id'];
  if (!uuid.safeParse(orgId).success) return next(new AppError(400, 'ORG_REQUIRED', 'Select an organization'));
  try {
    const m = await withTenant({ orgId, userId: req.user.id }, (db) => loadMemberContext(db, req.user.id, orgId));
    if (!m) return next(new AppError(403, 'NOT_A_MEMBER', 'You do not have access to this organization'));
    if (m.org_status !== 'active') return next(new AppError(403, 'ORG_SUSPENDED', 'This organization is not active'));
    req.ctx = buildCtx(req.user, orgId, m);
    next();
  } catch (err) {
    next(err);
  }
}

/**
 * Contract (seed simulation, scripts): the same ctx the tenant middleware builds, for a user acting in an org outside HTTP.
 * Throws NOT_A_MEMBER when the user has no active membership.
 */
export async function loadContext(orgId, userId) {
  const m = await withTenant({ orgId, userId }, async (db) => {
    const row = await loadMemberContext(db, userId, orgId);
    const { rows: [p] } = await db.query('select email from profiles where id = $1', [userId]);
    return row && { ...row, email: p?.email ?? null };
  });
  if (!m) throw new AppError(403, 'NOT_A_MEMBER', 'User is not a member of this organization');
  return buildCtx({ id: userId, email: m.email }, orgId, m);
}
