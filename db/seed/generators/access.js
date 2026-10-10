// Roles and demo logins. Both collaborators are passed in, so this file depends on neither:
//   createDefaultRoles(db) → Map(roleName → roleId)         (server/src/modules/staff/defaultRoles.js)
//   createUser({ email, fullName }) → auth user id           (Supabase Admin API in the CLI)

import { need } from '../lib/insert.js';

// scope in config uses names: { stages: ['Weaving'] } → { stage_ids: [<id>] }
function resolveScope(scope = {}, ids) {
  const maps = { stages: ids.stageId, shifts: ids.shiftId, machines: ids.machineId, warehouses: ids.warehouseId };
  return Object.fromEntries(Object.entries(scope).map(([kind, names]) => {
    const what = kind.slice(0, -1);
    return [`${what}_ids`, names.map((n) => need(maps[kind], n, what))];
  }));
}

export async function seedAccess(db, profile, ids, { createUser, createDefaultRoles }) {
  const users = profile.users;
  const roles = await createDefaultRoles(db);

  for (const u of users) {
    const roleId = roles.get(u.role);
    if (!roleId) throw new Error(`Role "${u.role}" (for ${u.email}) does not exist. Roles created: ${[...roles.keys()].join(', ')}`);
    const userId = await createUser({ email: u.email, fullName: u.name });
    await db.query(
      `insert into profiles (id, email, full_name, phone, address, city, role_id, scope) values ($1, $2, $3, $4, $5, $6, $7, $8)
       on conflict (id) do update set email = excluded.email, full_name = excluded.full_name, phone = excluded.phone,
         address = excluded.address, city = excluded.city, role_id = excluded.role_id, scope = excluded.scope`,
      [userId, u.email, u.name, u.phone ?? null, u.address ?? null, u.city ?? null, roleId, JSON.stringify(resolveScope(u.scope, ids))]);
    if (u.worker) {   // an operator is both a login and a worker
      await db.query(`update workers set user_id = $1 where id = $2`, [userId, need(ids.workerId, u.worker, 'worker')]);
    }
  }
  return { users: users.length };
}
