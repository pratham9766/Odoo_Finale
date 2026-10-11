import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import pg from 'pg';
import { bootDatabase, enabled } from './harness.js';

// The demo seed (db/seed) and the migrations both create roles. roles.name is unique, so a name that BOTH create (QC Inspector, Store Keeper,
// …) used to make the seed fail on a freshly migrated database. This runs the real seedAll() (masters only, no Supabase: a stand-in creates the
// users) on a freshly migrated database, and again after the same table emptying that `npm run reset` does.

describe('demo seed on a freshly migrated database (real PostgreSQL)', { skip: !enabled && 'set SAMETA_TEST_ADMIN_URL to a local PostgreSQL to run' }, () => {
  let db, client, seedAll, createDefaultRoles;

  before(async () => {
    db = await bootDatabase();
    client = new pg.Client({ connectionString: db.pool.options.connectionString });
    await client.connect();
    ({ seedAll } = await import('../../../db/seed/seed.js'));
    ({ createDefaultRoles } = await import('../../src/modules/staff/defaultRoles.js'));
  });
  after(async () => { await client?.end(); await db?.drop(); });

  const createUser = async ({ email }) => {
    await client.query('insert into auth.users (id, email) values ($1, $2) on conflict (email) do nothing', [randomUUID(), email]);
    return (await client.query('select id from auth.users where email = $1', [email])).rows[0].id;
  };
  const roleNames = async () => (await client.query('select name from roles order by name')).rows.map((r) => r.name);

  test('migrations already created the default roles; the seed reuses them instead of failing', async () => {
    const before = await roleNames();
    assert.ok(before.includes('QC Inspector') && before.includes('Store Keeper'), 'migration 019_default_role_permissions created them');
    const summary = await seedAll(client, { createUser, createDefaultRoles });
    assert.equal(summary.name, 'Everest Textile Mills');
    const after = await roleNames();
    assert.equal(new Set(after).size, after.length, 'no duplicate role names');
    for (const name of ['Owner', 'Office', 'Supervisor', 'QC Inspector', 'Store Keeper', 'Operator', 'Employee', 'Production Manager', 'Accountant', 'Floor Supervisor']) assert.ok(after.includes(name), name);
  });

  test('an existing role only gains permissions: nothing it had is removed, and Owner holds every permission', async () => {
    const { rows } = await client.query(`select count(*)::int n from role_permissions rp join roles r on r.id = rp.role_id where r.name = 'Owner'`);
    const total = (await client.query('select count(*)::int n from permissions')).rows[0].n;
    assert.equal(rows[0].n, total);
    const qc = (await client.query(`select permission_key from role_permissions rp join roles r on r.id = rp.role_id where r.name = 'QC Inspector'`)).rows.map((r) => r.permission_key);
    for (const key of ['qc.view', 'qc.inspect']) assert.ok(qc.includes(key), `${key} (the default) is still there`);
  });

  test('it also works after the table emptying that `npm run reset` does (permissions and the migration ledger are kept)', async () => {
    const tables = (await client.query(`select tablename from pg_tables where schemaname = 'public'`)).rows.map((r) => r.tablename).filter((t) => !['permissions', 'schema_migrations'].includes(t));
    await client.query(`truncate ${tables.map((t) => `public."${t}"`).join(', ')} restart identity cascade`);
    await seedAll(client, { createUser, createDefaultRoles });
    const names = await roleNames();
    assert.equal(new Set(names).size, names.length);
    assert.ok(names.includes('Employee'));
  });
});
