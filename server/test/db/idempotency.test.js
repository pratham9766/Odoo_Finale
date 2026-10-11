import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { bootDatabase, ctxFor, enabled, seedWorld } from './harness.js';

const KEY = (n) => `test-key-${String(n).padStart(8, '0')}-abcdef`;

describe('idempotent production log and roll creation (real PostgreSQL)', { skip: !enabled && 'set SAMETA_TEST_ADMIN_URL to a local PostgreSQL to run' }, () => {
  let db, w, svc, rolls, logSchema, operator, supervisor, another;

  before(async () => {
    db = await bootDatabase();
    w = await seedWorld(db);
    svc = await import('../../src/modules/production/productionLogs.service.js');
    rolls = await import('../../src/modules/quality/rolls.service.js');
    ({ logSchema } = await import('../../src/modules/production/workOrderActions.schema.js'));
    operator = await ctxFor(w.staff.operator);
    supervisor = await ctxFor(w.staff.supervisor);
    another = await ctxFor(w.staff.office);
  });
  after(async () => { await db?.drop(); });

  const produced = async () => Number((await db.q(`select produced_qty from work_orders where id = $1`, [w.workOrder]))[0].produced_qty);
  const logCount = async () => Number((await db.q(`select count(*) n from production_logs where work_order_id = $1`, [w.workOrder]))[0].n);

  test('first request records output once; a retry after a lost response returns the original result and records nothing', async () => {
    const first = await svc.logProduction(operator, w.workOrder, { qty: 10 }, { idempotencyKey: KEY(1) });
    assert.equal(first.replayed, false);
    const retry = await svc.logProduction(operator, w.workOrder, { qty: 10 }, { idempotencyKey: KEY(1) });   // the first response never arrived
    assert.equal(retry.replayed, true);
    assert.equal(retry.log.id, first.log.id, 'the original log row is returned');
    assert.equal(await produced(), 10);
    assert.equal(await logCount(), 1);
  });

  test('the same key with different input is a conflict and changes nothing', async () => {
    await assert.rejects(svc.logProduction(operator, w.workOrder, { qty: 11 }, { idempotencyKey: KEY(1) }),
      (e) => e.status === 409 && e.code === 'IDEMPOTENCY_KEY_REUSED');
    await assert.rejects(svc.logProduction(operator, w.workOrder, { qty: 10, worker_id: w.workers.priya }, { idempotencyKey: KEY(1) }),
      (e) => e.code === 'IDEMPOTENCY_KEY_REUSED');
    assert.equal(await produced(), 10);
  });

  test('a genuinely new entry uses a new key and is recorded', async () => {
    const out = await svc.logProduction(operator, w.workOrder, { qty: 5 }, { idempotencyKey: KEY(2) });
    assert.equal(out.replayed, false);
    assert.equal(await produced(), 15);
  });

  test('forty simultaneous requests over five keys record each entry exactly once', async () => {
    const before = await produced();
    const keys = [31, 32, 33, 34, 35].map(KEY);
    const results = await Promise.all(keys.flatMap((k) => Array.from({ length: 8 }, () => svc.logProduction(operator, w.workOrder, { qty: 1 }, { idempotencyKey: k }))));
    assert.equal(results.filter((r) => !r.replayed).length, 5, 'exactly one request per key did the work');
    assert.equal(new Set(results.map((r) => r.log.id)).size, 5, 'each key maps to one log row');
    assert.equal(await produced(), before + 5);
    const stored = await db.q(`select count(*)::int n from idempotency_keys where key = any($1)`, [keys]);
    assert.equal(stored[0].n, 5);
  });

  test('a key belongs to the user who made it: another user with the same key is independent', async () => {
    const before = await produced();
    const out = await svc.logProduction(supervisor, w.workOrder, { qty: 1 }, { idempotencyKey: KEY(2) });   // KEY(2) was the operator's
    assert.equal(out.replayed, false);
    assert.equal(await produced(), before + 1);
  });

  test('a failed request stores nothing, so the same key can be retried once the cause is fixed', async () => {
    await db.q(`update work_orders set status = 'paused' where id = $1`, [w.workOrder]);
    await assert.rejects(svc.logProduction(operator, w.workOrder, { qty: 2 }, { idempotencyKey: KEY(4) }), (e) => e.status === 409);
    assert.equal((await db.q(`select count(*)::int n from idempotency_keys where key = $1`, [KEY(4)]))[0].n, 0);
    await db.q(`update work_orders set status = 'running' where id = $1`, [w.workOrder]);
    const before = await produced();
    const out = await svc.logProduction(operator, w.workOrder, { qty: 2 }, { idempotencyKey: KEY(4) });
    assert.equal(out.replayed, false);
    assert.equal(await produced(), before + 2);
  });

  test('without a key the endpoint still works (older clients), but is not retry-safe', async () => {
    const out = await svc.logProduction(operator, w.workOrder, { qty: 1 });
    assert.equal(out.replayed, false);
  });

  test('over the limit is REFUSED for everyone by default (the behaviour that existed before), with the same 422 answer', async () => {
    const wo2 = await w.wo('WO-T-2', w.orders.o2, 100);           // target 100, default limit +25 %
    await assert.rejects(svc.logProduction(operator, wo2, { qty: 126 }, { idempotencyKey: KEY(5) }),
      (e) => e.status === 422 && e.code === 'VALIDATION_FAILED' && e.details.fieldErrors.qty && e.details.over_target.limit === 125 && e.details.over_target.override_allowed === false);
    await assert.rejects(svc.logProduction(supervisor, wo2, { qty: 126 }, { idempotencyKey: KEY(6) }), (e) => e.status === 422, 'a supervisor is refused too');
    await assert.rejects(svc.logProduction(supervisor, wo2, { qty: 126, confirm_over_target: true, reason: 'extra yarn' }, { idempotencyKey: KEY(7) }),
      (e) => e.status === 403, 'asking to confirm is refused: no approval workflow is switched on');
    assert.equal(Number((await db.q(`select produced_qty from work_orders where id = $1`, [wo2]))[0].produced_qty), 0, 'nothing was recorded');
    assert.equal((await db.q(`select count(*)::int n from audit_logs where action = 'production_over_target'`))[0].n, 0);
    assert.equal((await db.q(`select count(*)::int n from idempotency_keys where key = any($1)`, [[KEY(5), KEY(6), KEY(7)]]))[0].n, 0);
  });

  test('only if the mill switches the exception on can someone who plans production confirm it, with a reason, and it is audited', async () => {
    await db.q(`update mill set settings = settings || '{"production": {"allow_over_target_override": true}}'::jsonb`);
    try {
      const op = await ctxFor(w.staff.operator); const sup = await ctxFor(w.staff.supervisor);
      const wo2b = await w.wo('WO-T-2B', w.orders.o2, 100);
      await assert.rejects(svc.logProduction(op, wo2b, { qty: 126 }, { idempotencyKey: KEY(11) }), (e) => e.status === 422 && e.details.over_target.override_allowed === true && /supervisor can confirm/.test(e.message));
      await assert.rejects(svc.logProduction(op, wo2b, { qty: 126, confirm_over_target: true, reason: 'extra yarn' }, { idempotencyKey: KEY(12) }), (e) => e.status === 403, 'an operator cannot confirm');
      await assert.rejects(svc.logProduction(sup, wo2b, { qty: 126, confirm_over_target: true }, { idempotencyKey: KEY(13) }), (e) => e.status === 422, 'a reason is required');
      const ok = await svc.logProduction(sup, wo2b, { qty: 126, confirm_over_target: true, reason: 'Customer asked for extra length' }, { idempotencyKey: KEY(14) });
      assert.equal(Number(ok.work_order.produced_qty), 126);
      const audit = await db.q(`select after from audit_logs where action = 'production_over_target' and record_id = $1`, [wo2b]);
      assert.equal(audit.length, 1);
      assert.equal(audit[0].after.reason, 'Customer asked for extra length');
    } finally { await db.q(`update mill set settings = settings - 'production'`); }
  });

  test('the mill can change the allowed overrun through its settings', async () => {
    const wo3 = await w.wo('WO-T-3', w.orders.o2, 100);
    await db.q(`update mill set settings = settings || '{"production": {"over_target_pct": 5}}'::jsonb`);
    const strict = await ctxFor(w.staff.operator);
    await assert.rejects(svc.logProduction(strict, wo3, { qty: 106 }, { idempotencyKey: KEY(9) }), (e) => e.status === 422 && e.details.over_target.limit === 105);
    const within = await svc.logProduction(strict, wo3, { qty: 105 }, { idempotencyKey: KEY(10) });
    assert.equal(Number(within.work_order.produced_qty), 105);
    await db.q(`update mill set settings = settings - 'production'`);
  });

  test('quantities with more than three decimals are refused instead of being rounded silently', () => {
    assert.equal(logSchema.safeParse({ qty: 1.2345 }).success, false);
    assert.equal(logSchema.safeParse({ qty: 1.234 }).success, true);
    assert.equal(logSchema.safeParse({ qty: 0 }).success, false);
    assert.equal(logSchema.safeParse({ qty: -3 }).success, false);
  });

  test('roll creation is idempotent too: one roll for many retries, a conflict for changed input', async () => {
    const input = { work_order_id: w.workOrder, length_m: 100, weight_kg: 20 };
    const results = await Promise.all(Array.from({ length: 5 }, () => rolls.createRoll(operator, input, { idempotencyKey: KEY(20) })));
    assert.equal(new Set(results.map((r) => r.id)).size, 1);
    assert.equal(results.filter((r) => !r.replayed).length, 1);
    assert.equal((await db.q(`select count(*)::int n from rolls where work_order_id = $1`, [w.workOrder]))[0].n, 1);
    await assert.rejects(rolls.createRoll(operator, { ...input, length_m: 101 }, { idempotencyKey: KEY(20) }), (e) => e.code === 'IDEMPOTENCY_KEY_REUSED');
    const second = await rolls.createRoll(operator, input, { idempotencyKey: KEY(21) });
    assert.notEqual(second.id, results[0].id);
    assert.notEqual(second.roll_no, results[0].roll_no);
  });

  test('the key is validated: malformed keys are rejected', async () => {
    const { readIdempotencyKey } = await import('../../src/utils/idempotency.js');
    assert.equal(readIdempotencyKey({ get: () => undefined }), undefined);
    assert.equal(readIdempotencyKey({ get: () => KEY(1) }), KEY(1));
    assert.throws(() => readIdempotencyKey({ get: () => 'short' }), (e) => e.status === 400);
    assert.throws(() => readIdempotencyKey({ get: () => 'has spaces in it, definitely too' }), (e) => e.status === 400);
    assert.ok(another);
  });
});
