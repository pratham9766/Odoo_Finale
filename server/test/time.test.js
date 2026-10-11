// Unit tests for the India-time helpers.
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { TZ, formatDate, formatMonth, todayIST } from '../src/utils/time.js';

test('the business time zone is Asia/Kolkata', () => assert.equal(TZ, 'Asia/Kolkata'));

test('todayIST is the date in India, not in UTC', () => {
  assert.equal(todayIST(new Date('2026-10-10T20:00:00Z')), '2026-10-11');   // 01:30 on the 11th in IST
  assert.equal(todayIST(new Date('2026-10-10T10:00:00Z')), '2026-10-10');
  assert.equal(todayIST(new Date('2026-12-31T18:29:59Z')), '2026-12-31');
  assert.equal(todayIST(new Date('2026-12-31T18:30:00Z')), '2027-01-01');   // IST midnight
});

test('formatDate / formatMonth read in IST and tolerate empty values', () => {
  assert.equal(formatDate('2026-10-10T20:00:00Z'), '11 Oct 2026');
  assert.equal(formatMonth('2026-09-01'), 'September 2026');
  assert.equal(formatDate(null), '');
  assert.equal(formatMonth(undefined), '');
});
