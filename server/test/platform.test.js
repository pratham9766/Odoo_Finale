import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { makeUser, makeOrg, as, api, cleanup, sqlAdmin } from './helpers.js';

let admin, user, org, M;
const adm = (u) => ({
  get: (p) => api().get(`/api/v1/admin${p}`).set('Authorization', `Bearer ${u.token}`),
  post: (p, b) => api().post(`/api/v1/admin${p}`).set('Authorization', `Bearer ${u.token}`).send(b ?? {}),
});

before(async () => {
  [admin, user] = await Promise.all([makeUser('padmin'), makeUser('puser')]);
  org = await makeOrg(user, 'Suspendable Mills');
  M = as(user, org.id);
  await as(admin).get('/me'); // creates the profile row
  await sqlAdmin('update profiles set is_platform_admin = true where id = $1', [admin.id]);
});
after(cleanup);

test('platform routes reject normal users', async () => {
  assert.equal((await adm(user).get('/orgs')).status, 403);
  assert.equal((await adm(user).post(`/orgs/${org.id}/status`, { status: 'suspended' })).status, 403);
  assert.equal((await api().get('/api/v1/admin/orgs')).status, 401);
});

test('platform admin sees every organization and usage numbers', async () => {
  const list = await adm(admin).get('/orgs');
  assert.equal(list.status, 200);
  assert.ok(list.body.data.some((o) => o.id === org.id && o.users === 1));
  const usage = await adm(admin).get('/usage');
  assert.ok(usage.body.data.orgs >= 1);
});

test('suspending an organization blocks its members immediately', async () => {
  assert.equal((await M.get('/staff')).status, 200);
  assert.equal((await adm(admin).post(`/orgs/${org.id}/status`, { status: 'suspended' })).status, 200);
  const blocked = await M.get('/staff');
  assert.equal(blocked.status, 403);
  assert.equal(blocked.body.error.code, 'ORG_SUSPENDED');
  await adm(admin).post(`/orgs/${org.id}/status`, { status: 'active' });
  assert.equal((await M.get('/staff')).status, 200);
});

test('announcements and on-demand job runs are admin only', async () => {
  assert.equal((await adm(admin).post('/announcements', { title: 'Maintenance', body: 'Tonight 11pm' })).status, 201);
  assert.equal((await adm(user).post('/announcements', { title: 'x', body: 'y' })).status, 403);
  const run = await adm(admin).post('/jobs/insights/run');
  assert.equal(run.status, 200, JSON.stringify(run.body));
  assert.equal(run.body.data.job, 'insights');
  assert.equal(run.body.data.failed, 0);
  assert.equal((await adm(admin).post('/jobs/doesNotExist/run')).status, 404);
});

test('partner invite by e-mail: token is single use and any admin org can accept', async () => {
  const other = await makeUser('pinv');
  const otherOrg = await makeOrg(other, 'Invited Buyer', ['buyer']);
  const inv = await M.post('/partners/invite-email', { email: other.email, relation: 'buyer' });
  assert.equal(inv.status, 201, JSON.stringify(inv.body));
  const token = inv.body.data.link.split('/').pop();
  assert.equal((await as(other).get(`/me/invites/partner/${token}`)).body.data.requester_name, 'Suspendable Mills');
  // an org the user does not belong to cannot be used
  assert.equal((await as(other).post(`/me/invites/partner/${token}/accept`, { org_id: org.id })).status, 403);
  const ok = await as(other).post(`/me/invites/partner/${token}/accept`, { org_id: otherOrg.id });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  assert.equal((await as(other).post(`/me/invites/partner/${token}/accept`, { org_id: otherOrg.id })).status, 404);
  const list = (await M.get('/partners')).body.data;
  assert.equal(list.find((p) => p.partner_org_id === otherOrg.id).status, 'active');
});
