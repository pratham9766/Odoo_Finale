import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync, readdirSync, statSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { bootDatabase, enabled, seedWorld } from './harness.js';

// "One shared backend": every permission name the web and the phone mention must exist in the server's catalogue, every endpoint the phone calls
// must exist, and the permissions the phone's menu and screens ask for must really let those roles through. Runs against a migrated database.

const repo = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '../../..');
const sourceFiles = (dir) => readdirSync(dir).flatMap((n) => {
  if (['node_modules', '.expo', 'dist', '.tmp'].includes(n) || n.startsWith('.tmp-')) return [];
  const full = path.join(dir, n);
  return statSync(full).isDirectory() ? sourceFiles(full) : /\.(jsx?|mjs)$/.test(n) && !/\.test\./.test(n) ? [full] : [];
});

describe('web and mobile agree with the shared backend (real PostgreSQL)', { skip: !enabled && 'set SAMETA_TEST_ADMIN_URL to a local PostgreSQL to run' }, () => {
  let db, w, request, rollNo;
  const as = (user) => ({ 'x-test-user': w.staff[user] });

  before(async () => {
    db = await bootDatabase();
    w = await seedWorld(db);
    const [{ default: express }, { default: supertest }, { staff }, apiModule, { errorHandler, notFoundRoute }, { default: meRoutes }] = await Promise.all([
      import('express'), import('supertest'), import('../../src/middleware/staff.js'),
      import('../../src/modules/index.js'), import('../../src/middleware/errorHandler.js'), import('../../src/modules/auth/me.routes.js'),
    ]);
    const app = express();
    app.use(express.json());
    const fakeAuth = (req, _res, next) => { req.user = { id: req.get('x-test-user') }; next(); };
    app.use('/api/v1/me', fakeAuth, meRoutes);
    app.use('/api/v1', fakeAuth, staff, apiModule.default);
    app.use(notFoundRoute);
    app.use(errorHandler);
    request = supertest(app);
    await db.q(`update orders set status = 'ready_to_ship'`);
    const [r] = await db.q(`insert into rolls (roll_no, qr_token, order_id, order_line_id, item_id, work_order_id, length_m, status)
      values ('R-C-1', 'contracttoken00001', $1, $2, $3, $4, 40, 'pending_qc') returning roll_no`, [w.orders.o1.order, w.orders.o1.line, w.item, w.workOrder]);
    rollNo = r.roll_no;
  });
  after(async () => { await db?.drop(); });

  test('every permission key the web and the phone mention exists in the server catalogue', async () => {
    const catalogue = new Set((await db.q('select key from permissions')).map((r) => r.key));
    const domains = new Set([...catalogue].map((k) => k.split('.')[0]));
    const unknown = [];
    for (const dir of ['mobile/app', 'mobile/src', 'client/src']) {
      for (const file of sourceFiles(path.join(repo, dir))) {
        for (const m of readFileSync(file, 'utf8').matchAll(/['"]([a-z_]+)\.([a-z_]+)['"]/g)) {
          if (domains.has(m[1]) && !catalogue.has(`${m[1]}.${m[2]}`)) unknown.push(`${path.relative(repo, file)}: ${m[1]}.${m[2]}`);
        }
      }
    }
    assert.deepEqual([...new Set(unknown)], [], 'permission names that the server does not know');
  });

  test('every screen of the phone menu is reachable by a built-in role that is meant to use it, and refused to one that is not', async () => {
    const { NAV, isAllowed, homeRoute } = await import('../../../mobile/src/navigation/menu.js');
    const can = (perms) => (p) => perms.includes(p);
    const perms = async (user) => (await db.q(`select rp.permission_key k from profiles p join role_permissions rp on rp.role_id = p.role_id where p.id = $1`, [w.staff[user]])).map((r) => r.k);
    const op = await perms('operator'); const qc = await perms('qc'); const owner = await perms('owner');
    const items = NAV.flatMap((g) => g.items);
    const visible = (ps) => items.filter((i) => isAllowed(i, can(ps))).map((i) => i.route);
    assert.equal(visible(owner).length, items.length, 'the owner sees every screen');
    assert.ok(visible(op).includes('machine-board') && visible(op).includes('work-orders'), 'an operator sees the machine board and work orders');
    assert.ok(!visible(op).includes('orders') && !visible(op).includes('qc-queue'), 'an operator does not see orders or QC');
    assert.ok(visible(qc).includes('qc-queue') && visible(qc).includes('trace'), 'a QC inspector sees QC and trace');
    assert.equal(homeRoute(can(op)), 'machine-board');
    assert.equal(homeRoute(can(qc)), 'qc-queue');
    assert.equal(homeRoute(can([])), 'my-work', 'a person with no permissions lands on My work (the Employee role)');
    // and the server agrees with what the menu promises
    assert.equal((await request.get('/api/v1/qc/queue').set(as('qc'))).status, 200);
    assert.equal((await request.get('/api/v1/qc/queue').set(as('operator'))).status, 403);
    assert.equal((await request.get('/api/v1/production/board').set(as('operator'))).status, 200);
    assert.equal((await request.get('/api/v1/orders').set(as('operator'))).status, 403);
  });

  test('every GET the phone makes is a real route that answers for a permitted user', async () => {
    const orderId = w.orders.o1.order;
    const paths = [
      '/me', '/me/access', '/me/work', '/notifications?limit=1', '/orders?limit=5', `/orders/${orderId}`, '/production/board', '/production/board?mine=true',
      '/qc/queue?status=pending_qc', '/qc/summary', '/receipts?limit=5', '/stock?limit=5', '/stock/finished', '/reports/dashboard', '/shifts', '/workers?limit=5', '/work-orders?limit=5',
      `/work-orders/${w.workOrder}`, '/dispatches?limit=5', '/defect-types?limit=5', '/attendance', '/attendance/today', '/attendance/unresolved',
      `/rolls/${rollNo}`, `/rolls/${rollNo}/trace`, '/rolls/contracttoken00001', '/rolls/contracttoken00001/trace',
    ];
    const failures = [];
    for (const p of paths) {
      const res = await request.get(`/api/v1${p}`).set(as('owner'));
      if (res.status !== 200 || !('data' in res.body)) failures.push(`${p} → ${res.status} ${res.body?.error?.message ?? ''}`);
    }
    assert.deepEqual(failures, []);
  });

  test('the fields the phone screens read are present in the real responses (units, statuses, totals)', async () => {
    await db.q(`update rolls set status = 'passed' where roll_no = 'R-C-1'`);
    const created = await request.post('/api/v1/dispatches').set(as('owner')).send({ order_id: w.orders.o1.order });
    await request.post(`/api/v1/dispatches/${created.body.data.id}/scan`).set(as('owner')).send({ roll_no: 'R-C-1' });
    await db.q(`insert into attendance (worker_id, date, shift_id, check_in, status, needs_correction, source) values ($1, current_date - 3, $2, now() - interval '3 days', 'present', true, 'hardware')`, [w.workers.ravi, w.shifts.A]);
    const get = async (p) => (await request.get(`/api/v1${p}`).set(as('owner'))).body.data;
    const has = (what, obj, keys) => { const missing = keys.filter((k) => !(k in (obj ?? {}))); assert.deepEqual(missing, [], `${what} lacks ${missing.join(', ')}`); };

    has('work order', await get(`/work-orders/${w.workOrder}`), ['wo_no', 'status', 'item', 'stage', 'order_no', 'machine_id', 'machine_code', 'target_qty', 'produced_qty', 'pct', 'uom', 'is_rework']);
    const board = await get('/production/board');
    has('board kpis', board.kpis, ['running', 'idle', 'breakdown', 'maintenance', 'utilisation_pct', 'today']);
    has('board machine', board.machines[0], ['machine_id', 'code', 'status', 'stage', 'wo_no', 'order_no', 'operator', 'work_order_id', 'produced_qty', 'target_qty', 'pct', 'uom', 'today_qty']);
    has('roll', await get('/rolls/R-C-1'), ['id', 'roll_no', 'status', 'item', 'order_no', 'wo_no', 'machine_code', 'length_m', 'created_at']);
    const trace = await get('/rolls/R-C-1/trace');
    has('trace', trace, ['roll', 'timeline', 'raw_material_lots', 'inspections', 'dispatch', 'peers']);
    assert.equal(trace.dispatch.dispatch_no.startsWith('DSP'), true);
    const d = await get(`/dispatches/${created.body.data.id}`);
    has('dispatch', d, ['dispatch_no', 'status', 'order_no', 'totals', 'rolls']);
    has('dispatch totals', d.totals, ['ordered', 'scanned', 'earlier', 'remaining']);
    has('dispatch roll', d.rolls[0], ['roll_id', 'roll_no', 'item', 'length_m']);
    assert.equal(d.totals.scanned, 40);
    const unresolved = await get('/attendance/unresolved');
    has('unresolved row', unresolved[0], ['id', 'date', 'check_in', 'worker', 'emp_code', 'shift', 'stage', 'payroll_locked']);
    has('access', await get('/me/access'), ['staff', 'status', 'mill', 'user', 'role', 'permissions', 'scope']);
    has('dashboard', await get('/reports/dashboard'), ['alerts']);
    has('qc summary', await get('/qc/summary'), ['queue', 'passed_today']);
    has('order', await get(`/orders/${w.orders.o1.order}`), ['order_no', 'status', 'deadline', 'lines', 'events', 'progress_pct']);
    const list = await get('/orders?limit=5');
    has('order list row', list[0], ['id', 'order_no', 'status', 'deadline']);
  });

  test('the web Purchase orders page (ported from the mobile branch) reads fields the list and detail really return', async () => {
    const [supplier] = await db.q(`insert into contacts (type, name) values ('supplier', 'Test Yarn Co') returning id`);
    const made = await request.post('/api/v1/purchase-orders').set(as('owner')).send({ supplier_contact_id: supplier.id, for_order_id: w.orders.o1.order, lines: [{ item_id: w.item, qty: 10, rate: 5 }] });
    assert.equal(made.status, 201, JSON.stringify(made.body));
    const list = (await request.get('/api/v1/purchase-orders?limit=5').set(as('owner'))).body.data;
    for (const k of ['id', 'po_no', 'status', 'supplier_name', 'for_order_no', 'for_order_id', 'line_count', 'total']) assert.ok(k in list[0], `list row lacks ${k}`);
    assert.equal(list[0].for_order_no, 'ORD-T-0001');
    const detail = (await request.get(`/api/v1/purchase-orders/${made.body.data.id}`).set(as('owner'))).body.data;
    for (const k of ['po_no', 'status', 'supplier_name', 'for_order_no', 'lines']) assert.ok(k in detail, `detail lacks ${k}`);
  });

  test('every write the phone makes is a real route (an empty or unknown request is refused for its content, not as "no route")', async () => {
    const id = '00000000-0000-4000-8000-000000000000';
    const writes = [
      ['post', '/qc/inspections', {}], ['post', '/rolls', {}], ['post', '/attendance/bulk', {}], [ 'post', `/attendance/${id}/correct`, {}],
      ['post', `/work-orders/${w.workOrder}/logs`, {}], ['post', `/work-orders/${w.workOrder}/pause`, {}], ['post', `/work-orders/${w.workOrder}/finish`, {}],
      ['post', `/work-orders/${id}/start`, {}], ['post', `/work-orders/${id}/resume`, {}],
      ['post', '/dispatches', {}], ['post', `/dispatches/${id}/scan`, {}], ['post', `/dispatches/${id}/confirm`, {}], ['post', `/dispatches/${id}/status`, {}], ['delete', `/dispatches/${id}/rolls/${id}`, undefined],
      ['post', `/machines/${id}/breakdown`, {}], ['post', `/orders/${id}/confirm`, {}], ['post', `/orders/${id}/cancel`, {}], ['post', `/orders/${id}/tracking-link`, {}],
      ['post', `/receipts/${id}/post`, {}], ['post', `/receipts/${id}/cancel`, {}], ['post', '/notifications/read-all', {}], ['post', `/notifications/${id}/read`, {}], ['put', '/me/profile', {}],
    ];
    const noRoute = [];
    for (const [method, p, body] of writes) {
      const res = await request[method](`/api/v1${p}`).set(as('owner')).send(body);
      if (res.status === 404 && /^No route for/.test(res.body?.error?.message ?? '')) noRoute.push(`${method.toUpperCase()} ${p}`);
    }
    assert.deepEqual(noRoute, []);
  });

  test('the phone and the web use the same endpoints for the same jobs (no second backend, no mobile-only copy of a rule)', () => {
    const read = (f) => readFileSync(path.join(repo, f), 'utf8');
    // the same server route names appear in both clients for shared jobs
    for (const [job, needle] of [['dispatch scan', '/scan'], ['dispatch confirm', '/confirm'], ['qc inspection', '/qc/inspections'], ['roll creation', "'/rolls'"], ['work-order logs', 'logs']]) {
      const web = sourceFiles(path.join(repo, 'client/src')).some((f) => read(path.relative(repo, f)).includes(needle));
      const phone = sourceFiles(path.join(repo, 'mobile')).some((f) => read(path.relative(repo, f)).includes(needle));
      assert.ok(web && phone, `${job}: web=${web} phone=${phone}`);
    }
    // the phone has no server of its own and no business rule tables of its own
    assert.equal(sourceFiles(path.join(repo, 'mobile')).filter((f) => /express|from 'pg'|require\('pg'\)/.test(readFileSync(f, 'utf8'))).length, 0);
  });
});
