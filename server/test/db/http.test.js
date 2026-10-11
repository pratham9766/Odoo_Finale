import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { bootDatabase, enabled, pastDay, seedWorld } from './harness.js';

// The real routers, validation, permission checks, controllers and error handler over HTTP. Only the Supabase JWT check is replaced
// (there is no identity provider in a disposable test): the test sends the user's id in `x-test-user`, and the REAL `staff` middleware
// loads that person's role and permissions from the database exactly as in production.

describe('HTTP contract of the reliability fixes (real PostgreSQL)', { skip: !enabled && 'set SAMETA_TEST_ADMIN_URL to a local PostgreSQL to run' }, () => {
  let db, w, request, rolled;
  const KEY = (n) => `http-key-${String(n).padStart(8, '0')}-abcdef`;
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
    app.use('/api/v1/me', fakeAuth, meRoutes);                 // as in app.js: /me has its own router, before the staff-only one
    app.use('/api/v1', fakeAuth, staff, apiModule.default);
    app.use(notFoundRoute);
    app.use(errorHandler);
    request = supertest(app);
    rolled = { wo: w.workOrder };
  });
  after(async () => { await db?.drop(); });

  test('POST /work-orders/:id/logs: 201 first, 200 + meta.replayed on a retry, 409 for the same key with other input', async () => {
    const url = `/api/v1/work-orders/${rolled.wo}/logs`;
    const first = await request.post(url).set(as('operator')).set('Idempotency-Key', KEY(1)).send({ qty: 12 });
    assert.equal(first.status, 201);
    assert.equal(first.body.meta.replayed, false);
    const retry = await request.post(url).set(as('operator')).set('Idempotency-Key', KEY(1)).send({ qty: 12 });
    assert.equal(retry.status, 200);
    assert.equal(retry.body.meta.replayed, true);
    assert.equal(retry.body.data.log.id, first.body.data.log.id);
    const conflict = await request.post(url).set(as('operator')).set('Idempotency-Key', KEY(1)).send({ qty: 13 });
    assert.equal(conflict.status, 409);
    assert.equal(conflict.body.error.code, 'IDEMPOTENCY_KEY_REUSED');
    assert.equal(Number((await db.q(`select produced_qty from work_orders where id = $1`, [rolled.wo]))[0].produced_qty), 12);
  });

  test('bad input is rejected before anything is recorded', async () => {
    const url = `/api/v1/work-orders/${rolled.wo}/logs`;
    assert.equal((await request.post(url).set(as('operator')).set('Idempotency-Key', 'short').send({ qty: 1 })).status, 400);
    assert.equal((await request.post(url).set(as('operator')).set('Idempotency-Key', KEY(2)).send({ qty: 1.2345 })).status, 422);
    assert.equal((await request.post(url).set(as('operator')).set('Idempotency-Key', KEY(2)).send({ qty: 0 })).status, 422);
    const over = await request.post(url).set(as('operator')).set('Idempotency-Key', KEY(3)).send({ qty: 500 });
    assert.equal(over.status, 422);
    assert.equal(over.body.error.code, 'VALIDATION_FAILED');
    assert.equal(over.body.error.details.over_target.limit, 125);
    assert.equal(over.body.error.details.over_target.override_allowed, false);
    assert.equal((await db.q(`select count(*)::int n from idempotency_keys where key in ($1, $2)`, [KEY(2), KEY(3)]))[0].n, 0);
  });

  test('GET /idempotency/production.log/:key tells a phone whether an uncertain entry was saved, for its own keys only', async () => {
    const mine = await request.get(`/api/v1/idempotency/production.log/${KEY(1)}`).set(as('operator'));
    assert.equal(mine.status, 200);
    assert.equal(mine.body.data.found, true);
    assert.equal(mine.body.data.response.work_order.target_qty, 100);
    assert.equal((await request.get(`/api/v1/idempotency/production.log/${KEY(77)}`).set(as('operator'))).body.data.found, false);
    assert.equal((await request.get(`/api/v1/idempotency/production.log/${KEY(1)}`).set(as('supervisor'))).body.data.found, false, "someone else's key is invisible");
  });

  test('a user without the permission cannot log, correct attendance or run payroll', async () => {
    assert.equal((await request.post(`/api/v1/work-orders/${rolled.wo}/logs`).set(as('qc')).set('Idempotency-Key', KEY(9)).send({ qty: 1 })).status, 403);
    const [a] = await db.q(`insert into attendance (worker_id, date, shift_id, check_in, status, needs_correction, source) values ($1, $2, $3, $4, 'present', true, 'hardware') returning id`,
      [w.workers.ravi, pastDay(), w.shifts.A, `${pastDay()}T00:35:00Z`]);
    const body = { check_out: `${pastDay()}T08:30:00Z`, reason: 'Confirmed by the shift lead' };
    assert.equal((await request.post(`/api/v1/attendance/${a.id}/correct`).set(as('operator')).send(body)).status, 403);
    assert.equal((await request.post(`/api/v1/wages/runs`).set(as('operator')).send({ month: pastDay().slice(0, 7) })).status, 403);
  });

  test('attendance: unresolved list, validation, correction and the payroll block over HTTP', async () => {
    const month = pastDay().slice(0, 7);
    const list = await request.get(`/api/v1/attendance/unresolved?from=${month}-01&to=${month}-28`).set(as('supervisor'));
    assert.equal(list.status, 200);
    assert.equal(list.body.data.length, 1);
    const id = list.body.data[0].id;
    const run = await request.post('/api/v1/wages/runs').set(as('owner')).send({ month });
    assert.equal(run.status, 409);
    assert.equal(run.body.error.code, 'ATTENDANCE_UNRESOLVED');
    assert.equal(run.body.error.details.count, 1);
    assert.equal((await request.post(`/api/v1/attendance/${id}/correct`).set(as('supervisor')).send({ check_out: `${pastDay()}T08:30:00Z` })).status, 422);        // reason missing
    assert.equal((await request.post(`/api/v1/attendance/${id}/correct`).set(as('supervisor')).send({ check_out: `${pastDay()}T00:00:00Z`, reason: 'before check-in' })).status, 422);
    const ok = await request.post(`/api/v1/attendance/${id}/correct`).set(as('supervisor')).send({ check_out: `${pastDay()}T08:30:00Z`, reason: 'Confirmed by the shift lead' });
    assert.equal(ok.status, 200);
    assert.equal(ok.body.data.needs_correction, false);
    assert.equal(Number(ok.body.data.worked_hours), 7.92);
    assert.equal((await request.post('/api/v1/wages/runs').set(as('owner')).send({ month })).status, 201);
  });

  test('dispatch: a repeated scan of the same roll is flagged "already scanned", not an error', async () => {
    await db.q(`update orders set status = 'ready_to_ship'`);
    const [r] = await db.q(`insert into rolls (roll_no, qr_token, order_id, order_line_id, item_id, work_order_id, length_m, status)
      values ('R-HTTP-1', 'httptoken0000000001', $1, $2, $3, $4, 50, 'passed') returning id`, [w.orders.o1.order, w.orders.o1.line, w.item, rolled.wo]);
    const created = await request.post('/api/v1/dispatches').set(as('store')).send({ order_id: w.orders.o1.order });
    assert.equal(created.status, 201);
    const url = `/api/v1/dispatches/${created.body.data.id}/scan`;
    const first = await request.post(url).set(as('store')).send({ roll_no: 'R-HTTP-1' });
    assert.equal(first.status, 201);
    const again = await request.post(url).set(as('store')).send({ qr_token: 'httptoken0000000001' });
    assert.equal(again.status, 201, 'the existing contract: scan answers 201; already_scanned says it was a repeat');
    assert.equal(again.body.data.already_scanned, true);
    assert.ok(r.id);
  });

  test('GET /rolls/:rollNo/trace accepts a scanned QR token as well as a roll number', async () => {
    const byNo = await request.get('/api/v1/rolls/R-HTTP-1/trace').set(as('qc'));
    const byToken = await request.get('/api/v1/rolls/httptoken0000000001/trace').set(as('qc'));
    assert.equal(byNo.status, 200);
    assert.equal(byToken.status, 200);
    assert.equal(byToken.body.data.roll.roll_no, 'R-HTTP-1');
    assert.equal((await request.get('/api/v1/rolls/NO-SUCH-ROLL/trace').set(as('qc'))).status, 404);
    assert.equal((await request.get('/api/v1/rolls/R-HTTP-1/trace').set(as('operator'))).status, 403, 'qc.view is required');
  });

  test('GET /me/work is filtered to the signed-in login: own record only, nothing for an unlinked account, no permission needed', async () => {
    await db.q(`update workers set user_id = $1 where id = $2`, [w.staff.operator, w.workers.ravi]);       // the operator login IS Ravi
    await db.q(`insert into attendance (worker_id, date, shift_id, check_in, check_out, worked_hours, status, source) values ($1, current_date, $2, now(), now(), 8, 'present', 'manual')`, [w.workers.priya, w.shifts.A]);
    const mine = await request.get('/api/v1/me/work').set(as('operator'));
    assert.equal(mine.status, 200);
    assert.equal(mine.body.data.linked, true);
    assert.equal(mine.body.data.worker.emp_code, 'E-001');
    assert.ok(mine.body.data.attendance.every((a) => a.shift), 'attendance rows are present');
    assert.equal(mine.body.data.attendance.filter((a) => a.date === new Date().toISOString().slice(0, 10)).length, 0, "Priya's attendance is not shown to Ravi");
    const other = await request.get('/api/v1/me/work').set(as('owner'));               // a staff login with no worker record
    assert.equal(other.status, 200);
    assert.equal(other.body.data.linked, false);
    assert.equal(other.body.data.worker, undefined);
    assert.equal((await request.get('/api/v1/me/work?month=2026-13').set(as('operator'))).status, 422, 'month must be YYYY-MM');
    const noToken = await request.get('/api/v1/me/work');                              // no x-test-user: not a staff member
    assert.ok(noToken.status >= 400);
  });
});
