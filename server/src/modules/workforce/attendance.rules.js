// Attendance rules (overall plan §13.3). Pure: a shift, the date it started on and the moments in question go in; numbers and a status come out.
//   late      = minutes after the shift start plus its grace period
//   half day  = worked less than half the shift
//   overtime  = hours beyond the shift (needs approval before it is paid)

import { round2 } from '../../utils/money.js';
import { shiftWindow } from '../../utils/shifts.js';
import { minutesBetween } from '../../utils/time.js';

/** Check-in: how late (0 within grace) and the resulting status. */
export function checkInResult(shift, date, at) {
  const { start } = shiftWindow(shift, date);
  const lateMin = Math.max(0, minutesBetween(start, at) - shift.grace_min);
  return { lateMin, status: lateMin > 0 ? 'late' : 'present' };
}

/**
 * Check-out: hours worked, overtime, early leave and the status. A late arrival stays "late" unless the day was
 * under half a shift, which makes it a half day.
 * @param {{ check_in: Date, status: string }} attendance
 */
export function checkOutResult(attendance, shift, date, at) {
  const { end, hours } = shiftWindow(shift, date);
  const worked = Math.max(0, minutesBetween(attendance.check_in, at)) / 60;
  return {
    workedHours: round2(worked),
    otHours: round2(Math.max(0, worked - hours)),
    earlyLeaveMin: Math.max(0, minutesBetween(at, end)),
    status: worked < hours / 2 ? 'half_day' : attendance.status,
  };
}

/** The attendance columns for a day with the given in / out times (a correction, or a supervisor entering both times). */
export function dayFromTimes(shift, date, { check_in: checkIn, check_out: checkOut, status }) {
  const lateMin = checkIn ? checkInResult(shift, date, checkIn).lateMin : 0;
  const base = { check_in: checkIn ?? null, check_out: checkOut ?? null, late_min: lateMin, worked_hours: 0, ot_hours: 0, early_leave_min: 0 };
  const derived = status ?? (checkIn ? (lateMin > 0 ? 'late' : 'present') : 'absent');
  if (!checkIn || !checkOut) return { ...base, status: derived };
  const out = checkOutResult({ check_in: checkIn, status: derived }, shift, date, checkOut);
  return { ...base, worked_hours: out.workedHours, ot_hours: out.otHours, early_leave_min: out.earlyLeaveMin, status: status ?? out.status };
}
