// Profile, "what may I do" (/me/access) and the staff-invite onboarding logic.
import { withTx } from '../../db/tx.js';
import { AppError, must } from '../../utils/errors.js';
import { sha256 } from '../../utils/otp.js';
import { audit } from '../../utils/audit.js';
import { loadStaff, loadMillSettings } from '../../middleware/staff.js';
import { supabaseAdmin } from '../../utils/storage.js';

// ---------- profile ----------

const PROFILE = 'id, email, full_name, phone, address, city, emergency_contact, avatar_url';

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
      `update profiles set full_name = coalesce($2, full_name), phone = coalesce($3, phone), address = coalesce($4, address),
              city = coalesce($5, city), emergency_contact = coalesce($6, emergency_contact)
        where id = $1 returning ${PROFILE}`,
      [user.id, input.full_name ?? null, input.phone ?? null, input.address ?? null, input.city ?? null, input.emergency_contact ?? null],
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

// ---------- staff invites (public side: the invitee has no account yet) ----------

export const previewInvite = (token) =>
  withTx(async (db) => {
    const inv = await resolveInvite(db, token);
    const mill = await loadMillSettings(db);
    return { mill_name: mill.name, email: inv.email, role: inv.role_name };
  });

/** Create the login (already confirmed, so no confirmation email) + the profile from the invite, in one go. */
export async function joinWithInvite(token, input) {
  const inv = await withTx((db) => resolveInvite(db, token));

  const admin = supabaseAdmin().auth.admin;
  const { data, error } = await admin.createUser({
    email: inv.email, password: input.password, email_confirm: true, user_metadata: { full_name: input.full_name },
  });
  if (error) {
    if (/already (been )?registered|already exists|email_exists/i.test(`${error.code ?? ''} ${error.message}`)) {
      throw new AppError(409, 'ACCOUNT_EXISTS', 'An account with this email already exists. Log in with it instead.');
    }
    throw new AppError(502, 'AUTH_ERROR', error.message);
  }
  const userId = data.user.id;

  try {
    await withTx(async (db) => {
      const again = await resolveInvite(db, token);
      const { rowCount } = await db.query(`update staff_invites set status = 'accepted' where id = $1 and status = 'pending'`, [again.id]);
      if (!rowCount) throw new AppError(409, 'INVALID_STATE_TRANSITION', 'This invite was already used');
      await db.query(
        `insert into profiles (id, email, full_name, phone, address, city, emergency_contact, role_id, scope, status)
         values ($1,$2,$3,$4,$5,$6,$7,$8,$9,'active')
         on conflict (id) do update set email = excluded.email, full_name = excluded.full_name, phone = excluded.phone,
           address = excluded.address, city = excluded.city, emergency_contact = excluded.emergency_contact,
           role_id = excluded.role_id, scope = excluded.scope, status = 'active'`,
        [userId, inv.email, input.full_name, input.phone, input.address, input.city, input.emergency_contact || null, again.role_id, again.scope ?? {}],
      );
      await audit(db, { userId }, { action: 'invite_accepted', table: 'profiles', id: userId, after: { role: again.role_name } });
    });
  } catch (err) {
    await admin.deleteUser(userId).catch(() => {});   // do not leave a login without a profile
    throw err;
  }
  return { email: inv.email };
}
