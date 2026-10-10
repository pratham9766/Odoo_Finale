// The one place that knows the business time zone. Timestamps are stored in UTC; people see Asia/Kolkata (backend plan §1).
// India has no daylight saving, so a fixed +05:30 offset is exact and keeps all of this plain arithmetic.

import { AppError } from './errors.js';

export const TZ = 'Asia/Kolkata';
const IST_OFFSET_MIN = 330;
const MINUTE = 60_000;

const dateFormat = new Intl.DateTimeFormat('en-IN', { timeZone: TZ, day: '2-digit', month: 'short', year: 'numeric' });
const monthFormat = new Intl.DateTimeFormat('en-IN', { timeZone: TZ, month: 'long', year: 'numeric' });

/** "10 Oct 2026". */
export const formatDate = (value) => (value ? dateFormat.format(new Date(value)) : '');

/** "October 2026". */
export const formatMonth = (value) => (value ? monthFormat.format(new Date(value)) : '');

/** `{ date: 'YYYY-MM-DD', minutes }`: the calendar date in India and the minutes since local midnight, for a moment. */
export function istParts(at = new Date()) {
  const local = new Date(at.getTime() + IST_OFFSET_MIN * MINUTE);
  return { date: local.toISOString().slice(0, 10), minutes: local.getUTCHours() * 60 + local.getUTCMinutes() };
}

/** Today's date in the business time zone as YYYY-MM-DD (what a `date` column and a date picker use). */
export const todayIST = (now = new Date()) => istParts(now).date;

/** The moment it is `minutes` after local midnight on `date`. `minutes` may pass 1440 (the next day). */
export const atIST = (date, minutes = 0) => new Date(Date.parse(`${date}T00:00:00Z`) + (minutes - IST_OFFSET_MIN) * MINUTE);

/** 'YYYY-MM-DD' plus (or minus) whole days. */
export const addDays = (date, days) => new Date(Date.parse(`${date}T00:00:00Z`) + days * 86_400_000).toISOString().slice(0, 10);

/** Whole minutes from `from` to `to` (negative when `to` is earlier). */
export const minutesBetween = (from, to) => Math.round((new Date(to) - new Date(from)) / MINUTE);

/** First day of the month containing `date` ('2026-10-17' → '2026-10-01'). */
export const monthStart = (date) => `${date.slice(0, 7)}-01`;

/** First day of the next month ('2026-10-17' → '2026-11-01'), the exclusive end of a month range. */
export function nextMonthStart(date) {
  const [year, month] = date.split('-').map(Number);
  return month === 12 ? `${year + 1}-01-01` : `${year}-${String(month + 1).padStart(2, '0')}-01`;
}

/** Date range for a report: what the caller sent, else the last `days` days up to today (both ends inclusive). */
export function reportRange({ from, to } = {}, days = 30, now = new Date()) {
  if (from && to && from > to) throw new AppError(422, 'VALIDATION_FAILED', 'The start date is after the end date');
  const end = to ?? todayIST(now);
  return { from: from ?? addDays(end, -(days - 1)), to: end };
}

/** Whole days from one YYYY-MM-DD to another (negative when `to` is earlier): days overdue = daysBetween(due_date, today). */
export const daysBetween = (from, to) => Math.round((Date.parse(`${to}T00:00:00Z`) - Date.parse(`${from}T00:00:00Z`)) / 86_400_000);

/** The current month in the business time zone, YYYY-MM (the default of month reports). */
export const currentMonth = (now = new Date()) => todayIST(now).slice(0, 7);
