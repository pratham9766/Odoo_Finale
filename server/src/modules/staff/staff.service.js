import { env } from '../../config/env.js';
import { withTenant } from '../../db/withTenant.js';
import { AppError, must, notFound } from '../../utils/errors.js';
import { newToken, sha256 } from '../../utils/otp.js';
import { audit } from '../../utils/audit.js';
import { paged, where } from '../../utils/paginate.js';
import email from '../../utils/email.js';

// §11.2 rank rule: you may only hand out a role ranked below your own (an Owner may add another Owner)
export function assertCanAssignRank(ctx, rank) {
  const ok = rank < ctx.rank || (ctx.rank === 100 && rank === 100);
  if (!ok) throw new AppError(403, 'RANK_TOO_HIGH', 'You cannot assign a role equal to or above your own');
}

const getRole = async (db, id) => must((await db.query('select * from roles where id = $1', [id])).rows[0], 'Role');

// ---------- staff + invites ----------

export const listStaff = (ctx) =>
  withTenant(ctx, async (db) => {
    const { rows: members } = await db.query(
      `select m.id as membership_id, m.user_id, p.email, p.full_name, p.phone, m.status, m.scope, m.reports_to,
              r.id as role_id, r.name as role, r.rank, m.created_at
         from memberships m
         join roles r on r.id = m.role_id
         left join profiles p on p.id = m.user_id
        where m.org_id = $1 order by r.rank desc, p.full_name`,
      [ctx.orgId],
    );
    const { rows: invites } = await db.query(
      `select i.id, i.email, i.scope, i.expires_at, i.created_at, r.name as role
         from staff_invites i join roles r on r.id = i.role_id
        where i.status = 'pending' and i.expires_at > now() order by i.created_at desc`,
    );
    return { members, invites };
  });

export const inviteStaff = (ctx, { email: to, role_id, scope }) =>
  withTenant(ctx, async (db) => {
    const role = await getRole(db, role_id);
    assertCanAssignRank(ctx, role.rank);
    const { rowCount } = await db.query(
      `select 1 from memberships m join profiles p on p.id = m.user_id where m.org_id = $1 and lower(p.email) = $2`,
      [ctx.orgId, to],
    );
    if (rowCount) throw new AppError(409, 'DUPLICATE', 'This person is already a member');
    await db.query(`update staff_invites set status = 'revoked' where lower(email) = $1 and status = 'pending'`, [to]);

    const token = newToken();
    const { rows: [inv] } = await db.query(
      `insert into staff_invites (org_id, email, role_id, scope, token_hash, expires_at, created_by)
       values ($1,$2,$3,$4,$5, now() + interval '7 days', $6) returning id, email, expires_at`,
      [ctx.orgId, to, role_id, scope ?? {}, sha256(token), ctx.userId],
    );
    await audit(db, ctx, { action: 'invite', table: 'staff_invites', id: inv.id, after: { email: to, role: role.name } });
    const link = `${env.CLIENT_URL}/invite/staff/${token}`;
    // email after the row exists; failures must not lose the invite (link is returned for manual sharing)
    email.send({ to, template: 'staff_invite', data: { org_name: ctx.orgName, role_name: role.name, token } }).catch((e) => console.error('[invite email]', e.message));
    return { ...inv, role: role.name, link };
  });

export const revokeInvite = (ctx, id) =>
  withTenant(ctx, async (db) => {
    const { rowCount } = await db.query(`update staff_invites set status = 'revoked' where id = $1 and status = 'pending'`, [id]);
    if (!rowCount) throw notFound('Invite');
    await audit(db, ctx, { action: 'revoke', table: 'staff_invites', id });
    return { id };
  });

export const patchMember = (ctx, membershipId, patch) =>
  withTenant(ctx, async (db) => {
    const { rows: [cur] } = await db.query(
      `select m.*, r.rank, r.name as role_name from memberships m join roles r on r.id = m.role_id where m.id = $1 for update of m`,
      [membershipId],
    );
    must(cur, 'Member');
    if (cur.user_id === ctx.userId && (patch.role_id || patch.status)) {
      throw new AppError(403, 'FORBIDDEN', 'You cannot change your own role or status');
    }
    if (cur.rank >= ctx.rank && ctx.rank !== 100) throw new AppError(403, 'RANK_TOO_HIGH', 'This member outranks you');
    let newRank = cur.rank;
    if (patch.role_id) {
      const role = await getRole(db, patch.role_id);
      assertCanAssignRank(ctx, role.rank);
      newRank = role.rank;
    }
    // never leave the org without an active owner
    if ((patch.status === 'disabled' || newRank < 100) && cur.rank === 100) {
      const { rows: [{ n }] } = await db.query(
        `select count(*)::int n from memberships m join roles r on r.id = m.role_id
          where m.org_id = $1 and r.rank = 100 and m.status = 'active' and m.id <> $2`, [ctx.orgId, membershipId]);
      if (n === 0) throw new AppError(409, 'INVALID_STATE_TRANSITION', 'The organization needs at least one active owner');
    }
    if (patch.reports_to) {
      const { rowCount } = await db.query('select 1 from memberships where id = $1', [patch.reports_to]);
      if (!rowCount) throw notFound('Manager');
      if (patch.reports_to === membershipId) throw new AppError(422, 'VALIDATION_FAILED', 'A member cannot report to themselves');
    }
    const { rows: [after] } = await db.query(
      `update memberships set role_id = coalesce($2, role_id), scope = coalesce($3, scope),
              status = coalesce($4, status),
              reports_to = case when $5::boolean then $6 else reports_to end
        where id = $1 returning id, role_id, scope, status, reports_to`,
      [membershipId, patch.role_id ?? null, patch.scope ?? null, patch.status ?? null,
       'reports_to' in patch, patch.reports_to ?? null],
    );
    await audit(db, ctx, { action: 'update', table: 'memberships', id: membershipId,
      before: { role_id: cur.role_id, scope: cur.scope, status: cur.status }, after });
    return after;
  });

