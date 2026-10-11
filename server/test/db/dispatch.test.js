import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { randomUUID } from 'node:crypto';
import { bootDatabase, ctxFor, enabled, seedWorld } from './harness.js';

describe('dispatch and QC integrity (real PostgreSQL)', { skip: !enabled && 'set SAMETA_TEST_ADMIN_URL to a local PostgreSQL to run' }, () => {
  let db, w, d, confirm, qc, owner, store, serial = 0;

  before(async () => {
    db = await bootDatabase();
    w = await seedWorld(db);
    d = await import('../../src/modules/dispatch/dispatches.service.js');
    ({ confirmDispatch: confirm } = await import('../../src/modules/dispatch/confirm.service.js'));
    qc = await import('../../src/modules/quality/inspections.service.js');
    owner = await ctxFor(w.staff.owner);
    store = await ctxFor(w.staff.store);
    await db.q(`update orders set status = 'ready_to_ship'`);
  });
  after(async () => { await db?.drop(); });

  /** A roll straight in the table, in the given QC status (the QC and dispatch rules are what is under test, not roll creation). */
  async function roll(order, { status = 'passed', length = 100 } = {}) {
    serial += 1;
    const o = order === 'o2' ? w.orders.o2 : w.orders.o1;
    const [r] = await db.q(
      `insert into rolls (roll_no, qr_token, order_id, order_line_id, item_id, work_order_id, length_m, status)
       values ($1, $2, $3, $4, $5, $6, $7, $8) returning id, roll_no, qr_token`,
      [`R-T-${serial}`, `qrtoken${String(serial).padStart(10, '0')}`, o.order, o.line, w.item, w.workOrder, length, status]);
    return r;
  }
  const dispatchFor = async (order = 'o1') => d.createDispatch(store, { order_id: (order === 'o2' ? w.orders.o2 : w.orders.o1).order });
  const rollStatus = async (id) => (await db.q(`select status from rolls where id = $1`, [id]))[0].status;

  test('a passed roll of the right order can be scanned; scanning it again is a harmless repeat, not a second allocation', async () => {
    const r = await roll('o1');
    const disp = await dispatchFor();
    const first = await d.scanRoll(store, disp.id, { code: r.roll_no });
    assert.equal(first.roll_no, r.roll_no);
    assert.equal(first.already_scanned, undefined);
    assert.equal(await rollStatus(r.id), 'packed');
    const again = await d.scanRoll(store, disp.id, { code: r.qr_token });          // the QR token works too
    assert.equal(again.already_scanned, true);
    assert.equal((await db.q(`select count(*)::int n from dispatch_rolls where roll_id = $1`, [r.id]))[0].n, 1);
  });

  test('two dispatches racing for the same roll: exactly one gets it', async () => {
    const r = await roll('o1');
    const [a, b] = [await dispatchFor(), await dispatchFor()];
    const results = await Promise.allSettled([d.scanRoll(store, a.id, { code: r.roll_no }), d.scanRoll(store, b.id, { code: r.roll_no })]);
    assert.equal(results.filter((x) => x.status === 'fulfilled').length, 1);
    const lost = results.find((x) => x.status === 'rejected');
    assert.equal(lost.reason.code, 'ROLL_ALREADY_DISPATCHED');
    assert.equal((await db.q(`select count(*)::int n from dispatch_rolls where roll_id = $1`, [r.id]))[0].n, 1);
  });

  test('a roll of another order, a roll that has not passed QC and a roll over the ordered quantity are all refused', async () => {
    const disp = await dispatchFor('o1');
    const wrong = await roll('o2');
    await assert.rejects(d.scanRoll(store, disp.id, { code: wrong.roll_no }), (e) => e.code === 'ROLL_WRONG_ORDER');
    const pending = await roll('o1', { status: 'pending_qc' });
    await assert.rejects(d.scanRoll(store, disp.id, { code: pending.roll_no }), (e) => e.code === 'ROLL_NOT_PASSED');
    const rejected = await roll('o1', { status: 'rejected' });
    await assert.rejects(d.scanRoll(store, disp.id, { code: rejected.roll_no }), (e) => e.code === 'ROLL_NOT_PASSED');
    // order quantity is 1000 m with 5 % tolerance: earlier scans already hold some metres; a 2000 m roll cannot fit
    const huge = await roll('o1', { length: 2000 });
    await assert.rejects(d.scanRoll(store, disp.id, { code: huge.roll_no }), (e) => e.code === 'QTY_EXCEEDS_ORDER');
    for (const x of [wrong, pending, rejected, huge]) assert.notEqual(await rollStatus(x.id), 'packed');
  });

  test('QC cannot change a roll that is already packed or dispatched (no override or inspection behind the warehouse’s back)', async () => {
    const r = await roll('o1', { status: 'passed' });
    const [insp] = await db.q(`insert into qc_inspections (roll_id, inspector_id, result) values ($1, $2, 'pass') returning id`, [r.id, w.staff.qc]);
    const disp = await dispatchFor();
    await d.scanRoll(store, disp.id, { code: r.roll_no });                       // now packed
    await assert.rejects(qc.overrideResult(owner, insp.id, { result: 'reject', reason: 'late defect found', defects: [] }), (e) => e.status === 409 && e.code === 'INVALID_STATE_TRANSITION');
    await assert.rejects(qc.inspectRoll(owner, { roll_id: r.id, result: 'pass', defects: [] }), (e) => e.status === 409);
    assert.equal(await rollStatus(r.id), 'packed');
    await confirm(owner, disp.id);
    await assert.rejects(qc.overrideResult(owner, insp.id, { result: 'reject', reason: 'too late now', defects: [] }), (e) => e.status === 409);
    assert.equal(await rollStatus(r.id), 'dispatched');
    await assert.rejects(d.scanRoll(store, (await dispatchFor()).id, { code: r.roll_no }), (e) => e.code === 'ROLL_ALREADY_DISPATCHED');
  });

  test('two simultaneous confirmations produce one confirmed dispatch and one invoice', async () => {
    const rolls = [await roll('o1'), await roll('o1')];
    const disp = await dispatchFor();
    for (const r of rolls) await d.scanRoll(store, disp.id, { code: r.roll_no });
    const results = await Promise.allSettled([confirm(owner, disp.id), confirm(owner, disp.id), confirm(owner, disp.id)]);
    assert.equal(results.filter((x) => x.status === 'fulfilled').length, 1);
    for (const x of results.filter((x) => x.status === 'rejected')) assert.equal(x.reason.code, 'INVALID_STATE_TRANSITION');
    assert.equal((await db.q(`select count(*)::int n from invoices where dispatch_id = $1`, [disp.id]))[0].n, 1);
    for (const r of rolls) assert.equal(await rollStatus(r.id), 'dispatched');
    assert.equal((await db.q(`select count(*)::int n from roll_history where event = 'dispatched' and roll_id = any($1::uuid[])`, [rolls.map((r) => r.id)]))[0].n, 2);
  });

  test('if invoice creation fails the whole confirmation rolls back: dispatch still packing, rolls still packed, no history', async () => {
    const r = await roll('o1');
    const disp = await dispatchFor();
    await d.scanRoll(store, disp.id, { code: r.roll_no });
    await db.q(`alter table invoices add constraint test_invoice_blocked check (false) not valid`);
    try {
      await assert.rejects(confirm(owner, disp.id));
    } finally {
      await db.q(`alter table invoices drop constraint test_invoice_blocked`);
    }
    assert.equal((await db.q(`select status from dispatches where id = $1`, [disp.id]))[0].status, 'packing');
    assert.equal(await rollStatus(r.id), 'packed');
    assert.equal((await db.q(`select count(*)::int n from roll_history where event = 'dispatched' and roll_id = $1`, [r.id]))[0].n, 0);
    assert.equal((await db.q(`select count(*)::int n from invoices where dispatch_id = $1`, [disp.id]))[0].n, 0);
    await confirm(owner, disp.id);                                              // and it works once the cause is gone
    assert.equal(await rollStatus(r.id), 'dispatched');
  });

  test('eligibility is checked again at confirmation: a roll that is no longer valid blocks it and nothing changes', async () => {
    const [good, bad] = [await roll('o1'), await roll('o1')];
    const disp = await dispatchFor();
    for (const r of [good, bad]) await d.scanRoll(store, disp.id, { code: r.roll_no });
    await db.q(`update rolls set status = 'rejected' where id = $1`, [bad.id]);   // something changed the roll after it was scanned
    await assert.rejects(confirm(owner, disp.id), (e) => e.status === 409);
    assert.equal((await db.q(`select status from dispatches where id = $1`, [disp.id]))[0].status, 'packing');
    assert.equal(await rollStatus(good.id), 'packed');
    assert.equal((await db.q(`select count(*)::int n from invoices where dispatch_id = $1`, [disp.id]))[0].n, 0);
  });

  test('confirming a dispatch with no rolls is refused', async () => {
    const empty = await dispatchFor();
    await assert.rejects(confirm(owner, empty.id), (e) => e.status === 422);
    assert.ok(randomUUID());
  });
});
