import dayjs from 'dayjs';
import utc from 'dayjs/plugin/utc';
import timezone from 'dayjs/plugin/timezone';
import relativeTime from 'dayjs/plugin/relativeTime';
import customParseFormat from 'dayjs/plugin/customParseFormat';

// Configure dayjs plugins for correct Asia/Kolkata display
dayjs.extend(utc);
dayjs.extend(timezone);
dayjs.extend(relativeTime);
dayjs.extend(customParseFormat);

const TZ = 'Asia/Kolkata';

/** Format UTC timestamp for display in Asia/Kolkata */
export const formatDate = (d) => (d ? dayjs(d).tz(TZ).format('DD MMM YYYY') : '—');
export const formatTime = (d) => (d ? dayjs(d).tz(TZ).format('HH:mm') : '—');
export const formatDateTime = (d) => (d ? dayjs(d).tz(TZ).format('DD MMM YYYY, HH:mm') : '—');
export const formatDateShort = (d) => (d ? dayjs(d).tz(TZ).format('DD MMM') : '—');

/** Shift date: use shift-start-date semantics (night shift stays on start date) */
export const shiftDate = (d) => (d ? dayjs(d).tz(TZ).format('DD MMM YYYY') : '—');

export const timeAgo = (d) => (d ? dayjs(d).tz(TZ).fromNow() : '—');

// ─── Money formatting (Indian locale) ─────────────────────────────────────
const inrFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  maximumFractionDigits: 0,
});
const inrDecFormatter = new Intl.NumberFormat('en-IN', {
  style: 'currency',
  currency: 'INR',
  minimumFractionDigits: 2,
  maximumFractionDigits: 2,
});
const numFormatter = new Intl.NumberFormat('en-IN', { maximumFractionDigits: 2 });

export const formatINR = (v) => (v == null || !isFinite(Number(v)) ? '—' : inrFormatter.format(Number(v)));
export const formatINRDec = (v) => (v == null || !isFinite(Number(v)) ? '—' : inrDecFormatter.format(Number(v)));

// ─── Quantity formatting ───────────────────────────────────────────────────
export const formatQty = (v, uom) => {
  if (v == null || !isFinite(Number(v))) return '—';
  const n = numFormatter.format(Number(v));
  return uom ? `${n} ${uom}` : n;
};

export const formatPct = (v) => {
  if (v == null || !isFinite(Number(v))) return '—';
  return `${numFormatter.format(Number(v))}%`;
};

// ─── Normalize Postgres numeric strings ───────────────────────────────────
export const toNum = (v) => {
  const n = Number(v);
  return isFinite(n) ? n : null;
};

export { dayjs, TZ };
