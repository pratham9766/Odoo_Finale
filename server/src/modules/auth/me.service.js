import { randomUUID, randomBytes } from 'node:crypto';
import { env } from '../../config/env.js';
import { withTenant } from '../../db/withTenant.js';
import { AppError, must } from '../../utils/errors.js';
import { sha256 } from '../../utils/otp.js';
import { audit } from '../../utils/audit.js';
import { emit } from '../../events/bus.js';
import { loadMemberContext } from '../../middleware/tenant.js';
import { createDefaultRoles } from '../staff/defaultRoles.js';

const NO_ORG = (user) => ({ orgId: null, userId: user.id });

// ---------- profile ----------

async function ensureProfile(db, user) {
  const { rows: [p] } = await db.query(
    `insert into profiles (id, email) values ($1, $2)
     on conflict (id) do update set email = coalesce(excluded.email, profiles.email)
     returning id, email, full_name, phone, avatar_url, is_platform_admin`,
    [user.id, user.email ?? null],
  );
  return p;
}

export const getMe = (user) => withTenant(NO_ORG(user), (db) => ensureProfile(db, user));

export const updateProfile = (user, input) =>
  withTenant(NO_ORG(user), async (db) => {
    await ensureProfile(db, user);
    const { rows: [p] } = await db.query(
      `update profiles set full_name = coalesce($2, full_name), phone = coalesce($3, phone)
        where id = $1 returning id, email, full_name, phone, avatar_url, is_platform_admin`,
      [user.id, input.full_name ?? null, input.phone ?? null],
    );
    return p;
  });

// ---------- orgs ----------

export const listMyOrgs = (user) =>
  withTenant(NO_ORG(user), async (db) => (await db.query('select * from my_orgs()')).rows);

// what the frontend OrgContext needs (same data the tenant middleware builds)
export const orgContext = (user, orgId) =>
  withTenant({ orgId, userId: user.id }, async (db) => {
    const m = await loadMemberContext(db, user.id, orgId);
    if (!m) throw new AppError(403, 'NOT_A_MEMBER', 'You do not have access to this organization');
    return {
      org: { id: orgId, name: m.org_name, types: m.types, status: m.org_status, connect_code: m.connect_code, modules: m.settings?.modules ?? {} },
      role: { id: m.role_id, name: m.role, rank: m.rank },
      permissions: [...m.permissions].sort(),
      scope: m.scope ?? {},
      membership_id: m.id,
    };
  });

const CODE_CHARS = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
function codeFor(name) {
  const letters = (name.toUpperCase().replace(/[^A-Z]/g, '') + 'XXX').slice(0, 3);
  let tail = '';
  const bytes = randomBytes(4);
  for (const b of bytes) tail += CODE_CHARS[b % CODE_CHARS.length];
  return `${letters}-${tail}`;
}

async function uniqueConnectCode(db, name) {
  for (let i = 0; i < 8; i++) {
    const code = codeFor(name);
    const { rowCount } = await db.query('select 1 from find_org_by_code($1)', [code]);
    if (!rowCount) return code;
  }
  throw new AppError(500, 'INTERNAL', 'Could not generate a connect code');
}

const DEFAULT_STAGES = [
  { name: 'Spinning', output_kind: 'yarn', weight_loss_pct: 12, length_shrink_pct: 0 },
  { name: 'Weaving', output_kind: 'grey_fabric', weight_loss_pct: 3, length_shrink_pct: 0 },
  { name: 'Dyeing', output_kind: 'finished_fabric', weight_loss_pct: 5, length_shrink_pct: 4 },
];
const DEFAULT_SHIFTS = [
  { name: 'A', start_time: '06:00', end_time: '14:00', grace_min: 10 },
  { name: 'B', start_time: '14:00', end_time: '22:00', grace_min: 10 },
  { name: 'C', start_time: '22:00', end_time: '06:00', grace_min: 10 },
];
const DEFECTS = [
  ['HOLE', 'Hole', 3], ['COLOUR', 'Colour mismatch', 2], ['UNEVEN', 'Uneven weave', 2],
  ['STAIN', 'Stain', 1], ['BROKEN_END', 'Broken end', 1],
];
const WAREHOUSES = [['Raw material', 'raw'], ['Work in progress', 'wip'], ['Finished goods', 'finished'], ['Scrap', 'scrap']];

