// The only built-in role: Owner, with every permission. Every other role is created by the owner in the app
// (Settings → Roles), and staff join by email invite with one of those roles.

const ALL = '*';

export const ROLE_DEFS = [
  { name: 'Owner', rank: 100, perms: ALL },
];

// returns [{ name, rank, perms:Set<string> }]
export function defaultRolesFor(allPermissions) {
  return ROLE_DEFS.map((def) => ({
    name: def.name,
    rank: def.rank,
    perms: new Set(def.perms === ALL ? allPermissions.map((p) => p.key) : def.perms),
  }));
}

/**
 * Create the Owner role and its permissions.
 * @returns {Promise<Map<string, string>>} role name → role id
 */
export async function createDefaultRoles(db) {
  const { rows: perms } = await db.query('select key from permissions');
  const ids = new Map();
  for (const def of defaultRolesFor(perms)) {
    const { rows: [r] } = await db.query(
      `insert into roles (name, rank, is_system) values ($1,$2,true) returning id`, [def.name, def.rank]);
    ids.set(def.name, r.id);
    if (def.perms.size) {
      await db.query(
        `insert into role_permissions (role_id, permission_key) select $1, k from unnest($2::text[]) k`,
        [r.id, [...def.perms]]);
    }
  }
  return ids;
}