// ---------- roles + permissions ----------

export const listPermissions = (ctx) =>
  withTenant(ctx, async (db) => (await db.query('select * from permissions order by domain, key')).rows);

export const listRoles = (ctx) =>
  withTenant(ctx, async (db) => {
    const { rows } = await db.query(
      `select r.id, r.name, r.rank, r.is_system,
              coalesce(array_agg(rp.permission_key order by rp.permission_key) filter (where rp.permission_key is not null), '{}') as permissions,
              (select count(*)::int from memberships m where m.role_id = r.id) as members
         from roles r left join role_permissions rp on rp.role_id = r.id
        group by r.id order by r.rank desc, r.name`,
    );
    return rows;
  });

// a non-owner can only grant permissions they hold themselves
function assertCanGrant(ctx, perms) {
  if (ctx.rank === 100) return;
  const extra = perms.filter((p) => !ctx.permissions.has(p));
  if (extra.length) throw new AppError(403, 'FORBIDDEN', `You cannot grant permissions you do not have: ${extra.join(', ')}`);
}

async function setPermissions(db, ctx, roleId, perms) {
  const { rows } = await db.query('select key from permissions where key = any($1)', [perms]);
  if (rows.length !== new Set(perms).size) throw new AppError(422, 'VALIDATION_FAILED', 'Unknown permission key in list');
  await db.query('delete from role_permissions where role_id = $1', [roleId]);
  if (perms.length) {
    await db.query(
      `insert into role_permissions (role_id, permission_key, org_id) select $1, k, $2 from unnest($3::text[]) k`,
      [roleId, ctx.orgId, [...new Set(perms)]],
    );
  }
}

export const createRole = (ctx, input) =>
  withTenant(ctx, async (db) => {
    assertCanAssignRank(ctx, input.rank);
    assertCanGrant(ctx, input.permissions);
    const { rows: [r] } = await db.query(
      `insert into roles (org_id, name, rank) values ($1,$2,$3) returning id, name, rank, is_system`,
      [ctx.orgId, input.name, input.rank],
    );
    await setPermissions(db, ctx, r.id, input.permissions);
    await audit(db, ctx, { action: 'create', table: 'roles', id: r.id, after: { ...r, permissions: input.permissions } });
    return { ...r, permissions: input.permissions };
  });

export const updateRole = (ctx, id, input) =>
  withTenant(ctx, async (db) => {
    const role = await getRole(db, id);
    if (role.rank >= ctx.rank && ctx.rank !== 100) throw new AppError(403, 'RANK_TOO_HIGH', 'This role outranks you');
    if (role.rank === 100) {
      if (input.rank !== undefined && input.rank !== 100) throw new AppError(422, 'VALIDATION_FAILED', 'The Owner rank is fixed');
      if (input.name && input.name !== role.name) throw new AppError(422, 'VALIDATION_FAILED', 'The Owner role cannot be renamed');
      if (input.permissions && !input.permissions.includes('roles.manage')) {
        throw new AppError(422, 'VALIDATION_FAILED', 'The Owner role must keep roles.manage');
      }
    }
    if (input.rank !== undefined && input.rank !== role.rank) assertCanAssignRank(ctx, input.rank);
    if (input.permissions) assertCanGrant(ctx, input.permissions);
    const { rows: [r] } = await db.query(
      `update roles set name = coalesce($2, name), rank = coalesce($3, rank) where id = $1 returning id, name, rank, is_system`,
      [id, input.name ?? null, input.rank ?? null],
    );
    if (input.permissions) await setPermissions(db, ctx, id, input.permissions);
    await audit(db, ctx, { action: 'update', table: 'roles', id, before: role, after: { ...r, permissions: input.permissions } });
    return r;
  });

export const deleteRole = (ctx, id) =>
  withTenant(ctx, async (db) => {
    const role = await getRole(db, id);
    if (role.is_system) throw new AppError(409, 'INVALID_STATE_TRANSITION', 'System roles cannot be deleted');
    if (role.rank >= ctx.rank && ctx.rank !== 100) throw new AppError(403, 'RANK_TOO_HIGH', 'This role outranks you');
    const { rows: [{ n }] } = await db.query('select count(*)::int n from memberships where role_id = $1', [id]);
    if (n) throw new AppError(409, 'REFERENCE_ERROR', `${n} member(s) still have this role`);
    await db.query(`update staff_invites set status = 'revoked' where role_id = $1 and status = 'pending'`, [id]);
    await db.query('delete from roles where id = $1', [id]);
    await audit(db, ctx, { action: 'delete', table: 'roles', id, before: role });
    return { id };
  });

// ---------- audit log ----------

export const listAuditLogs = (ctx, q) =>
  withTenant(ctx, async (db) => {
    const w = where().raw('a.org_id = ?', ctx.orgId).add('a.table_name = ?', q.table).add('a.user_id = ?', q.user_id);
    const { rows, meta } = await paged(
      db,
      `select a.id, a.user_id, p.email as user_email, a.action, a.table_name, a.record_id, a.before, a.after, a.at as created_at
         from audit_logs a left join profiles p on p.id = a.user_id ${w.sql}`,
      w.params, q, 'created_at desc, id desc',
    );
    return { data: rows, meta };
  });