// §11.1 — org creation. The org id is generated first so every insert passes the app_org() policies.
export async function createOrg(user, input) {
  const orgId = randomUUID();
  const org = await withTenant({ orgId, userId: user.id }, async (db) => {
    await ensureProfile(db, user);
    const code = await uniqueConnectCode(db, input.name);
    const status = env.ORG_APPROVAL_REQUIRED ? 'pending' : 'active';
    const { rows: [o] } = await db.query(
      `insert into organizations (id, name, types, gstin, address, city, state, pincode, phone, email, connect_code, status, settings, created_by)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11,$12,$13,$14) returning *`,
      [orgId, input.name, input.types, input.gstin ?? null, input.address ?? null, input.city ?? null,
       input.state ?? null, input.pincode ?? null, input.phone ?? null, input.email ?? null, code, status,
       { modules: {}, timezone: 'Asia/Kolkata', currency: 'INR', unmoved_days: 7 }, user.id],
    );

    // default roles + permissions
    const roles = await createDefaultRoles(db, orgId, input.types);
    const ownerRoleId = roles.get('Owner');
    await db.query(`insert into memberships (org_id, user_id, role_id) values ($1,$2,$3)`, [orgId, user.id, ownerRoleId]);

    if (input.types.includes('manufacturer')) {
      const stages = input.stages?.length ? input.stages : DEFAULT_STAGES;
      for (const [i, s] of stages.entries()) {
        const { rows: [st] } = await db.query(
          `insert into stages (org_id, name, sequence, output_kind) values ($1,$2,$3,$4) returning id`,
          [orgId, s.name, i + 1, s.output_kind ?? null],
        );
        await db.query(
          `insert into stage_losses (org_id, stage_id, weight_loss_pct, length_shrink_pct) values ($1,$2,$3,$4)`,
          [orgId, st.id, s.weight_loss_pct ?? 0, s.length_shrink_pct ?? 0],
        );
      }
      for (const sh of input.shifts?.length ? input.shifts : DEFAULT_SHIFTS) {
        // crosses_midnight is a generated column (010)
        await db.query(
          `insert into shifts (org_id, name, start_time, end_time, grace_min) values ($1,$2,$3,$4,$5)`,
          [orgId, sh.name, sh.start_time, sh.end_time, sh.grace_min ?? 10],
        );
      }
      for (const [code, name, sev] of DEFECTS) {
        await db.query(`insert into defect_types (org_id, code, name, severity_default) values ($1,$2,$3,$4)`, [orgId, code, name, sev]);
      }
    }
    for (const [name, kind] of WAREHOUSES) {
      if (kind === 'raw' || input.types.includes('manufacturer')) {
        await db.query(`insert into warehouses (org_id, name, kind) values ($1,$2,$3)`, [orgId, name, kind]);
      }
    }
    await audit(db, { orgId, userId: user.id }, { action: 'create', table: 'organizations', id: orgId, after: { name: o.name, types: o.types } });
    return o;
  });
  emit('org.created', { orgId, userId: user.id });
  return org;
}

// ---------- staff invites (accept side) ----------

async function resolveStaffInvite(db, token) {
  const { rows: [inv] } = await db.query('select * from resolve_staff_invite($1)', [sha256(token)]);
  return must(inv, 'Invite (it may have expired)');
}

export const getStaffInvite = (user, token) =>
  withTenant(NO_ORG(user), async (db) => {
    const inv = await resolveStaffInvite(db, token);
    return { org_name: inv.org_name, email: inv.email, role: inv.role_name, matches_user: inv.email.toLowerCase() === user.email };
  });

export async function acceptStaffInvite(user, token) {
  const inv = await withTenant(NO_ORG(user), (db) => resolveStaffInvite(db, token));
  if (inv.email.toLowerCase() !== user.email) {
    throw new AppError(403, 'FORBIDDEN', `This invite was sent to ${inv.email}. Log in with that email.`);
  }
  const membership = await withTenant({ orgId: inv.org_id, userId: user.id }, async (db) => {
    await ensureProfile(db, user);
    const { rows: [m] } = await db.query(
      `insert into memberships (org_id, user_id, role_id, scope) values ($1,$2,$3,$4) returning id`,
      [inv.org_id, user.id, inv.role_id, inv.scope ?? {}],
    );
    await db.query(`update staff_invites set status = 'accepted' where id = $1`, [inv.invite_id]);
    await audit(db, { orgId: inv.org_id, userId: user.id }, { action: 'invite_accepted', table: 'memberships', id: m.id });
    return m;
  });
  return { org_id: inv.org_id, membership_id: membership.id };
}

// ---------- partner email invites (accept side) ----------

export const getPartnerInvite = (user, token) =>
  withTenant(NO_ORG(user), async (db) => {
    const { rows: [inv] } = await db.query('select * from resolve_partner_invite($1)', [sha256(token)]);
    must(inv, 'Invite');
    return { requester_name: inv.requester_name, relation: inv.relation, invited_email: inv.invited_email };
  });

export async function acceptPartnerInvite(user, token, orgId) {
  const result = await withTenant({ orgId, userId: user.id }, async (db) => {
    const m = await loadMemberContext(db, user.id, orgId);
    if (!m) throw new AppError(403, 'NOT_A_MEMBER', 'You do not belong to this organization');
    if (!m.permissions.includes('partners.approve')) throw new AppError(403, 'FORBIDDEN', 'Missing permission: partners.approve');
    const { rows: [p] } = await db.query('select * from accept_partner_invite($1, $2)', [sha256(token), orgId]);
    return must(p, 'Invite (it may have been used already)');
  });
  emit('partner.accepted', { partnershipId: result.partnership_id, requesterOrgId: result.requester_org_id, targetOrgId: orgId });
  return { partnership_id: result.partnership_id };
}
