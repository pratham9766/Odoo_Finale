// RFID administration: card assignments, scanner devices, the live dashboard, scan history and the virtual scanner.
// Scans themselves go through processScan (rfid.scan.js), the same pipeline the ESP32 uses.

import { env } from '../../config/env.js';
import { withTx } from '../../db/tx.js';
import { isInScope } from '../../middleware/rbac.js';
import { audit } from '../../utils/audit.js';
import { Filter } from '../../utils/crud/index.js';
import { AppError } from '../../utils/errors.js';
import { publish } from '../../utils/publish.js';
import { shiftContaining } from '../../utils/shifts.js';
import { addDays, todayIST } from '../../utils/time.js';
import { loadShifts } from '../mill/mill.service.js';
import { todayCounts } from '../workforce/attendance.service.js';
import { hashDeviceKey, newDeviceKey, normalizeUid } from './rfid.rules.js';
import { processScan } from './rfid.scan.js';

export const VIRTUAL_DEVICE = 'VIRTUAL_SCANNER';
export const DEMO_CODES = ['DEMO-RAVI', 'DEMO-PRIYA', 'DEMO-ARJUN', 'DEMO-MEENA'];

const uidOrFail = (value) => {
  const uid = normalizeUid(value);
  if (!uid) throw new AppError(422, 'VALIDATION_FAILED', 'Card UID must be 8–20 hex digits (4, 7 or 10 bytes)', { fieldErrors: { card_uid: ['Invalid card UID'] } });
  return uid;
};

const pushAttendance = () => publish('attendance.updated', (db) => todayCounts(db));

export const config = () => ({ simulator_enabled: env.RFID_SIMULATOR_ENABLED, duplicate_window_sec: env.RFID_DUPLICATE_WINDOW_SEC });

// ---- scanning -------------------------------------------------------------------------------------------------------

/** A scan from an authenticated physical scanner (the device was checked by the iot middleware). */
export async function hardwareScan(device, { cardUid, eventId }) {
  const out = await withTx(async (db) => {
    await db.query(`update rfid_devices set last_seen_at = now() where id = $1`, [device.id]);
    return processScan(db, { device, cardUid, source: 'hardware', requestEventId: eventId },
      { duplicateWindowSec: env.RFID_DUPLICATE_WINDOW_SEC });
  });
  if (out.attendance_action === 'checked_in') await pushAttendance();
  return out;
}

/** The virtual scanner: a signed-in user with rfid.simulate, demo / development only. Same pipeline, source "simulator". */
export async function simulateScan(ctx, { card_uid: cardUid, worker_id: workerId }) {
  if (!env.RFID_SIMULATOR_ENABLED) throw new AppError(403, 'SIMULATOR_DISABLED', 'The virtual RFID scanner is turned off on this server');
  const out = await withTx(async (db) => {
    const { rows: [device] } = await db.query(`select id, code from rfid_devices where code = $1 and kind = 'virtual' and active`, [VIRTUAL_DEVICE]);
    if (!device) throw new AppError(409, 'NO_VIRTUAL_SCANNER', 'The virtual scanner device is missing or inactive');
    let uid = cardUid;
    if (workerId) {                                     // "scan this worker's card": whatever UID is assigned right now
      const { rows: [card] } = await db.query(`select card_uid from rfid_credentials where worker_id = $1 and active`, [workerId]);
      if (!card) throw new AppError(422, 'NO_CARD', 'This worker has no active RFID card');
      uid = card.card_uid;
    }
    return processScan(db, { device, cardUid: uidOrFail(uid), source: 'simulator', scannedBy: ctx.userId },
      { duplicateWindowSec: env.RFID_DUPLICATE_WINDOW_SEC });
  });
  if (out.attendance_action === 'checked_in') await pushAttendance();
  return out;
}

/** Remove what the virtual scanner created (its scans and the attendance rows it checked in). Real data is never touched. */
export async function resetDemo(ctx) {
  if (!env.RFID_SIMULATOR_ENABLED) throw new AppError(403, 'SIMULATOR_DISABLED', 'The virtual RFID scanner is turned off on this server');
  const out = await withTx(async (db) => {
    const { rowCount: attendance } = await db.query(`delete from attendance where source = 'simulator'`);
    const { rowCount: scans } = await db.query(`delete from rfid_scan_events where source = 'simulator'`);
    await audit(db, ctx, { action: 'rfid.demo_reset', table: 'rfid_scan_events', after: { attendance, scans } });
    return { attendance_deleted: attendance, scans_deleted: scans };
  });
  await pushAttendance();
  return out;
}

