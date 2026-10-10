import { test } from 'node:test';
import assert from 'node:assert/strict';
import { checkInResult, checkOutResult, dayFromTimes } from '../src/modules/workforce/attendance.rules.js';
import { buildRegister, monthDays } from '../src/modules/workforce/register.js';
import { grossPay, recoverAdvances } from '../src/modules/workforce/wageRules.js';
import { resolveShift, shiftContaining, shiftDateFor, shiftHours, shiftMinutes, shiftWindow } from '../src/utils/shifts.js';
import { addDays, atIST, istParts, minutesBetween, monthStart, nextMonthStart, reportRange } from '../src/utils/time.js';

const A = { id: 'a', name: 'A', start_time: '06:00:00', end_time: '14:00:00', grace_min: 10 };
const B = { id: 'b', name: 'B', start_time: '14:00:00', end_time: '22:00:00', grace_min: 10 };
const C = { id: 'c', name: 'C', start_time: '22:00:00', end_time: '06:00:00', grace_min: 10 };
const shifts = [A, B, C];
const ist = (date, hhmm) => atIST(date, Number(hhmm.slice(0, 2)) * 60 + Number(hhmm.slice(3)));   // a moment, written the way a clerk says it

// ---- IST arithmetic -------------------------------------------------------------------------------------------------

test('IST date maths: the calendar date and minutes of day in India, round trips, month edges', () => {
  assert.deepEqual(istParts(new Date('2026-10-10T20:00:00Z')), { date: '2026-10-11', minutes: 90 });
  assert.equal(ist('2026-10-11', '01:30').toISOString(), '2026-10-10T20:00:00.000Z');
  assert.equal(atIST('2026-10-10', 1440 + 30).toISOString(), ist('2026-10-11', '00:30').toISOString());          // past midnight rolls into the next day
  assert.equal(addDays('2026-10-31', 1), '2026-11-01');
  assert.equal(addDays('2026-01-01', -1), '2025-12-31');
  assert.equal(minutesBetween(ist('2026-10-10', '06:00'), ist('2026-10-10', '06:25')), 25);
  assert.equal(monthStart('2026-10-17'), '2026-10-01');
  assert.equal(nextMonthStart('2026-10-17'), '2026-11-01');
  assert.equal(nextMonthStart('2026-12-05'), '2027-01-01');
  assert.deepEqual(reportRange({}, 30, new Date('2026-10-10T08:00:00Z')), { from: '2026-09-11', to: '2026-10-10' });
  assert.deepEqual(reportRange({ from: '2026-01-01', to: '2026-01-31' }), { from: '2026-01-01', to: '2026-01-31' });
});

// ---- shifts ---------------------------------------------------------------------------------------------------------

test('shift length and window, including a shift through midnight', () => {
  assert.equal(shiftMinutes(A), 480);
  assert.equal(shiftMinutes(C), 480);
  assert.equal(shiftHours(C), 8);
  const { start, end } = shiftWindow(C, '2026-10-10');
  assert.equal(start.toISOString(), ist('2026-10-10', '22:00').toISOString());
  assert.equal(end.toISOString(), ist('2026-10-11', '06:00').toISOString());
});

test('night shift: attendance date = the date the shift STARTED on', () => {
  assert.equal(shiftDateFor(C, ist('2026-10-10', '21:50')), '2026-10-10');       // early arrival
  assert.equal(shiftDateFor(C, ist('2026-10-10', '23:30')), '2026-10-10');
  assert.equal(shiftDateFor(C, ist('2026-10-11', '00:20')), '2026-10-10');       // after midnight, still the 10th's shift
  assert.equal(shiftDateFor(C, ist('2026-10-11', '06:10')), '2026-10-10');       // the check-out
  assert.equal(shiftDateFor(C, ist('2026-10-11', '13:59')), '2026-10-10');
  assert.equal(shiftDateFor(C, ist('2026-10-11', '14:01')), '2026-10-11');       // the next shift's early arrival
  assert.equal(shiftDateFor(A, ist('2026-10-11', '06:10')), '2026-10-11');       // a normal shift is the calendar date
});

