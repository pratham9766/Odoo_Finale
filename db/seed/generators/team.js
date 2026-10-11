// The rest of the team: the roles beyond Owner, the staff who log in with them, and the invites still waiting to be accepted.
// createUser({ email, fullName }) → auth user id (Supabase Admin API in the CLI), passed in like in access.js.

import { createHash, randomBytes } from 'node:crypto';

const INVITE_DAYS = 7;

/** "orders.*" → every permission key of that domain prefix; anything else is an exact key */
function expand(patterns, allKeys) {
  const keys = new Set();
  for (const p of patterns) {
    if (p.endsWith('.*')) allKeys.filter((k) => k.startsWith(p.slice(0, -1))).forEach((k) => keys.add(k));
    else if (allKeys.includes(p)) keys.add(p);
    else throw new Error(`Unknown permission "${p}" in the team config`);
  }
  return [...keys];
}

export async function seedTeam(db, profile, { createUser }) {
  const { team } = profile;
  const { rows: perms } = await db.query('select key from permissions');
  const allKeys = perms.map((p) => p.key);

  const roleId = new Map();
  for (const r of team.roles) {
    // A role of this name may already exist (the built-in defaults, or migration 019_default_role_permissions): reuse it and add this
    // demo team's permissions to it, instead of failing on the unique role name.
    const { rows: [row] } = await db.query(`insert into roles (name, rank) values ($1, $2) on conflict (name) do update set rank = excluded.rank returning id`, [r.name, r.rank]);
    roleId.set(r.name, row.id);
    await db.query(`insert into role_permissions (role_id, permission_key) select $1, k from unnest($2::text[]) k on conflict do nothing`, [row.id, expand(r.perms, allKeys)]);
  }

  for (const u of team.users) {
    const id = await createUser({ email: u.email, fullName: u.name });
    await db.query(
      `insert into profiles (id, email, full_name, phone, city, role_id) values ($1, $2, $3, $4, $5, $6)
       on conflict (id) do update set email = excluded.email, full_name = excluded.full_name, phone = excluded.phone, city = excluded.city, role_id = excluded.role_id`,
      [id, u.email, u.name, u.phone ?? null, u.city ?? null, roleId.get(u.role)]);
  }

  for (const inv of team.invites) {
    const token = randomBytes(32).toString('base64url');
    await db.query(
      `insert into staff_invites (email, role_id, token_hash, expires_at) values ($1, $2, $3, now() + make_interval(days => $4))`,
      [inv.email, roleId.get(inv.role), createHash('sha256').update(token).digest('hex'), INVITE_DAYS]);
  }
  return { roles: team.roles.length, users: team.users.length, invites: team.invites.length };
}
