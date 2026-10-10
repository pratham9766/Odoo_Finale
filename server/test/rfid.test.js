import { test } from 'node:test';
import assert from 'node:assert/strict';
import { deviceKeyMatches, hashDeviceKey, newDeviceKey, normalizeUid, resolveCheckIn } from '../src/modules/rfid/rfid.rules.js';
import { processScan } from '../src/modules/rfid/rfid.scan.js';
import { iotScanSchema, simulateSchema } from '../src/modules/rfid/rfid.schema.js';
import { atIST } from '../src/utils/time.js';

const SHIFTS = [
  { id: 'A', name: 'A', start_time: '06:00:00', end_time: '14:00:00', grace_min: 10 },
  { id: 'B', name: 'B', start_time: '14:00:00', end_time: '22:00:00', grace_min: 10 },
  { id: 'C', name: 'C', start_time: '22:00:00', end_time: '06:00:00', grace_min: 10 },
];
const at = (hhmm, date = '2026-10-11') => { const [h, m] = hhmm.split(':').map(Number); return atIST(date, h * 60 + m); };

test('card UIDs are normalised to upper-case hex and whole bytes', () => {
  assert.equal(normalizeUid('a1b2c3d4'), 'A1B2C3D4');
  assert.equal(normalizeUid(' A1:B2:C3:D4 '), 'A1B2C3D4');
  assert.equal(normalizeUid('04-a1-b2-c3-d4-e5-f6'), '04A1B2C3D4E5F6');
  assert.equal(normalizeUid('A1B2C3'), null);          // too short
  assert.equal(normalizeUid('A1B2C3D'), null);         // half a byte
  assert.equal(normalizeUid('G1B2C3D4'), null);        // not hex
  assert.equal(normalizeUid(12345678), null);
});

test('device keys are checked against their hash only', () => {
  const key = newDeviceKey();
  assert.equal(key.length, 64);
  const stored = hashDeviceKey(key);
  assert.notEqual(stored, key);
  assert.equal(deviceKeyMatches(key, stored), true);
  assert.equal(deviceKeyMatches(`${key}x`, stored), false);
  assert.equal(deviceKeyMatches('', stored), false);
  assert.equal(deviceKeyMatches(undefined, stored), false);
  assert.equal(deviceKeyMatches(key, null), false);
});

test('a rostered worker is on time within grace, late after it, and outside the window gets no check-in', () => {
  const worker = { default_shift_id: 'A' };
  assert.deepEqual(resolveCheckIn(SHIFTS, worker, at('06:08')), { shift: SHIFTS[0], date: '2026-10-11', rostered: true, status: 'present', lateMin: 0 });
  assert.equal(resolveCheckIn(SHIFTS, worker, at('05:00')).status, 'present');         // early, inside the 2 h window
  const late = resolveCheckIn(SHIFTS, worker, at('06:25'));
  assert.equal(late.status, 'late');
  assert.equal(late.lateMin, 15);
  assert.equal(resolveCheckIn(SHIFTS, worker, at('15:00')).outside, true);            // after the shift ended
  assert.equal(resolveCheckIn(SHIFTS, worker, at('03:30')).outside, true);            // too early
});

test('the night shift check-in after midnight belongs to the day it started', () => {
  const r = resolveCheckIn(SHIFTS, { default_shift_id: 'C' }, at('00:30', '2026-10-12'));
  assert.equal(r.date, '2026-10-11');
  assert.equal(r.status, 'late');
});

test('a worker without a shift falls back to the running shift and is never marked late', () => {
  const r = resolveCheckIn(SHIFTS, { default_shift_id: null }, at('20:15'));
  assert.equal(r.shift.id, 'B');
  assert.equal(r.rostered, false);
  assert.equal(r.status, 'present');
  assert.equal(r.lateMin, 0);
});

test('device and simulator payloads are validated', () => {
  assert.equal(iotScanSchema.safeParse({ cardUid: 'A1B2C3D4', deviceId: 'gate_01' }).data.deviceId, 'GATE_01');
  assert.equal(iotScanSchema.safeParse({ cardUid: 'A1B2C3D4', deviceId: 'GATE 01' }).success, false);
  assert.equal(iotScanSchema.safeParse({ cardUid: 'A1B2C3D4', deviceId: 'GATE_01', eventId: 'x'.repeat(65) }).success, false);
  assert.equal(simulateSchema.safeParse({}).success, false);
  assert.equal(simulateSchema.safeParse({ card_uid: 'A1B2C3D4', worker_id: '9b2f6c1e-2c4f-4d5e-9a3b-1c2d3e4f5a6b' }).success, false);
});

