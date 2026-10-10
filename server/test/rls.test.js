import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { makeUser, makeOrg, as, cleanup } from './helpers.js';
import { withTenant } from '../src/db/withTenant.js';

let alice, bob, orgA, orgB;

before(async () => {
  [alice, bob] = await Promise.all([makeUser('alice'), makeUser('bob')]);
  orgA = await makeOrg(alice, 'Alpha Mills');
  orgB = await makeOrg(bob, 'Beta Textiles');
});
after(cleanup);

test('each user only lists their own organizations', async () => {
  const a = await as(alice).get('/me/orgs');
  assert.equal(a.status, 200);
  assert.deepEqual(a.body.data.map((o) => o.org_id), [orgA.id]);
  const b = await as(bob).get('/me/orgs');
  assert.deepEqual(b.body.data.map((o) => o.org_id), [orgB.id]);
});

test('using another tenant org id is rejected', async () => {
  const res = await as(alice, orgB.id).get('/staff');
  assert.equal(res.status, 403);
  assert.equal(res.body.error.code, 'NOT_A_MEMBER');
});

test('requests without a token or org header fail clearly', async () => {
  const noAuth = await (await import('./helpers.js')).api().get('/api/v1/staff');
  assert.equal(noAuth.status, 401);
  assert.equal(noAuth.body.error.code, 'UNAUTHENTICATED');
  const noOrg = await as(alice).get('/staff');
  assert.equal(noOrg.status, 400);
  assert.equal(noOrg.body.error.code, 'ORG_REQUIRED');
});

test('org context carries role, permissions and connect code', async () => {
  const res = await as(alice).get(`/me/orgs/${orgA.id}/context`);
  assert.equal(res.status, 200);
  assert.equal(res.body.data.role.name, 'Owner');
  assert.equal(res.body.data.role.rank, 100);
  assert.ok(res.body.data.permissions.includes('roles.manage'));
  assert.match(res.body.data.org.connect_code, /^[A-Z]{3}-[A-Z0-9]{4}$/);
  const other = await as(alice).get(`/me/orgs/${orgB.id}/context`);
  assert.equal(other.status, 403);
});

test('manufacturer onboarding seeds stages, shifts, defect types, warehouses', async () => {
  await withTenant({ orgId: orgA.id, userId: alice.id }, async (db) => {
    const n = async (t) => (await db.query(`select count(*)::int c from ${t}`)).rows[0].c;
    assert.equal(await n('stages'), 3);
    assert.equal(await n('shifts'), 3);
    assert.equal(await n('defect_types'), 5);
    assert.equal(await n('warehouses'), 4);
    assert.ok((await n('roles')) >= 10);
  });
});

test('SQL as app_user with app.org_id = A sees nothing from B', async () => {
  await withTenant({ orgId: orgA.id, userId: alice.id }, async (db) => {
    for (const t of ['stages', 'roles', 'shifts', 'warehouses', 'defect_types', 'memberships', 'role_permissions']) {
      const { rows } = await db.query(`select count(*)::int c from ${t} where org_id = $1`, [orgB.id]);
      assert.equal(rows[0].c, 0, `${t} leaked rows from org B`);
    }
    const { rows } = await db.query('select id from organizations where id = $1', [orgB.id]);
    assert.equal(rows.length, 0, 'organization B visible to A');
  });
});

test('writing a row for another tenant violates RLS', async () => {
  await assert.rejects(
    withTenant({ orgId: orgA.id, userId: alice.id }, (db) =>
      db.query(`insert into warehouses (org_id, name, kind) values ($1, 'evil', 'raw')`, [orgB.id])),
    (err) => err.code === '42501',
  );
});

test('with no tenant set, tenant tables are empty', async () => {
  await withTenant({ orgId: null, userId: null }, async (db) => {
    const { rows } = await db.query('select count(*)::int c from stages');
    assert.equal(rows[0].c, 0);
  });
});

test('frontend roles (anon/authenticated) have no table privileges', async () => {
  const { sqlAdmin } = await import('./helpers.js');
  const { rows } = await sqlAdmin(
    `select count(*)::int c from information_schema.role_table_grants
      where grantee in ('anon','authenticated') and table_schema = 'public'`);
  assert.equal(rows[0].c, 0);
});

test('all public tables have RLS enabled', async () => {
  const { sqlAdmin } = await import('./helpers.js');
  const { rows } = await sqlAdmin(
    `select tablename from pg_tables where schemaname = 'public' and not rowsecurity and tablename <> 'schema_migrations'`);
  assert.deepEqual(rows, []);
});
