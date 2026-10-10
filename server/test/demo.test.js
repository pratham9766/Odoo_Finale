// HTTP checks over the SEEDED demo (npm run seed): every persona signs in with its demo login and the API must show it exactly
// what its role and scope allow. Skipped automatically when the demo is not seeded.
import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { createClient } from '@supabase/supabase-js';
import request from 'supertest';
import { env } from '../src/config/env.js';
import { app } from '../src/app.js';
import { pool } from '../src/db/pool.js';
import { sqlAdmin } from './helpers.js';

const month = new Date().toISOString().slice(0, 7);
const sessions = new Map();
let seeded = false;

async function as(email) {
  if (!sessions.has(email)) {
    const sb = createClient(env.SUPABASE_URL, process.env.SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });
    const { data, error } = await sb.auth.signInWithPassword({ email, password: 'Demo@1234' });
    if (error) throw new Error(`${email}: ${error.message}`);
    const h = { Authorization: `Bearer ${data.session.access_token}` };
    const orgs = (await request(app).get('/api/v1/me/orgs').set(h)).body.data;
    sessions.set(email, { h, org: orgs[0]?.org_id });
  }
  const { h, org } = sessions.get(email);
  const withOrg = { ...h, 'x-org-id': org ?? '' };
  return {
    org,
    get: (p) => request(app).get(`/api/v1${p}`).set(withOrg),
    post: (p, b) => request(app).post(`/api/v1${p}`).set(withOrg).send(b ?? {}),
    admin: (p) => request(app).get(`/api/v1/admin${p}`).set(h),
  };
}

before(async () => {
  seeded = (await sqlAdmin(`select 1 from organizations where name = 'Everest Textile Mills'`)).rowCount > 0;
});
after(() => pool.end());

const demo = (name, fn) => test(name, async (t) => { if (!seeded) return t.skip('demo not seeded (npm run seed)'); await fn(t); });

demo('the owner reads every area of the plant', async () => {
  const o = await as('owner@everest.demo');
  const paths = ['/org', '/stages', '/shifts', '/staff', '/roles', '/partners', '/items', '/boms', '/stock', '/stock/lots', '/receipts', '/purchase-orders',
    '/orders', '/machines', '/work-orders', '/production/board', '/maintenance/tickets', '/qc/queue', '/qc/summary', '/gate/entries', '/dispatches', '/workers',
    '/attendance/today', `/attendance/register?month=${month}`, '/wages/runs', '/invoices', '/payments', '/expenses', '/finance/receivables',
    '/reports/dashboard', '/reports/machines', '/reports/wastage', '/reports/qc', `/reports/pnl?month=${month}`, '/reports/order-cost', '/ai/insights'];
  for (const p of paths) {
    const r = await o.get(p);
    assert.equal(r.status, 200, `${p}: ${r.status} ${JSON.stringify(r.body.error)}`);
  }
});

demo('the demo world has the planted "now" state', async () => {
  const o = await as('owner@everest.demo');
  const board = (await o.get('/production/board')).body.data;
  const rows = board.machines ?? board;
  assert.ok(rows.length >= 20, 'machine board lists the 20 machines');
  assert.ok(rows.some((m) => m.status === 'breakdown'), 'one machine is broken down');
  assert.ok((await o.get('/qc/queue?status=pending_qc')).body.data.length > 0, 'rolls are waiting for QC');
  const orders = (await o.get('/orders?limit=200')).body.data;
  assert.ok(orders.some((x) => x.risk === 'red'), 'some orders will miss their deadline');
  assert.ok(orders.some((x) => x.status === 'delivered' || x.status === 'dispatched'), 'earlier orders went out');
  const today = (await o.get('/attendance/today')).body.data;
  assert.ok(JSON.stringify(today).includes('absent'), 'today board shows absentees');
  assert.ok((await o.get('/ai/insights')).body.data.length > 0, 'insight cards exist');
  assert.ok((await o.get('/finance/receivables')).body.data, 'receivables report works');
});

demo('a scoped supervisor only sees their stage, and none of the money', async () => {
  const s = await as('sup.weaving@everest.demo');
  const board = (await s.get('/production/board')).body.data;
  const machines = board.machines ?? board;
  assert.ok(machines.length > 0 && machines.every((m) => /^W-/.test(m.code)), `only weaving looms: ${machines.map((m) => m.code).join(',')}`);
  for (const p of [`/reports/pnl?month=${month}`, '/wages/runs', '/invoices', '/finance/receivables', '/staff']) {
    assert.equal((await s.get(p)).status, 403, p);
  }
  assert.equal((await s.get('/attendance/today')).status, 200);
});

demo('the W-3 operator is limited to their loom', async () => {
  const op = await as('op.w3@everest.demo');
  const rows = (await op.get('/production/board')).body.data;
  const machines = rows.machines ?? rows;
  assert.deepEqual(machines.map((m) => m.code), ['W-3']);
  assert.equal((await op.get('/orders')).status, 403);
  assert.equal((await op.get('/wages/runs')).status, 403);
});