// ---- processScan against an in-memory database ----------------------------------------------------------------------

function fakeDb({ cards = [], oldCards = [], events = [], attendance = [] } = {}) {
  const state = { cards, oldCards, events, attendance, writes: [] };
  const db = {
    state,
    async query(sql, params = []) {
      if (/pg_advisory_xact_lock/.test(sql)) return { rows: [] };
      if (/from rfid_scan_events e\s+left join shifts/.test(sql)) {
        return { rows: state.events.filter((e) => e.device_id === params[0] && e.request_event_id === params[1]) };
      }
      if (/from rfid_credentials c join workers w/.test(sql)) return { rows: state.cards.filter((c) => c.card_uid === params[0]) };
      if (/from rfid_credentials c where c.card_uid/.test(sql)) return { rows: state.oldCards.filter((c) => c.card_uid === params[0]) };
      if (/from rfid_scan_events\s+where worker_id/.test(sql)) {
        const since = new Date(params[1]).getTime() - params[2] * 1000;
        return { rows: state.events.filter((e) => e.worker_id === params[0] && e.status === 'accepted' && new Date(e.scanned_at).getTime() > since) };
      }
      if (/from shifts/.test(sql)) return { rows: SHIFTS };
      if (/from attendance where worker_id/.test(sql)) {
        return { rows: state.attendance.filter((a) => a.worker_id === params[0] && a.date === params[1] && a.shift_id === params[2]) };
      }
      if (/insert into attendance/.test(sql)) {
        const row = { id: `att-${state.attendance.length + 1}`, worker_id: params[0], date: params[1], shift_id: params[2], check_in: params[3], late_min: params[4], status: params[5], source: params[6] };
        state.attendance.push(row);
        state.writes.push('attendance.insert');
        return { rows: [row] };
      }
      if (/update attendance/.test(sql)) {
        const row = state.attendance.find((a) => a.id === params[0]);
        Object.assign(row, { check_in: params[1], late_min: params[2], status: params[3], source: params[4] });
        state.writes.push('attendance.update');
        return { rows: [row] };
      }
      if (/insert into rfid_scan_events/.test(sql)) {
        const [id, device_id, source, card_uid, credential_id, worker_id, scanned_at, status, attendance_action, attendance_id, shift_id, shift_date, message, request_event_id] = params;
        const row = { id, device_id, source, card_uid, credential_id, worker_id, scanned_at, status, attendance_action, attendance_id, shift_id, shift_date, message, request_event_id };
        state.events.push(row);
        return { rows: [row] };
      }
      throw new Error(`unexpected SQL: ${sql}`);
    },
  };
  return db;
}

const device = { id: 'dev-1', code: 'GATE_01' };
const ravi = { credential_id: 'cred-1', worker_id: 'w-ravi', name: 'Ravi', emp_code: 'DEMO-RAVI', active: true, default_shift_id: null, card_uid: 'A1B2C3D4' };
const scan = (db, extra = {}, now = at('09:00')) => processScan(db, { device, cardUid: 'a1b2c3d4', source: 'simulator', ...extra }, { now, duplicateWindowSec: 30 });

test('a valid scan checks the worker in once and stores an accepted event', async () => {
  const db = fakeDb({ cards: [ravi] });
  const r = await scan(db);
  assert.equal(r.status, 'accepted');
  assert.equal(r.ok, true);
  assert.equal(r.attendance_action, 'checked_in');
  assert.equal(r.worker.name, 'Ravi');
  assert.equal(r.shift, 'A');
  assert.equal(db.state.attendance.length, 1);
  assert.equal(db.state.attendance[0].source, 'simulator');
  assert.equal(db.state.events.length, 1);
});

test('a rapid repeat is a duplicate and writes no attendance', async () => {
  const db = fakeDb({ cards: [ravi] });
  await scan(db, {}, at('09:00'));
  const again = await scan(db, {}, new Date(at('09:00').getTime() + 5_000));
  assert.equal(again.status, 'duplicate');
  assert.equal(again.ok, false);
  assert.deepEqual(db.state.writes, ['attendance.insert']);
  assert.equal(db.state.events.length, 2);
});

test('a later scan in the same shift is recorded but does not toggle check-out', async () => {
  const db = fakeDb({ cards: [ravi] });
  await scan(db, {}, at('09:00'));
  const later = await scan(db, {}, at('12:00'));
  assert.equal(later.status, 'accepted');
  assert.equal(later.attendance_action, 'already_checked_in');
  assert.deepEqual(db.state.writes, ['attendance.insert']);
});