test('shiftContaining and resolveShift', () => {
  assert.deepEqual(shiftContaining(shifts, ist('2026-10-10', '08:00')), { shift: A, date: '2026-10-10' });
  assert.deepEqual(shiftContaining(shifts, ist('2026-10-10', '14:00')), { shift: B, date: '2026-10-10' });   // the end is exclusive
  assert.deepEqual(shiftContaining(shifts, ist('2026-10-11', '02:00')), { shift: C, date: '2026-10-10' });
  assert.equal(shiftContaining([A, B], ist('2026-10-10', '23:00')), null);                                    // a gap between shifts
  assert.deepEqual(resolveShift(shifts, { default_shift_id: 'a' }, ist('2026-10-10', '14:12')), { shift: A, date: '2026-10-10' });   // late check-out: own shift wins
  assert.deepEqual(resolveShift(shifts, { default_shift_id: 'c' }, ist('2026-10-11', '06:10')), { shift: C, date: '2026-10-10' });
  assert.deepEqual(resolveShift(shifts, {}, ist('2026-10-10', '15:00')), { shift: B, date: '2026-10-10' });  // no default shift: whichever is running
});

// ---- attendance rules -----------------------------------------------------------------------------------------------

test('late only after the grace period', () => {
  assert.deepEqual(checkInResult(A, '2026-10-10', ist('2026-10-10', '05:50')), { lateMin: 0, status: 'present' });
  assert.deepEqual(checkInResult(A, '2026-10-10', ist('2026-10-10', '06:04')), { lateMin: 0, status: 'present' });   // the plan's example
  assert.deepEqual(checkInResult(A, '2026-10-10', ist('2026-10-10', '06:10')), { lateMin: 0, status: 'present' });   // exactly the grace
  assert.deepEqual(checkInResult(A, '2026-10-10', ist('2026-10-10', '06:25')), { lateMin: 15, status: 'late' });
  assert.deepEqual(checkInResult(C, '2026-10-10', ist('2026-10-10', '22:40')), { lateMin: 30, status: 'late' });       // night shift, same rule
});

test('check-out: hours worked, overtime and early leave', () => {
  const day = { check_in: ist('2026-10-10', '06:04'), status: 'present' };
  const normal = checkOutResult(day, A, '2026-10-10', ist('2026-10-10', '14:12'));
  assert.equal(normal.workedHours, 8.13);
  assert.equal(normal.otHours, 0.13);
  assert.equal(normal.earlyLeaveMin, 0);
  assert.equal(normal.status, 'present');
  const overtime = checkOutResult(day, A, '2026-10-10', ist('2026-10-10', '16:04'));
  assert.equal(overtime.otHours, 2);
  const early = checkOutResult(day, A, '2026-10-10', ist('2026-10-10', '13:00'));
  assert.equal(early.earlyLeaveMin, 60);
  assert.equal(early.otHours, 0);
});

test('under half a shift is a half day, and it beats "late"', () => {
  const late = { check_in: ist('2026-10-10', '06:30'), status: 'late' };
  assert.equal(checkOutResult(late, A, '2026-10-10', ist('2026-10-10', '14:00')).status, 'late');
  assert.equal(checkOutResult(late, A, '2026-10-10', ist('2026-10-10', '09:00')).status, 'half_day');
  assert.equal(checkOutResult({ check_in: ist('2026-10-10', '06:00'), status: 'present' }, A, '2026-10-10', ist('2026-10-10', '10:00')).status, 'present');   // exactly half: not under
});

test('night shift through midnight: worked hours and overtime across the date change', () => {
  const day = { check_in: ist('2026-10-10', '21:58'), status: 'present' };
  const out = checkOutResult(day, C, '2026-10-10', ist('2026-10-11', '06:20'));
  assert.equal(out.workedHours, 8.37);
  assert.equal(out.otHours, 0.37);
});

test('dayFromTimes: a corrected or supervisor-entered day gets the same numbers as live punches', () => {
  const full = dayFromTimes(A, '2026-10-10', { check_in: ist('2026-10-10', '06:30'), check_out: ist('2026-10-10', '16:00') });
  assert.deepEqual([full.status, full.late_min, full.worked_hours, full.ot_hours], ['late', 20, 9.5, 1.5]);
  const open = dayFromTimes(A, '2026-10-10', { check_in: ist('2026-10-10', '06:00') });
  assert.deepEqual([open.status, open.check_out, open.worked_hours], ['present', null, 0]);
  assert.equal(dayFromTimes(A, '2026-10-10', { status: 'absent' }).status, 'absent');
  assert.equal(dayFromTimes(A, '2026-10-10', { status: 'leave' }).check_in, null);
  assert.equal(dayFromTimes(A, '2026-10-10', { check_in: ist('2026-10-10', '06:00'), check_out: ist('2026-10-10', '14:00'), status: 'present' }).status, 'present');
});