demo('each back-office role gets its own slice', async () => {
  const check = async (email, ok, denied) => {
    const u = await as(email);
    for (const p of ok) assert.equal((await u.get(p)).status, 200, `${email} ${p}`);
    for (const p of denied) assert.equal((await u.get(p)).status, 403, `${email} ${p}`);
  };
  await check('store@everest.demo', ['/stock', '/receipts'], ['/invoices', '/wages/runs', `/reports/pnl?month=${month}`]);
  await check('accounts@everest.demo', ['/invoices', '/payments', '/expenses', `/reports/pnl?month=${month}`, '/reports/order-cost'], ['/production/board', '/staff']);
  await check('hr@everest.demo', ['/workers', '/attendance/today', '/wages/runs', '/leave'], ['/invoices', '/stock']);
  await check('qchead@everest.demo', ['/qc/queue', '/qc/summary'], ['/invoices', '/wages/runs']);
  await check('gate@everest.demo', ['/gate/entries', '/gate/expected'], ['/stock', '/orders']);
  await check('maint@everest.demo', ['/maintenance/tickets'], ['/invoices', '/orders']);
  await check('dispatch@everest.demo', ['/dispatches', '/stock/finished'], ['/wages/runs', '/staff']);
});

demo('prices are hidden from roles without price access', async () => {
  const s = await as('store@everest.demo');
  const items = (await s.get('/items?limit=5')).body.data;
  assert.ok(items.every((i) => !('std_rate' in i)));
  const o = await as('owner@everest.demo');
  assert.ok((await o.get('/items?limit=5')).body.data.every((i) => 'std_rate' in i));
});

demo('Shakti Spinners sees none of Everest', async () => {
  const sh = await as('owner@shakti.demo');
  const ev = await as('owner@everest.demo');
  assert.notEqual(sh.org, ev.org);
  const everestOrders = (await ev.get('/orders?limit=200')).body.meta.total;
  assert.ok(everestOrders > 0);
  assert.equal((await sh.get('/orders?limit=200')).body.meta.total, 0);
  const shMachines = (await sh.get('/machines?limit=100')).body;
  const rows = shMachines.data;
  assert.equal(rows.length, 5);
  assert.ok(rows.every((m) => /^S-/.test(m.code)));
  // same SKUs exist in both orgs and never mix
  const a = (await sh.get('/items?limit=100')).body.data;
  assert.ok(a.length < 10 && a.every((i) => i.org_id === sh.org || i.org_id === undefined));
  const stock = (await sh.get('/stock')).body.data;
  assert.ok(stock.every((r) => r.org_id === sh.org || r.org_id === undefined));
  assert.equal((await sh.get(`/orders/${(await ev.get('/orders?limit=1')).body.data[0].id}`)).status, 404);
});

demo('the connected portals see their own side only', async () => {
  const buyer = await as('buyer@metrofashion.demo');
  const orders = (await buyer.get('/orders?side=purchase')).body.data;
  assert.equal(orders.length, 1);
  assert.match(orders[0].order_no, /^ORD-/); // the mill confirmed it, so the temporary REQ- number was replaced
  const detail = (await buyer.get(`/orders/${orders[0].id}`)).body.data;
  assert.equal(detail.tracking_token, undefined);
  assert.equal(detail.rolls, undefined);
  assert.equal((await buyer.get('/machines')).status, 403);
  assert.equal((await buyer.get('/items')).status, 403);

  const supplier = await as('sales@coimbatoreyarns.demo');
  assert.equal((await supplier.get('/purchase-orders?side=incoming')).body.data.length, 2);
  assert.equal((await supplier.get('/orders')).status, 403); // a yarn supplier has no sales orders

  const tr = await as('fleet@speedfreight.demo');
  const trips = (await tr.get('/transport/trips')).body.data;
  assert.equal(trips.length, 2);
  assert.ok(trips.every((t) => t.status === 'in_transit' && t.vehicle_no && t.driver_name));

  const driver = await as('driver@speedfreight.demo');
  const mine = (await driver.get('/driver/trips')).body.data;
  assert.equal(mine.length, 1);
  assert.equal((await driver.get('/transport/trips')).status, 403);
});

demo('the pending partner request waits for Everest', async () => {
  const o = await as('owner@everest.demo');
  const partners = (await o.get('/partners')).body.data;
  assert.ok(partners.some((p) => p.status === 'pending' && /Delhi Denim/.test(p.partner_name)));
  assert.ok(partners.filter((p) => p.status === 'active').length >= 3);
});

demo('the platform admin sees every organization; normal users do not', async () => {
  const admin = await as('admin@texlink.demo');
  const orgs = (await admin.admin('/orgs')).body.data;
  assert.ok(orgs.length >= 6, `${orgs.length} orgs`);
  assert.equal((await (await as('owner@everest.demo')).admin('/orgs')).status, 403);
});

demo('a kiosk punch is accepted for a seeded worker and duplicates are ignored', async () => {
  const [{ token_hash: _h }] = (await sqlAdmin(`select token_hash from kiosk_devices limit 1`)).rows;
  assert.ok(_h);
  const bad = await request(app).post('/api/v1/kiosk/punch').set('x-device-token', 'not-a-real-device-token').send({ qr_token: 'x'.repeat(12) });
  assert.ok([401, 403, 404].includes(bad.status), `unknown device rejected (${bad.status})`);
  const noToken = await request(app).post('/api/v1/kiosk/punch').send({ qr_token: 'x'.repeat(12) });
  assert.equal(noToken.status, 401);
});