test('unknown, deactivated and inactive-worker cards never touch attendance', async () => {
  const unknown = fakeDb();
  assert.equal((await scan(unknown, { cardUid: 'DEADBEEF' })).status, 'unknown_card');
  assert.equal(unknown.state.events[0].worker_id, null);

  const old = fakeDb({ oldCards: [{ id: 'cred-0', worker_id: 'w-ravi', card_uid: 'A1B2C3D4' }] });
  assert.equal((await scan(old)).status, 'rejected');

  const inactive = fakeDb({ cards: [{ ...ravi, active: false }] });
  assert.equal((await scan(inactive)).status, 'invalid_employee');

  for (const db of [unknown, old, inactive]) assert.deepEqual(db.state.writes, []);
});

test('a supervisor\'s absent mark is replaced by the card, a leave entry is kept', async () => {
  const absent = fakeDb({ cards: [ravi], attendance: [{ id: 'att-x', worker_id: 'w-ravi', date: '2026-10-11', shift_id: 'A', check_in: null, status: 'absent' }] });
  assert.equal((await scan(absent)).attendance_action, 'checked_in');
  assert.equal(absent.state.attendance[0].status, 'present');

  const leave = fakeDb({ cards: [ravi], attendance: [{ id: 'att-y', worker_id: 'w-ravi', date: '2026-10-11', shift_id: 'A', check_in: null, status: 'leave' }] });
  assert.equal((await scan(leave)).attendance_action, 'manual_record_kept');
  assert.equal(leave.state.attendance[0].status, 'leave');
});

test('a retried device request with the same eventId replays the first answer', async () => {
  const db = fakeDb({ cards: [ravi] });
  const first = await scan(db, { source: 'hardware', requestEventId: 'esp-1' });
  const retry = await scan(db, { source: 'hardware', requestEventId: 'esp-1' }, new Date(at('09:00').getTime() + 1000));
  assert.equal(retry.replayed, true);
  assert.equal(retry.event_id, first.event_id);
  assert.equal(db.state.events.length, 1);
  assert.deepEqual(db.state.writes, ['attendance.insert']);
});

test('an invalid UID is refused before anything is stored', async () => {
  const db = fakeDb({ cards: [ravi] });
  await assert.rejects(scan(db, { cardUid: 'XYZ' }), (err) => err.status === 422);
  assert.equal(db.state.events.length, 0);
});

// ---- route guards ---------------------------------------------------------------------------------------------------

test('RFID routes refuse staff without the RFID permissions before touching the database', async () => {
  const { default: express } = await import('express');
  const { default: request } = await import('supertest');
  const { default: rfidRoutes } = await import('../src/modules/rfid/rfid.routes.js');
  const { errorHandler } = await import('../src/middleware/errorHandler.js');
  const app = express();
  app.use(express.json());
  app.use((req, _res, next) => { req.ctx = { userId: 'u1', permissions: new Set(['attendance.view', 'rfid.view']), modules: {}, scope: {} }; next(); });
  app.use(rfidRoutes);
  app.use(errorHandler);

  const sim = await request(app).post('/rfid/simulate').send({ card_uid: 'A1B2C3D4' });
  assert.equal(sim.status, 403);
  assert.match(sim.body.error.message, /rfid\.simulate/);
  assert.equal((await request(app).put('/rfid/workers/9b2f6c1e-2c4f-4d5e-9a3b-1c2d3e4f5a6b/card').send({ card_uid: 'A1B2C3D4' })).status, 403);
  assert.equal((await request(app).post('/rfid/devices').send({ code: 'GATE_01' })).status, 403);
  assert.equal((await request(app).post('/rfid/demo/reset')).status, 403);
});

test('the device endpoint needs a device key and never accepts a user token instead', async () => {
  const { default: request } = await import('supertest');
  const { app } = await import('../src/app.js');
  const res = await request(app).post('/api/v1/iot/rfid-scan').set('Authorization', 'Bearer x').send({ cardUid: 'A1B2C3D4' });
  assert.equal(res.status, 400);                        // body checked first: deviceId missing
  const bad = await request(app).post('/api/v1/iot/rfid-scan').send({ cardUid: 'ZZ-NOT-HEX', deviceId: 'GATE_01' });
  assert.equal(bad.status, 400);
  assert.equal(bad.body.error.code, 'BAD_REQUEST');
  const sim = await request(app).post('/api/v1/rfid/simulate').send({ card_uid: 'A1B2C3D4' });
  assert.equal(sim.status, 401);                        // no session, no simulator
});
