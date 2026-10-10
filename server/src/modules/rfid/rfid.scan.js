// The one RFID scan pipeline. The ESP32 endpoint and the virtual scanner both end up here, inside one transaction:
//   card → active credential → worker → duplicate check → shift → attendance check-in → scan event.
// A scan never toggles check-out and never logs production: later scans of the day are recorded and left alone.

import { randomUUID } from 'node:crypto';
import { AppError } from '../../utils/errors.js';
import { loadShifts } from '../mill/mill.service.js';
import { normalizeUid, resolveCheckIn } from './rfid.rules.js';

const MESSAGES = {
  checked_in: 'Checked in',
  already_checked_in: 'Already checked in for this shift',
  outside_shift: 'Scan recorded, but it is outside the worker\'s shift window, so no check-in was made',
  manual_record_kept: 'Scan recorded; the supervisor\'s attendance entry for this shift was kept',
};

/** The scan as the API returns it. */
function result(device, event, worker, extra = {}) {
  return {
    success: event.status === 'accepted',
    status: event.status,
    employee: worker ? { id: worker.worker_id ?? worker.id, name: worker.name, role: worker.skill ?? null, emp_code: worker.emp_code } : null,
    cardUid: event.card_uid,
    deviceId: device.code,
    timestamp: event.scanned_at,
    event_id: event.id,
    ok: event.status === 'accepted',
    attendance_action: event.attendance_action ?? null,
    message: event.message,
    card_uid: event.card_uid,
    scanned_at: event.scanned_at,
    source: event.source,
    worker: worker ? { id: worker.worker_id ?? worker.id, name: worker.name, emp_code: worker.emp_code } : null,
    shift: event.shift_name ?? null,
    shift_date: event.shift_date ?? null,
    ...extra,
  };
}

async function insertEvent(db, e) {
  const { rows: [row] } = await db.query(
    `insert into rfid_scan_events (id, device_id, source, card_uid, credential_id, worker_id, scanned_at, status, attendance_action,
                                   attendance_id, shift_id, shift_date, message, request_event_id, scanned_by)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13, $14, $15) returning *`,
    [e.id ?? randomUUID(), e.device_id, e.source, e.card_uid, e.credential_id ?? null, e.worker_id ?? null, e.scanned_at, e.status,
      e.attendance_action ?? null, e.attendance_id ?? null, e.shift_id ?? null, e.shift_date ?? null, e.message,
      e.request_event_id ?? null, e.scanned_by ?? null]);
  return row;
}

/** The check-in itself, through the existing attendance row (one per worker, date and shift). */
async function checkIn(db, { worker, plan, at, source, eventId }) {
  const { rows: [existing] } = await db.query(
    `select id, check_in, status from attendance where worker_id = $1 and date = $2 and shift_id = $3 for update`,
    [worker.worker_id, plan.date, plan.shift.id]);

  if (!existing) {
    // no check-out yet, so the day needs a supervisor's look before hours count (worked_hours stays 0)
    const { rows: [row] } = await db.query(
      `insert into attendance (worker_id, date, shift_id, check_in, late_min, status, needs_correction, source, check_in_event_id)
       values ($1, $2, $3, $4, $5, $6, true, $7, $8) returning id, status, late_min`,
      [worker.worker_id, plan.date, plan.shift.id, at, plan.lateMin, plan.status, source, eventId]);
    return { action: 'checked_in', attendance: row };
  }
  if (existing.check_in) return { action: 'already_checked_in', attendance: existing };
  if (existing.status === 'absent') {          // marked absent before the worker arrived: the card is the better evidence
    const { rows: [row] } = await db.query(
      `update attendance set check_in = $2, late_min = $3, status = $4, needs_correction = true, source = $5, check_in_event_id = $6
        where id = $1 returning id, status, late_min`,
      [existing.id, at, plan.lateMin, plan.status, source, eventId]);
    return { action: 'checked_in', attendance: row };
  }
  return { action: 'manual_record_kept', attendance: existing };   // leave, weekly off, holiday: a person decided that
}

