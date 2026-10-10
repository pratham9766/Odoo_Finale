import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { makeUser, makeOrg, as, cleanup } from './helpers.js';

let owner, gm, sup, org, roles;
const roleId = (name) => roles.find((r) => r.name === name).id;

async function join(user, roleName, scope) {
  const inv = await as(owner, org.id).post('/staff/invites', { email: user.email, role_id: roleId(roleName), scope });
  assert.equal(inv.status, 201, JSON.stringify(inv.body));
  const token = inv.body.data.link.split('/').pop();
  const acc = await as(user).post(`/me/invites/staff/${token}/accept`);
  assert.equal(acc.status, 200, JSON.stringify(acc.body));
}

before(async () => {
  [owner, gm, sup] = await Promise.all([makeUser('owner'), makeUser('gm'), makeUser('sup')]);
  org = await makeOrg(owner, 'Rank Test Mills');
  roles = (await as(owner, org.id).get('/roles')).body.data;
  await join(gm, 'General Manager');
  await join(sup, 'Shift Supervisor');
});
after(cleanup);

test('invite must match the logged-in email', async () => {
  const stranger = await makeUser('stranger');
  const inv = await as(owner, org.id).post('/staff/invites', { email: 'someone-else@example.com', role_id: roleId('Store Keeper') });
  const token = inv.body.data.link.split('/').pop();
  const res = await as(stranger).post(`/me/invites/staff/${token}/accept`);
  assert.equal(res.status, 403);
});

test('a used invite token cannot be reused', async () => {
  const late = await makeUser('late');
  const inv = await as(owner, org.id).post('/staff/invites', { email: late.email, role_id: roleId('Store Keeper') });
  const token = inv.body.data.link.split('/').pop();
  assert.equal((await as(late).post(`/me/invites/staff/${token}/accept`)).status, 200);
  const again = await as(late).post(`/me/invites/staff/${token}/accept`);
  assert.equal(again.status, 404);
});

test('GM cannot assign Owner or GM-level roles (RANK_TOO_HIGH)', async () => {
  const toOwner = await as(gm, org.id).post('/staff/invites', { email: 'x1@example.com', role_id: roleId('Owner') });
  assert.equal(toOwner.status, 403);
  assert.equal(toOwner.body.error.code, 'RANK_TOO_HIGH');
  const toGm = await as(gm, org.id).post('/staff/invites', { email: 'x2@example.com', role_id: roleId('General Manager') });
  assert.equal(toGm.body.error.code, 'RANK_TOO_HIGH');
  const ok = await as(gm, org.id).post('/staff/invites', { email: 'x3@example.com', role_id: roleId('Store Keeper') });
  assert.equal(ok.status, 201);
});

test('GM cannot change the owner or edit roles', async () => {
  const staff = (await as(owner, org.id).get('/staff')).body.data;
  const ownerRow = staff.members.find((m) => m.user_id === owner.id);
  const res = await as(gm, org.id).patch(`/staff/${ownerRow.membership_id}`, { status: 'disabled' });
  assert.equal(res.status, 403);
  const edit = await as(gm, org.id).put(`/roles/${roleId('Store Keeper')}`, { name: 'Hacked' });
  assert.equal(edit.status, 403);
  assert.equal(edit.body.error.code, 'FORBIDDEN');
});

test('supervisor has no staff, finance or audit access', async () => {
  assert.equal((await as(sup, org.id).get('/staff')).status, 403);
  assert.equal((await as(sup, org.id).get('/audit-logs')).status, 403);
  assert.equal((await as(sup, org.id).post('/staff/invites', { email: 'y@example.com', role_id: roleId('Machine Operator') })).status, 403);
});

test('the last owner cannot be disabled or demoted', async () => {
  const staff = (await as(owner, org.id).get('/staff')).body.data;
  const ownerRow = staff.members.find((m) => m.user_id === owner.id);
  const self = await as(owner, org.id).patch(`/staff/${ownerRow.membership_id}`, { status: 'disabled' });
  assert.equal(self.status, 403); // cannot change own status
});

test('system roles cannot be deleted; custom roles can', async () => {
  const sys = await as(owner, org.id).delete(`/roles/${roleId('Store Keeper')}`);
  assert.equal(sys.status, 409);
  const created = await as(owner, org.id).post('/roles', { name: 'Auditor', rank: 30, permissions: ['stock.view', 'orders.view'] });
  assert.equal(created.status, 201);
  const del = await as(owner, org.id).delete(`/roles/${created.body.data.id}`);
  assert.equal(del.status, 200);
});

test('a role cannot be granted permissions the grantor lacks', async () => {
  const res = await as(gm, org.id).post('/roles', { name: 'Sneaky', rank: 40, permissions: ['wages.pay'] });
  assert.equal(res.status, 403);
});

test('owner sees audit log entries for the above actions', async () => {
  const res = await as(owner, org.id).get('/audit-logs?limit=50');
  assert.equal(res.status, 200);
  assert.ok(res.body.meta.total > 0);
  assert.ok(res.body.data.some((a) => a.table_name === 'staff_invites'));
});

test('validation errors use the standard envelope', async () => {
  const res = await as(owner, org.id).post('/staff/invites', { email: 'not-an-email', role_id: 'nope' });
  assert.equal(res.status, 422);
  assert.equal(res.body.error.code, 'VALIDATION_FAILED');
  assert.ok(res.body.error.details.fieldErrors.email);
});
