import { withTx } from '../../db/tx.js';
import { AppError, must } from '../../utils/errors.js';
import { sha256 } from '../../utils/otp.js';
import { audit } from '../../utils/audit.js';
import { loadStaff, loadMillSettings } from '../../middleware/staff.js';

// ---------- profile ----------

const PROFILE = 'id, email, full_name, phone, avatar_url';

async function ensureProfile(db, user) {
  const { rows: [p] } = await db.query(
    `insert into profiles (id, email) values ($1, $2)
     on conflict (id) do update set email = coalesce(excluded.email, profiles.email)
     returning ${PROFILE}`,
    [user.id, user.email ?? null],
  );
  return p;
}

export const getMe = (user) => withTx((db) => ensureProfile(db, user));

export const updateProfile = (user, input) =>
  withTx(async (db) => {
    await ensureProfile(db, user);
    const { rows: [p] } = await db.query(
      `update profiles set full_name = coalesce($2, full_name), phone = coalesce($3, phone) where id = $1 returning ${PROFILE}`,
      [user.id, input.full_name ?? null, input.phone ?? null],
    );
    return p;
  });

// ---------- what the logged-in user may do (the frontend's access context) ----------

export const myAccess = (user) =>
  withTx(async (db) => {
    await ensureProfile(db, user);
    const s = await loadStaff(db, user.id);
    const mill = await loadMillSettings(db);
    if (!s) return { staff: false, mill: { name: mill.name } };       // signed up, not given a role yet
    return {
      staff: true,
      status: s.status,
      mill: { name: mill.name, modules: mill.settings?.modules ?? {} },
      user: { id: s.id, email: s.email, full_name: s.full_name },
      role: { id: s.role_id, name: s.role, rank: s.rank },
      permissions: [...s.permissions].sort(),
      scope: s.scope ?? {},
    };
  });

// ---------- staff invites (accept side) ----------

async function resolveInvite(db, token) {
  const { rows: [inv] } = await db.query(
    `select i.id, i.email, i.role_id, i.scope, r.name as role_name
       from staff_invites i join roles r on r.id = i.role_id
      where i.token_hash = $1 and i.status = 'pending' and i.expires_at > now()`, [sha256(token)]);
  return must(inv, 'Invite (it may have expired)');
}

export const getStaffInvite = (user, token) =>
  withTx(async (db) => {
    const inv = await resolveInvite(db, token);
    const mill = await loadMillSettings(db);
    return { mill_name: mill.name, email: inv.email, role: inv.role_name, matches_user: inv.email.toLowerCase() === (user.email ?? '').toLowerCase() };
  });

export async function acceptStaffInvite(user, token) {
  return withTx(async (db) => {
    const inv = await resolveInvite(db, token);
    if (inv.email.toLowerCase() !== (user.email ?? '').toLowerCase()) {
      throw new AppError(403, 'FORBIDDEN', `This invite was sent to ${inv.email}. Log in with that email.`);
    }
    await ensureProfile(db, user);
    await db.query(`update profiles set role_id = $2, scope = $3, status = 'active' where id = $1`, [user.id, inv.role_id, inv.scope ?? {}]);
    await db.query(`update staff_invites set status = 'accepted' where id = $1`, [inv.id]);
    await audit(db, { userId: user.id }, { action: 'invite_accepted', table: 'profiles', id: user.id });
    return { role: inv.role_name };
  });
}
