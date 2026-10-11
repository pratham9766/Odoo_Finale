import { test } from 'node:test';
import assert from 'node:assert/strict';
import { buildCorrection, describeDuration, millClock, millInstant, parseHm } from './attendanceTime.js';

test('typed times are understood in several common forms, and bad ones are refused', () => {
  assert.deepEqual(parseHm('06:05'), { h: 6, m: 5 });
  assert.deepEqual(parseHm('6:05'), { h: 6, m: 5 });
  assert.deepEqual(parseHm('0605'), { h: 6, m: 5 });
  assert.deepEqual(parseHm('14.00'), { h: 14, m: 0 });
  for (const bad of ['', '25:00', '12:60', 'abc', '1', '12:5', null]) assert.equal(parseHm(bad), null, String(bad));
});

test('a time on a shift date is a mill (IST) instant, whatever the phone time zone is', () => {
  assert.equal(millInstant('2026-09-15', { h: 6, m: 0 }), '2026-09-15T00:30:00.000Z');
  assert.equal(millInstant('2026-09-15', { h: 14, m: 0 }), '2026-09-15T08:30:00.000Z');
  assert.equal(millInstant('2026-09-15', { h: 6, m: 0 }, 1), '2026-09-16T00:30:00.000Z', 'next morning');
  assert.equal(millClock('2026-09-15T00:35:00.000Z'), '06:05');
  assert.equal(millClock(null), '–');
});

test('durations are shown in hours and minutes, and an impossible order gives nothing', () => {
  assert.equal(describeDuration('2026-09-15T00:35:00Z', '2026-09-15T08:30:00Z'), '7 h 55 min');
  assert.equal(describeDuration('2026-09-15T08:30:00Z', '2026-09-15T00:35:00Z'), '');
});

test('a correction is validated: order, night shift, length, missing check-in', () => {
  const date = '2026-09-15';
  const existingCheckIn = '2026-09-15T00:35:00.000Z';                      // 06:05 at the mill
  const ok = buildCorrection({ date, checkOutText: '14:00', existingCheckIn });
  assert.equal(ok.error, undefined);
  assert.equal(ok.checkOut, '2026-09-15T08:30:00.000Z');
  assert.equal(ok.hours, '7 h 55 min');
  assert.equal(ok.checkIn, undefined, 'check-in is left alone unless it was typed');

  assert.equal(buildCorrection({ date, checkOutText: '05:00', existingCheckIn }).error.field, 'checkOut');          // before check-in
  assert.equal(buildCorrection({ date, checkOutText: '25:00', existingCheckIn }).error.field, 'checkOut');          // not a time
  assert.equal(buildCorrection({ date, checkOutText: '14:00' }).error.field, 'checkIn');                              // no check-in at all
  assert.equal(buildCorrection({ date, checkOutText: '14:00', checkInText: 'x', existingCheckIn }).error.field, 'checkIn');

  // a night shift 22:00 → 06:00 the next morning needs "Next day"
  const nightIn = millInstant(date, { h: 22, m: 0 });
  assert.ok(buildCorrection({ date, checkOutText: '06:00', existingCheckIn: nightIn }).error, 'same day 06:00 is before 22:00');
  const night = buildCorrection({ date, checkOutText: '06:00', nextDay: true, existingCheckIn: nightIn });
  assert.equal(night.hours, '8 h 00 min');

  // a typed check-in replaces the stored one
  const retimed = buildCorrection({ date, checkInText: '06:00', checkOutText: '14:00', existingCheckIn });
  assert.equal(retimed.checkIn, '2026-09-15T00:30:00.000Z');
  assert.equal(retimed.hours, '8 h 00 min');

  assert.match(buildCorrection({ date, checkOutText: '23:00', nextDay: true, existingCheckIn: '2026-09-15T00:30:00.000Z' }).error.text, /20 hours/);
});
