// RFID rules. Pure: no database, so they are easy to test.
//   card UID  → upper-case hex, separators removed, 4 / 7 / 10 byte cards (8–20 hex digits, whole bytes)
//   device key → stored only as a SHA-256 hash and compared in constant time
//   check-in  → which shift a scan belongs to, and whether it is on time

import { createHash, randomBytes, timingSafeEqual } from 'node:crypto';
import { checkInResult } from '../workforce/attendance.rules.js';
import { shiftContaining, shiftDateFor, shiftWindow } from '../../utils/shifts.js';

/** 'a1:b2 c3-d4' → 'A1B2C3D4'; null when it is not a card UID. */
export function normalizeUid(value) {
  if (typeof value !== 'string') return null;
  const uid = value.replace(/[\s:-]/g, '').toUpperCase();
  return /^[0-9A-F]{8,20}$/.test(uid) && uid.length % 2 === 0 ? uid : null;
}

export const hashDeviceKey = (key) => createHash('sha256').update(String(key), 'utf8').digest('hex');

/** A new device key: 32 random bytes, hex. Shown once; only its hash is stored. */
export const newDeviceKey = () => randomBytes(32).toString('hex');

export function deviceKeyMatches(key, storedHash) {
  if (typeof key !== 'string' || !key || !storedHash) return false;
  const a = Buffer.from(hashDeviceKey(key), 'hex');
  const b = Buffer.from(storedHash, 'hex');
  return a.length === b.length && timingSafeEqual(a, b);
}

/** How early before the shift start a check-in still counts for that shift. */
export const EARLY_CHECK_IN_MIN = 120;

/**
 * Which shift a scan at `at` checks the worker into.
 *  - A worker with a default shift is rostered: the scan must fall between EARLY_CHECK_IN_MIN before its start and its end,
 *    and lateness follows the shift's grace period.
 *  - A worker without a shift falls back to the shift running at that moment. There is no roster to be late against,
 *    so the check-in is "present" with no late minutes.
 * @returns {{ shift, date, rostered, status, lateMin } | { outside: true, shift?, date? }}
 */
export function resolveCheckIn(shifts, worker, at) {
  const own = worker.default_shift_id && shifts.find((s) => s.id === worker.default_shift_id);
  if (own) {
    const date = shiftDateFor(own, at);
    const { start, end } = shiftWindow(own, date);
    if (at < new Date(start.getTime() - EARLY_CHECK_IN_MIN * 60_000) || at >= end) return { outside: true, shift: own, date };
    const { lateMin, status } = checkInResult(own, date, at);
    return { shift: own, date, rostered: true, status, lateMin };
  }
  const running = shiftContaining(shifts, at);
  if (!running) return { outside: true };
  return { shift: running.shift, date: running.date, rostered: false, status: 'present', lateMin: 0 };
}