// ---- card assignments -----------------------------------------------------------------------------------------------

/** Every worker with their current card (or none). */
export function listCards(ctx, { q, status, active = true } = {}) {
  return withTx(async (db) => {
    const f = new Filter().eq('w.active', active)
      .anyOf('w.stage_id', ctx.scope?.stage_ids).anyOf('w.default_shift_id', ctx.scope?.shift_ids)
      .search(['w.name', 'w.emp_code', 'c.card_uid'], q);
    if (status === 'assigned') f.where('c.id is not null');
    if (status === 'unassigned') f.where('c.id is null');
    if (status === 'placeholder') f.where('c.is_placeholder');
    const { rows } = await db.query(
      `select w.id as worker_id, w.emp_code, w.name, w.skill as role, coalesce(w.department, st.name) as department, w.work_area,
              w.active as worker_active, sh.name as shift,
              c.id as credential_id, c.card_uid, c.is_placeholder, c.created_at as assigned_at, c.updated_at
         from workers w
         left join rfid_credentials c on c.worker_id = w.id and c.active
         left join stages st on st.id = w.stage_id
         left join shifts sh on sh.id = w.default_shift_id
        where ${f.sql}
        order by (w.emp_code like 'DEMO-%') desc, (c.id is null), w.emp_code`, f.params);
    return rows;
  });
}

async function lockWorker(db, ctx, workerId) {
  const { rows: [w] } = await db.query(`select id, name, emp_code, stage_id, active from workers where id = $1 for update`, [workerId]);
  if (!w) throw new AppError(404, 'NOT_FOUND', 'Worker not found');
  if (!isInScope(ctx, 'stage', w.stage_id)) throw new AppError(403, 'OUT_OF_SCOPE', 'This worker is outside your assigned area');
  return w;
}

async function assertUidFree(db, uid, workerId) {
  const { rows: [taken] } = await db.query(
    `select w.name, w.emp_code from rfid_credentials c join workers w on w.id = c.worker_id where c.card_uid = $1 and c.active and c.worker_id <> $2`,
    [uid, workerId]);
  if (taken) throw new AppError(409, 'CARD_IN_USE', `Card ${uid} is already assigned to ${taken.name} (${taken.emp_code})`);
}

/** Give a worker a card. A worker who already has one must use replace, so nobody loses a card by accident. */
export async function assignCard(ctx, workerId, { card_uid: cardUid, is_placeholder: placeholder = false }) {
  const uid = uidOrFail(cardUid);
  return withTx(async (db) => {
    const w = await lockWorker(db, ctx, workerId);
    if (!w.active) throw new AppError(422, 'VALIDATION_FAILED', `${w.name} is not active`);
    const { rows: [current] } = await db.query(`select card_uid from rfid_credentials where worker_id = $1 and active`, [workerId]);
    if (current) throw new AppError(409, 'CARD_ALREADY_ASSIGNED', `${w.name} already has card ${current.card_uid}; replace it instead`);
    await assertUidFree(db, uid, workerId);
    const { rows: [row] } = await db.query(
      `insert into rfid_credentials (worker_id, card_uid, is_placeholder, created_by) values ($1, $2, $3, $4) returning *`,
      [workerId, uid, placeholder, ctx.userId]);
    await audit(db, ctx, { action: 'rfid.assign', table: 'rfid_credentials', id: row.id, after: { worker_id: workerId, card_uid: uid } });
    return row;
  });
}

/** Swap a worker's card (e.g. the placeholder for the physical card). The old credential is kept, inactive. */
export async function replaceCard(ctx, workerId, { card_uid: cardUid }) {
  const uid = uidOrFail(cardUid);
  return withTx(async (db) => {
    const w = await lockWorker(db, ctx, workerId);
    await assertUidFree(db, uid, workerId);
    const { rows: [old] } = await db.query(
      `update rfid_credentials set active = false, deactivated_at = now(), deactivated_by = $2, updated_at = now()
        where worker_id = $1 and active returning *`, [workerId, ctx.userId]);
    if (!old) throw new AppError(404, 'NO_CARD', `${w.name} has no active card to replace; assign one instead`);
    const { rows: [row] } = await db.query(
      `insert into rfid_credentials (worker_id, card_uid, is_placeholder, created_by) values ($1, $2, false, $3) returning *`,
      [workerId, uid, ctx.userId]);
    await audit(db, ctx, { action: 'rfid.replace', table: 'rfid_credentials', id: row.id,
      before: { card_uid: old.card_uid, credential_id: old.id }, after: { worker_id: workerId, card_uid: uid } });
    return row;
  });
}

