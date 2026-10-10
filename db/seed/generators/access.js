// Roles, demo logins and memberships. Both collaborators are passed in, so this file depends on neither:
//   createDefaultRoles(db, orgId, types) → Map(roleName → roleId)   (Vipul's staff/defaultRoles.js; /me/orgs needs the same function)
//   createUser({ email, fullName }) → auth user id                  (Supabase Admin API in the CLI; a fake in tests)

import { insertRows, need } from '../lib/insert.js';

// scope in config uses names: { stages: ['Weaving'] } → { stage_ids: [<id>] }
function resolveScope(scope = {}, ids) {
  const maps = { stages: ids.stageId, shifts: ids.shiftId, machines: ids.machineId, warehouses: ids.warehouseId };
  return Object.fromEntries(Object.entries(scope).map(([kind, names]) => {
    const what = kind.slice(0, -1);
    return [`${what}_ids`, names.map((n) => need(maps[kind], n, what))];
  }));
}

export async function seedAccess(db, org, profile, ids, { createUser, createDefaultRoles }) {
  const users = profile.users;
  const roles = await createDefaultRoles(db, org.id, org.types);

  for (const u of users) {
    const roleId = roles.get(u.role);
    if (!roleId) {
      throw new Error(`Role "${u.role}" (for ${u.email}) does not exist in ${org.name}. Roles created: ${[...roles.keys()].join(', ')}`);
    }
    const userId = await createUser({ email: u.email, fullName: u.name });
    await db.query(
      `insert into profiles (id, full_name) values ($1, $2)
       on conflict (id) do update set full_name = excluded.full_name`, [userId, u.name]);
    await insertRows(db, 'memberships', [{
      org_id: org.id, user_id: userId, role_id: roleId, scope: JSON.stringify(resolveScope(u.scope, ids)),
    }]);
    if (u.worker) {   // an operator is both a login and a worker with a badge
      await db.query(`update workers set user_id = $1 where id = $2`, [userId, need(ids.workerId, u.worker, 'worker')]);
    }
  }
  return { users: users.length };
}