// ---- register -------------------------------------------------------------------------------------------------------

test('monthDays covers the whole month', () => {
  assert.equal(monthDays('2026-10').length, 31);
  assert.equal(monthDays('2026-02').length, 28);
  assert.equal(monthDays('2028-02').length, 29);
  assert.equal(monthDays('2026-12').at(-1), '2026-12-31');
});

test('register: codes per day, OT marks, totals, and "worked" beats "absent" when two shifts disagree', () => {
  const workers = [{ id: 'w1', emp_code: 'E1', name: 'Anil' }, { id: 'w2', emp_code: 'E2', name: 'Sunita' }];
  const rows = [
    { worker_id: 'w1', date: '2026-10-01', status: 'present', ot_hours: '0.00' },
    { worker_id: 'w1', date: '2026-10-02', status: 'late', ot_hours: '1.50' },
    { worker_id: 'w1', date: '2026-10-03', status: 'half_day', ot_hours: 0 },
    { worker_id: 'w1', date: '2026-10-04', status: 'absent', ot_hours: 0 },
    { worker_id: 'w1', date: '2026-10-05', status: 'leave', ot_hours: 0 },
    { worker_id: 'w1', date: '2026-10-06', status: 'absent', ot_hours: 0 },
    { worker_id: 'w1', date: '2026-10-06', status: 'present', ot_hours: 0 },
  ];
  const { days, rows: out } = buildRegister('2026-10', workers, rows);
  assert.equal(days.length, 31);
  const [anil, sunita] = out;
  assert.deepEqual(['2026-10-01', '2026-10-02', '2026-10-03', '2026-10-04', '2026-10-05', '2026-10-06'].map((d) => anil.cells[d]), ['P', 'L+OT', 'H', 'A', 'V', 'P']);
  assert.equal(anil.cells['2026-10-07'], undefined);
  assert.deepEqual(anil.totals, { present: 2, late: 1, half_day: 1, absent: 1, leave: 1, ot_hours: 1.5, days_worked: 3.5 });
  assert.deepEqual(sunita.cells, {});
  assert.equal(sunita.totals.days_worked, 0);
});

// ---- wage rules -----------------------------------------------------------------------------------------------------

test('gross pay by wage type (backend plan §11.13)', () => {
  const totals = { days: 24.5, hours: 196, ot_hours: 6.5, pieces: 3200 };
  assert.equal(grossPay({ wage_type: 'daily', rate: 650, ot_rate: 120, piece_rate: 0 }, totals), 16705);                // 24.5 × 650 + 6.5 × 120
  assert.equal(grossPay({ wage_type: 'hourly', rate: 80, ot_rate: 120, piece_rate: 0 }, totals), 16460);                // 196 × 80 + 780
  assert.equal(grossPay({ wage_type: 'piece', rate: 0, ot_rate: 90, piece_rate: 0.85 }, totals), 3305);                 // 3200 × 0.85 + 6.5 × 90
  assert.equal(grossPay({ wage_type: 'daily', rate: 650, ot_rate: 120 }, { days: 0, hours: 0, ot_hours: 0, pieces: 0 }), 0);
  assert.equal(grossPay({ wage_type: 'daily', rate: '650.00', ot_rate: '121.88' }, { days: '10', hours: 0, ot_hours: '1.5', pieces: 0 }), 6682.82);   // pg numerics arrive as strings
});

test('advances come off oldest first, whole advances only, never more than the gross', () => {
  const open = [{ id: 'a1', amount: 2000 }, { id: 'a2', amount: 1500 }, { id: 'a3', amount: 3000 }];
  assert.deepEqual(recoverAdvances(open, 10000), { recovered: open, total: 6500 });
  assert.deepEqual(recoverAdvances(open, 4000), { recovered: [open[0], open[1]], total: 3500 });
  assert.deepEqual(recoverAdvances(open, 1000), { recovered: [], total: 0 });                                          // the first does not fit: nothing is taken
  assert.deepEqual(recoverAdvances([], 5000), { recovered: [], total: 0 });
  assert.equal(recoverAdvances([{ id: 'x', amount: '0.1' }, { id: 'y', amount: '0.2' }], 0.3).total, 0.3);            // no float drift at the boundary
});