/** Lost or returned card: it stops working at once; the worker can be given a new one later. */
export async function deactivateCard(ctx, workerId) {
  return withTx(async (db) => {
    const w = await lockWorker(db, ctx, workerId);
    const { rows: [old] } = await db.query(
      `update rfid_credentials set active = false, deactivated_at = now(), deactivated_by = $2, updated_at = now()
        where worker_id = $1 and active returning *`, [workerId, ctx.userId]);
    if (!old) throw new AppError(404, 'NO_CARD', `${w.name} has no active card`);
    await audit(db, ctx, { action: 'rfid.deactivate', table: 'rfid_credentials', id: old.id, before: { card_uid: old.card_uid } });
    return old;
  });
}

// ---- scanner devices ------------------------------------------------------------------------------------------------

const DEVICE_COLUMNS = 'id, code, name, kind, active, last_seen_at, created_at, updated_at';

export const listDevices = () => withTx(async (db) => (await db.query(`select ${DEVICE_COLUMNS} from rfid_devices order by kind, code`)).rows);

/** Register a physical scanner. The key is returned this once and never stored in plain text. */
export async function createDevice(ctx, { code, name }) {
  const key = newDeviceKey();
  return withTx(async (db) => {
    const { rows: [dup] } = await db.query(`select 1 from rfid_devices where code = $1`, [code]);
    if (dup) throw new AppError(409, 'DUPLICATE', `A scanner with code ${code} already exists; rotate its key instead`);
    const { rows: [row] } = await db.query(
      `insert into rfid_devices (code, name, kind, key_hash, created_by) values ($1, $2, 'hardware', $3, $4) returning ${DEVICE_COLUMNS}`,
      [code, name ?? null, hashDeviceKey(key), ctx.userId]);
    await audit(db, ctx, { action: 'rfid.device_create', table: 'rfid_devices', id: row.id, after: { code } });
    return { ...row, device_key: key };
  });
}

export async function rotateDeviceKey(ctx, id) {
  const key = newDeviceKey();
  return withTx(async (db) => {
    const { rows: [row] } = await db.query(
      `update rfid_devices set key_hash = $2, updated_at = now() where id = $1 and kind = 'hardware' returning ${DEVICE_COLUMNS}`,
      [id, hashDeviceKey(key)]);
    if (!row) throw new AppError(404, 'NOT_FOUND', 'Hardware scanner not found');
    await audit(db, ctx, { action: 'rfid.device_rotate', table: 'rfid_devices', id });
    return { ...row, device_key: key };
  });
}

export async function updateDevice(ctx, id, { name, active }) {
  return withTx(async (db) => {
    const { rows: [row] } = await db.query(
      `update rfid_devices set name = coalesce($2, name), active = coalesce($3, active), updated_at = now() where id = $1 returning ${DEVICE_COLUMNS}`,
      [id, name ?? null, active ?? null]);
    if (!row) throw new AppError(404, 'NOT_FOUND', 'Scanner not found');
    await audit(db, ctx, { action: 'rfid.device_update', table: 'rfid_devices', id, after: { name, active } });
    return row;
  });
}

// ---- dashboard and history ------------------------------------------------------------------------------------------

const EVENT_SELECT = `
  select e.id, e.scanned_at, e.status, e.source, e.card_uid, e.attendance_action, e.message, e.shift_date,
         d.code as device, w.id as worker_id, w.name as worker, w.emp_code, w.skill as role, sh.name as shift, a.status as attendance_status
    from rfid_scan_events e
    join rfid_devices d on d.id = e.device_id
    left join workers w on w.id = e.worker_id
    left join shifts sh on sh.id = e.shift_id
    left join attendance a on a.id = e.attendance_id`;

/**
 * The live RFID board for one attendance date (default: the running shift's date): every worker who has a card, whether they are in, their last scan,
 * and the latest scans. Counts come from the attendance table, so manual marks count too.
 */
