import { withTx } from '../db/tx.js';
import { AppError } from '../utils/errors.js';

// a staff member's role, permissions and scope; runs inside an open transaction
export async function loadStaff(db, userId) {
  const { rows } = await db.query(
    `select p.id, p.email, p.full_name, p.scope, p.status, r.id as role_id, r.name as role, r.rank,
            coalesce(array_agg(rp.permission_key) filter (where rp.permission_key is not null), '{}') as permissions
       from profiles p
       join roles r on r.id = p.role_id
       left join role_permissions rp on rp.role_id = r.id
      where p.id = $1
      group by p.id, r.id`,
    [userId],
  );
  return rows[0] ?? null;
}

export async function loadMillSettings(db) {
  const { rows: [m] } = await db.query('select name, settings from mill');
  return m ?? { name: null, settings: {} };
}

export function buildCtx(user, s, mill) {
  return {
    userId: user.id,
    email: user.email ?? s.email,
    fullName: s.full_name,
    millName: mill.name,
    roleId: s.role_id,
    role: s.role,
    rank: s.rank,
    permissions: new Set(s.permissions),
    scope: s.scope ?? {},
    modules: mill.settings?.modules ?? {},
    settings: mill.settings ?? {},
  };
}

/** After auth: the logged-in user must be active staff of the mill (a profile with a role). */
export async function staff(req, _res, next) {
  try {
    const { s, mill } = await withTx(async (db) => ({ s: await loadStaff(db, req.user.id), mill: await loadMillSettings(db) }));
    if (!s) return next(new AppError(403, 'NOT_STAFF', 'Your account has not been given access to the mill yet'));
    if (s.status !== 'active') return next(new AppError(403, 'ACCOUNT_DISABLED', 'Your account is disabled'));
    req.ctx = buildCtx(req.user, s, mill);
    next();
  } catch (err) {
    next(err);
  }
}

/** The same ctx the middleware builds, for a user acting outside HTTP (seed simulation, scripts). */
export async function loadContext(userId) {
  const { s, mill } = await withTx(async (db) => ({ s: await loadStaff(db, userId), mill: await loadMillSettings(db) }));
  if (!s) throw new AppError(403, 'NOT_STAFF', 'User is not staff of the mill');
  return buildCtx({ id: userId, email: s.email }, s, mill);
}
