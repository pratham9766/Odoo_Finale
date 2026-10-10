// Shift maths, shared by production logs, attendance and the board. Pure: shifts come in as rows from the `shifts` table
// ({ id, name, start_time: 'HH:MM[:SS]', end_time, grace_min }).
//
// A shift belongs to the date it STARTS on: the night shift 22:00–06:00 that begins on 10 Oct is "10 Oct" until 06:00 on the 11th.

import { addDays, atIST, istParts } from './time.js';

const DAY = 1440;
const minutesOfDay = (time) => { const [h, m] = time.split(':').map(Number); return h * 60 + m; };

/** Length in minutes; a shift whose end is before its start runs through midnight. */
export function shiftMinutes(shift) {
  const length = minutesOfDay(shift.end_time) - minutesOfDay(shift.start_time);
  return length > 0 ? length : length + DAY;
}

export const shiftHours = (shift) => shiftMinutes(shift) / 60;

/** The real start and end moments of a shift that starts on `date`. */
export function shiftWindow(shift, date) {
  const start = atIST(date, minutesOfDay(shift.start_time));
  return { start, end: new Date(start.getTime() + shiftMinutes(shift) * 60_000), hours: shiftHours(shift) };
}

/**
 * The date a punch or log at `at` belongs to for this shift. For a normal shift that is the calendar date; for a shift
 * through midnight, anything before the middle of the off-period (14:00 for 22:00–06:00) belongs to the day before:
 * the 06:10 check-out of the 22:00 shift counts for yesterday.
 */
export function shiftDateFor(shift, at) {
  const { date, minutes } = istParts(at);
  if (minutesOfDay(shift.end_time) > minutesOfDay(shift.start_time)) return date;
  const offStart = minutesOfDay(shift.end_time);
  const boundary = offStart + (DAY - shiftMinutes(shift)) / 2;
  return minutes < boundary ? addDays(date, -1) : date;
}

/** The shift whose window contains `at`, with the date it started on, or null. */
export function shiftContaining(shifts, at) {
  const today = istParts(at).date;
  for (const shift of shifts) {
    for (const date of [today, addDays(today, -1)]) {
      const { start, end } = shiftWindow(shift, date);
      if (at >= start && at < end) return { shift, date };
    }
  }
  return null;
}

/** The worker's own shift if they have one, otherwise the shift running at `at`. Null when neither exists. */
export function resolveShift(shifts, worker, at) {
  const own = worker.default_shift_id && shifts.find((s) => s.id === worker.default_shift_id);
  return own ? { shift: own, date: shiftDateFor(own, at) } : shiftContaining(shifts, at);
}
