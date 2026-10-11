import { after, before, describe, test } from 'node:test';
import assert from 'node:assert/strict';
import { bootDatabase, ctxFor, enabled, pastDay, seedDevice, seedWorld } from './harness.js';

describe('RFID attendance, corrections and payroll (real PostgreSQL)', { skip: !enabled && 'set SAMETA_TEST_ADMIN_URL to a local PostgreSQL to run' }, () => {
  let db, w, owner, supervisor, att, wages, rfid, scan, withTx, atIST, device, virtual, correctSchema;
  const day = pastDay();
  const month = day.slice(0, 7);

  before(async () => {
    process.env.RFID_SIMULATOR_ENABLED = 'true';                       // the simulator is opt-in; these tests exercise it
    db = await bootDatabase();
    w = await seedWorld(db);
    att = await import('../../src/modules/workforce/attendance.service.js');
    ({ correctSchema } = await import('../../src/modules/workforce/attendance.schema.js'));
    wages = await import('../../src/modules/workforce/wages.service.js');
    rfid = await import('../../src/modules/rfid/rfid.service.js');
    ({ processScan: scan } = await import('../../src/modules/rfid/rfid.scan.js'));
    ({ withTx } = await import('../../src/db/tx.js'));
    ({ atIST } = await import('../../src/utils/time.js'));
    owner = await ctxFor(w.staff.owner);
    supervisor = await ctxFor(w.staff.supervisor);
    device = await seedDevice(db);
    virtual = (await db.q(`select id, code from rfid_devices where kind = 'virtual'`))[0];
    await db.q(`insert into rfid_credentials (worker_id, card_uid) values ($1, 'AABBCCDD'), ($2, '11223344'), ($3, '55667788')`, [w.workers.ravi, w.workers.priya, w.workers.inactive]);
  });
  after(async () => { await db?.drop(); });

  const at = (hhmm, date = day) => { const [h, m] = hhmm.split(':').map(Number); return atIST(date, h * 60 + m); };
  const hardware = (cardUid, hhmm, extra = {}, date = day) => withTx((tx) => scan(tx, { device, cardUid, source: 'hardware', ...extra }, { now: at(hhmm, date) }));
  const row = async (workerId, date = day) => (await db.q(`select * from attendance where worker_id = $1 and date = $2`, [workerId, date]))[0];

  test('a card scan checks the worker in but leaves the day UNRESOLVED: no hours, flagged for correction', async () => {
    const out = await hardware('AABBCCDD', '06:05');
    assert.equal(out.status, 'accepted');
    assert.equal(out.attendance_action, 'checked_in');
    const a = await row(w.workers.ravi);
    assert.equal(a.needs_correction, true);
    assert.equal(a.source, 'hardware');
    assert.equal(Number(a.worked_hours), 0);
    assert.equal(a.check_out, null);
  });

  test('scans never duplicate attendance: a later scan and a replayed request both leave one row and one check-in', async () => {
    const later = await hardware('AABBCCDD', '09:00');
    assert.equal(later.attendance_action, 'already_checked_in');
    const first = await hardware('11223344', '06:00', { requestEventId: 'evt-priya-0001' });
    const replay = await hardware('11223344', '06:00', { requestEventId: 'evt-priya-0001' });
    assert.equal(replay.replayed, true);
    assert.equal(replay.event_id, first.event_id);
    assert.equal((await db.q(`select count(*)::int n from attendance where date = $1`, [day]))[0].n, 2);
    assert.equal((await db.q(`select count(*)::int n from rfid_scan_events where request_event_id = 'evt-priya-0001'`))[0].n, 1);
  });

  test('unknown, deactivated and inactive-worker cards are recorded and rejected without touching attendance', async () => {
    const before = (await db.q(`select count(*)::int n from attendance`))[0].n;
    assert.equal((await hardware('DEADBEEF', '07:00')).status, 'unknown_card');
    assert.equal((await hardware('55667788', '07:00')).status, 'invalid_employee');
    await db.q(`update rfid_credentials set active = false where card_uid = '11223344'`);
    assert.equal((await hardware('11223344', '07:30')).status, 'rejected');
    await db.q(`update rfid_credentials set active = true where card_uid = '11223344'`);
    assert.equal((await db.q(`select count(*)::int n from attendance`))[0].n, before);
  });

  test('unresolved rows are listed, with the payroll status of their month', async () => {
    const list = await att.listUnresolved(supervisor, { from: `${month}-01`, to: `${month}-28` });
    assert.equal(list.length, 2);
    assert.ok(list.every((r) => r.payroll_locked === false && r.check_out === null));
    assert.deepEqual(list.map((r) => r.emp_code).sort(), ['E-001', 'E-002']);
  });

  test('payroll cannot be prepared while unresolved attendance exists', async () => {
    await assert.rejects(wages.prepareRun(owner, { month }), (e) => e.status === 409 && e.code === 'ATTENDANCE_UNRESOLVED' && e.details.count === 2);
    assert.equal((await db.q(`select count(*)::int n from wage_runs`))[0].n, 0, 'no half-built run is left behind');
  });

  test('a correction needs explicit, sensible times and a reason', async () => {
    const a = await row(w.workers.ravi);
    const ok = { check_out: at('14:00'), reason: 'Left at shift end, confirmed with the shift lead' };
    assert.equal(correctSchema.safeParse({ check_out: at('14:00') }).success, false, 'reason is required');
    assert.equal(correctSchema.safeParse({ ...ok, reason: 'ok' }).success, false, 'a one-word reason is not a reason');
    await assert.rejects(att.correctAttendance(supervisor, a.id, { ...ok, check_out: at('06:00') }), (e) => e.status === 422, 'check-out before check-in');
    await assert.rejects(att.correctAttendance(supervisor, a.id, { ...ok, check_out: new Date(Date.now() + 3 * 3600_000) }), (e) => e.status === 422, 'in the future');
    await assert.rejects(att.correctAttendance(supervisor, a.id, { ...ok, check_out: at('06:10', new Date(Date.parse(day) + 2 * 86400_000).toISOString().slice(0, 10)) }), (e) => e.status === 422, 'more than a day later');
    const outside = { ...supervisor, scope: { stage_ids: [w.stageWeave] } };   // Ravi works in the other stage
    await assert.rejects(att.correctAttendance(outside, a.id, ok), (e) => e.status === 403);
    assert.equal((await row(w.workers.ravi)).needs_correction, true, 'nothing changed');
  });

  test('a valid correction recalculates hours with the shift rules and records who, when and why', async () => {
    const a = await row(w.workers.ravi);
    const out = await att.correctAttendance(supervisor, a.id, { check_out: at('14:00'), reason: 'Left at shift end, confirmed with the shift lead' });
    assert.equal(out.needs_correction, false);
    assert.equal(Number(out.worked_hours), 7.92);                          // 06:05 → 14:00
    assert.equal(out.status, 'present');
    assert.equal(out.corrected_by, w.staff.supervisor);
    assert.equal(out.correction_reason, 'Left at shift end, confirmed with the shift lead');
    const audit = await db.q(`select before, after from audit_logs where action = 'attendance_correct' and record_id = $1`, [a.id]);
    assert.equal(audit.length, 1);
    assert.equal(audit[0].before.check_out, null);
    await assert.rejects(att.correctAttendance(supervisor, a.id, { check_out: at('15:00'), reason: 'trying to change it again' }), (e) => e.status === 409, 'a resolved row is not corrected twice');
  });

  test('payroll stays blocked until every row is resolved, then uses the corrected hours', async () => {
    await assert.rejects(wages.prepareRun(owner, { month }), (e) => e.code === 'ATTENDANCE_UNRESOLVED' && e.details.count === 1);
    const priya = await row(w.workers.priya);
    await att.correctAttendance(supervisor, priya.id, { check_out: at('14:00'), reason: 'Confirmed by supervisor in the register' });
    const run = await wages.prepareRun(owner, { month });
    const ravi = run.lines.find((l) => l.emp_code === 'E-001');
    assert.equal(Number(ravi.hours), 7.92);
    assert.equal(Number(ravi.gross), 792);                                  // hourly 100 × 7.92
    assert.equal(Number(run.lines.find((l) => l.emp_code === 'E-002').gross), 800);   // daily rate, one day
  });

  test('a new unresolved row after the draft blocks approval; payment follows approval', async () => {
    const run = (await db.q(`select id from wage_runs`))[0];
    const late = new Date(Date.parse(day) - 86400_000).toISOString().slice(0, 10);
    await db.q(`delete from rfid_scan_events`);                              // the test moves back in time; the 3 s duplicate window must not see later scans
    await hardware('AABBCCDD', '06:00', {}, late);                          // a card scan arrives for an earlier day of that month
    await assert.rejects(wages.approveRun(owner, run.id), (e) => e.code === 'ATTENDANCE_UNRESOLVED');
    const a = await row(w.workers.ravi, late);
    await att.correctAttendance(supervisor, a.id, { check_out: at('14:00', late), reason: 'Verified against the gate register' });
    await wages.prepareRun(owner, { month });                               // the draft is rebuilt with the new hours
    const approved = await wages.approveRun(owner, run.id);
    assert.equal(approved.status, 'approved');
    const paid = await wages.payRun(owner, run.id);
    assert.equal(paid.status, 'paid');
  });

  test('an hourly-paid worker marked present with no times blocks payroll too: zero hours must not look like a normal day', async () => {
    const run = await db.q(`select id, status from wage_runs`);
    await db.q(`update wage_runs set status = 'draft'`);
    const d = `${month}-02`;
    await db.q(`insert into attendance (worker_id, date, shift_id, status, needs_correction, source) values ($1, $2, $3, 'present', false, 'manual')`, [w.workers.ravi, d, w.shifts.A]);
    await assert.rejects(wages.prepareRun(owner, { month }), (e) => e.status === 409 && e.code === 'HOURS_MISSING' && e.details.count === 1);
    await db.q(`update attendance set check_in = $2, check_out = $3, worked_hours = 8 where worker_id = $1 and date = $4`, [w.workers.ravi, at('06:00', d), at('14:00', d), d]);
    assert.equal((await wages.prepareRun(owner, { month })).status, 'draft');
    await db.q(`update wage_runs set status = $1 where id = $2`, [run[0].status, run[0].id]);
  });

  test('a shift that may still be running does not block payroll (it cannot be resolved yet)', async () => {
    const run = await db.q(`select id, status from wage_runs`);
    await db.q(`update wage_runs set status = 'draft'`);
    await db.q(`insert into attendance (worker_id, date, shift_id, check_in, status, needs_correction, source) values ($1, $2, $3, now() - interval '2 hours', 'present', true, 'hardware')`,
      [w.workers.priya, `${month}-03`, w.shifts.A]);
    assert.equal((await wages.prepareRun(owner, { month })).status, 'draft', 'a check-in two hours ago is a shift in progress');
    await db.q(`update attendance set check_in = now() - interval '21 hours' where worker_id = $1 and date = $2`, [w.workers.priya, `${month}-03`]);
    await assert.rejects(wages.prepareRun(owner, { month }), (e) => e.code === 'ATTENDANCE_UNRESOLVED', 'after 20 hours it is an unclosed day');
    await db.q(`delete from attendance where worker_id = $1 and date = $2`, [w.workers.priya, `${month}-03`]);
    await db.q(`update wage_runs set status = $1 where id = $2`, [run[0].status, run[0].id]);
  });

  test('once the month is approved or paid, corrections to it are refused (paid data never changes quietly)', async () => {
    await db.q(`insert into attendance (worker_id, date, shift_id, check_in, status, needs_correction, source) values ($1, $2, $3, $4, 'present', true, 'hardware')`,
      [w.workers.ravi, `${month}-20`, w.shifts.A, at('06:00', `${month}-20`)]);
    const [late] = await db.q(`select id from attendance where date = $1`, [`${month}-20`]);
    await assert.rejects(att.correctAttendance(supervisor, late.id, { check_out: at('14:00', `${month}-20`), reason: 'Added after payroll closed' }),
      (e) => e.status === 409 && e.code === 'PAYROLL_LOCKED');
    const [still] = await db.q(`select needs_correction from attendance where id = $1`, [late.id]);
    assert.equal(still.needs_correction, true);
  });

  test('the virtual scanner never rewrites a row a person already decided, and its reset only removes demo rows', async () => {
    await db.q(`delete from rfid_scan_events`);
    const other = pastDay().replace(/-15$/, '-10');                         // a different, earlier day in the same month
    // a supervisor marked Priya absent; a simulator scan must not overwrite that
    await db.q(`insert into attendance (worker_id, date, shift_id, status, source) values ($1, $2, $3, 'absent', 'manual')`, [w.workers.priya, other, w.shifts.A]);
    const sim = await withTx((tx) => scan(tx, { device: virtual, cardUid: '11223344', source: 'simulator' }, { now: at('06:05', other) }));
    assert.equal(sim.attendance_action, 'manual_record_kept');
    const kept = await row(w.workers.priya, other);
    assert.equal(kept.status, 'absent');
    assert.equal(kept.source, 'manual');
    // the approved month blocks the reset only when simulator rows exist in it
    await withTx((tx) => scan(tx, { device: virtual, cardUid: 'AABBCCDD', source: 'simulator' }, { now: at('06:05', `${month}-05`) }));
    await assert.rejects(rfid.resetDemo(owner), (e) => e.status === 409 && e.code === 'PAYROLL_LOCKED');
    assert.ok((await row(w.workers.priya, other)), 'the manual row is still there');
    assert.ok((await row(w.workers.ravi, `${month}-05`)), 'and so is the simulator row (reset was refused)');
    // in an unlocked month the same reset works and removes only simulator rows
    await db.q(`update wage_runs set status = 'draft'`);
    const out = await rfid.resetDemo(owner);
    assert.equal(out.attendance_deleted, 1);
    assert.equal(await row(w.workers.ravi, `${month}-05`), undefined);
    assert.equal((await row(w.workers.priya, other)).status, 'absent');
    assert.ok(await row(w.workers.ravi), 'a real hardware row is untouched');
  });
});