/**
 * Process one scan. Runs inside the caller's transaction.
 * @param {object} db  pg client in a transaction
 * @param {{ device: {id, code}, cardUid: string, source: 'hardware'|'simulator', requestEventId?: string, scannedBy?: string }} input
 * @param {{ now?: Date, duplicateWindowSec?: number }} options
 */
export async function processScan(db, { device, cardUid, source, requestEventId, scannedBy }, { now = new Date(), duplicateWindowSec = 3 } = {}) {
  const uid = normalizeUid(cardUid);
  if (!uid) throw new AppError(422, 'VALIDATION_FAILED', 'Card UID must be 8–20 hex digits (4, 7 or 10 bytes)');
  const base = { device_id: device.id, source, card_uid: uid, scanned_at: now, request_event_id: requestEventId, scanned_by: scannedBy };

  // a retried request (same device + event id) gets the original answer and changes nothing
  if (requestEventId) {
    await db.query(`select pg_advisory_xact_lock(hashtext($1))`, [`rfid:${device.id}:${requestEventId}`]);
    const { rows: [prior] } = await db.query(
      `select e.*, sh.name as shift_name, w.name, w.emp_code, w.skill from rfid_scan_events e
         left join shifts sh on sh.id = e.shift_id left join workers w on w.id = e.worker_id
        where e.device_id = $1 and e.request_event_id = $2`, [device.id, requestEventId]);
    if (prior) return result(device, prior, prior.worker_id && { id: prior.worker_id, name: prior.name, emp_code: prior.emp_code, skill: prior.skill }, { replayed: true });
  }

  // the active card, and its worker locked so two scans of the same card cannot both check in
  const { rows: [card] } = await db.query(
    `select c.id as credential_id, w.id as worker_id, w.name, w.emp_code, w.skill, w.active, w.default_shift_id
       from rfid_credentials c join workers w on w.id = c.worker_id
      where c.card_uid = $1 and c.active
      for update of w`, [uid]);

  if (!card) {
    const { rows: [old] } = await db.query(
      `select c.id, c.worker_id from rfid_credentials c where c.card_uid = $1 order by c.updated_at desc limit 1`, [uid]);
    const event = await insertEvent(db, old
      ? { ...base, status: 'rejected', credential_id: old.id, worker_id: old.worker_id, message: 'This card has been deactivated' }
      : { ...base, status: 'unknown_card', message: 'Card is not assigned to anyone' });
    return result(device, event, null);
  }
  const worker = card;
  const withWorker = { ...base, credential_id: card.credential_id, worker_id: card.worker_id };

  if (!worker.active) {
    const event = await insertEvent(db, { ...withWorker, status: 'invalid_employee', message: `${worker.name} is not an active worker` });
    return result(device, event, worker);
  }

  const { rows: [recent] } = await db.query(
    `select scanned_at from rfid_scan_events
      where worker_id = $1 and status = 'accepted' and scanned_at > $2::timestamptz - make_interval(secs => $3)
      order by scanned_at desc limit 1`, [worker.worker_id, now, duplicateWindowSec]);
  if (recent) {
    const event = await insertEvent(db, { ...withWorker, status: 'duplicate', message: `Scanned again within ${duplicateWindowSec} s; ignored` });
    return result(device, event, worker);
  }

  const plan = resolveCheckIn(await loadShifts(db), worker, now);
  const eventId = randomUUID();
  let action = 'outside_shift', attendance = null;
  if (!plan.outside) ({ action, attendance } = await checkIn(db, { worker, plan, at: now, source, eventId }));

  const event = await insertEvent(db, {
    ...withWorker, id: eventId, status: 'accepted', attendance_action: action, attendance_id: attendance?.id,
    shift_id: plan.shift?.id, shift_date: plan.date, message: MESSAGES[action],
  });
  return result(device, { ...event, shift_name: plan.shift?.name }, worker, {
    attendance_status: attendance?.status ?? null,
    late_min: attendance?.late_min ?? 0,
    rostered: plan.rostered ?? null,
  });
}