export function dashboard(ctx, { date: asked } = {}) {
  return withTx(async (db) => {
    // default: the date of the shift running now, so the night shift after midnight still shows the evening's check-ins
    const date = asked ?? shiftContaining(await loadShifts(db), new Date())?.date ?? todayIST();
    const scope = new Filter().eq('w.active', true).where('c.id is not null')
      .anyOf('w.stage_id', ctx.scope?.stage_ids).anyOf('w.default_shift_id', ctx.scope?.shift_ids);
    const n = scope.params.length;
    const { rows: people } = await db.query(
      `select w.id as worker_id, w.emp_code, w.name, w.skill as role, coalesce(w.department, st.name) as department,
              coalesce(m.code || ' · ' || coalesce(m.name, ''), w.work_area) as area,
              c.card_uid, c.is_placeholder,
              att.status as attendance_status, att.check_in, att.late_min, att.source as attendance_source, att.shift,
              last.scanned_at as last_scan_at, last.source as last_scan_source, last.device as last_scan_device, last.status as last_scan_status
         from workers w
         join rfid_credentials c on c.worker_id = w.id and c.active
         left join stages st on st.id = w.stage_id
         left join lateral (select a.status, a.check_in, a.late_min, a.source, sh.name as shift, a.shift_id
                              from attendance a join shifts sh on sh.id = a.shift_id
                             where a.worker_id = w.id and a.date = $${n + 1}
                             order by a.check_in nulls last limit 1) att on true
         left join lateral (select mc.code, mc.name from assignments asg join machines mc on mc.id = asg.machine_id
                             where asg.worker_id = w.id and asg.date = $${n + 1}
                             order by asg.created_at desc limit 1) m on true
         left join lateral (select e.scanned_at, e.source, e.status, d.code as device from rfid_scan_events e join rfid_devices d on d.id = e.device_id
                             where e.worker_id = w.id and e.scanned_at >= $${n + 2}::timestamptz
                             order by e.scanned_at desc limit 1) last on true
        where ${scope.sql}
        order by w.emp_code`,
      [...scope.params, date, `${addDays(date, -1)}T18:30:00Z`]);   // since local midnight of the date (IST = UTC+5:30)

    const worked = (p) => ['present', 'late', 'half_day'].includes(p.attendance_status);
    const { rows: [{ total }] } = await db.query(`select count(*)::int as total from workers where active`);
    const { rows: recent } = await db.query(`${EVENT_SELECT} order by e.scanned_at desc limit 25`);
    return {
      date,
      kpis: {
        enrolled: people.length,
        present: people.filter(worked).length,
        not_checked_in: people.filter((p) => !worked(p)).length,
        late: people.filter((p) => p.attendance_status === 'late').length,
        workers_total: total,
      },
      people,
      recent,
    };
  });
}

/** Raw scan log, newest first. */
export function listEvents(ctx, { from, to, worker_id: workerId, status, source, page = 1, limit = 50 }) {
  return withTx(async (db) => {
    const f = new Filter().eq('e.worker_id', workerId).eq('e.status', status).eq('e.source', source);
    if (from) f.where('e.scanned_at >= ?::timestamptz', `${addDays(from, -1)}T18:30:00Z`);   // local midnight (IST = UTC+5:30)
    if (to) f.where('e.scanned_at < ?::timestamptz', `${to}T18:30:00Z`);
    const { rows: [{ total }] } = await db.query(`select count(*)::int as total from rfid_scan_events e where ${f.sql}`, f.params);
    const { rows } = await db.query(
      `${EVENT_SELECT} where ${f.sql} order by e.scanned_at desc limit $${f.params.length + 1} offset $${f.params.length + 2}`,
      [...f.params, limit, (page - 1) * limit]);
    return { rows, meta: { page, limit, total } };
  });
}

/** Attendance records with where each came from (card reader, simulator or a supervisor), for a date range. */
export function history(ctx, { from = addDays(todayIST(), -6), to = todayIST(), worker_id: workerId, source }) {
  return withTx(async (db) => {
    const f = new Filter().eq('a.worker_id', workerId).eq('a.source', source)
      .anyOf('w.stage_id', ctx.scope?.stage_ids).anyOf('a.shift_id', ctx.scope?.shift_ids);
    f.where('a.date between ? and ?', from, to);
    const { rows } = await db.query(
      `select a.id, a.date, a.check_in, a.check_out, a.status, a.late_min, a.source, a.needs_correction,
              w.id as worker_id, w.name as worker, w.emp_code, sh.name as shift,
              d.code as device, e.status as scan_result, e.card_uid
         from attendance a join workers w on w.id = a.worker_id join shifts sh on sh.id = a.shift_id
         left join rfid_scan_events e on e.id = a.check_in_event_id
         left join rfid_devices d on d.id = e.device_id
        where ${f.sql}
        order by a.date desc, a.check_in desc nulls last, w.emp_code limit 500`, f.params);
    return rows;
  });
}
