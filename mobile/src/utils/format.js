// Same formatters as the web app (client/src/lib/format.js), plus a few small helpers for lists.
export const quantity = value => value == null ? '—' : new Intl.NumberFormat('en-IN', { maximumFractionDigits: 3 }).format(Number(value));
export const money = value => value == null ? '—' : new Intl.NumberFormat('en-IN', { style: 'currency', currency: 'INR' }).format(Number(value));
export function date(value) {
  if (!value) return '—';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? '—' : new Intl.DateTimeFormat('en-IN', { day: '2-digit', month: 'short', year: 'numeric', timeZone: 'Asia/Kolkata' }).format(parsed);
}
export function time(value) {
  if (!value) return '–';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? '–' : parsed.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit', timeZone: 'Asia/Kolkata' });
}
export function dateTime(value) {
  if (!value) return '—';
  const parsed = new Date(value);
  return Number.isNaN(parsed.getTime()) ? '—' : `${date(parsed)}, ${time(parsed)}`;
}

/** in_production → In production */
export const label = value => {
  const text = (value || '').replaceAll('_', ' ');
  return text.charAt(0).toUpperCase() + text.slice(1);
};

export const initials = name => (name || '?').split(/[\s@.]+/).filter(Boolean).slice(0, 2).map(p => p[0].toUpperCase()).join('');

/** 'Today' / 'Tomorrow' / 'In 3 days' / '2 days ago' for a deadline */
export function relativeDay(value) {
  if (!value) return '—';
  const target = new Date(value);
  if (Number.isNaN(target.getTime())) return '—';
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  target.setHours(0, 0, 0, 0);
  const days = Math.round((target - today) / 86400000);
  if (days === 0) return 'Today';
  if (days === 1) return 'Tomorrow';
  if (days === -1) return 'Yesterday';
  return days > 0 ? `In ${days} days` : `${Math.abs(days)} days ago`;
}

/** Today in India as YYYY-MM-DD (the server's business day). */
export const todayISO = () => new Intl.DateTimeFormat('en-CA', { timeZone: 'Asia/Kolkata' }).format(new Date());

/** ?a=1&b=2 from an object, skipping empty values */
export function qs(params = {}) {
  const u = new URLSearchParams();
  for (const [k, v] of Object.entries(params)) if (v !== undefined && v !== null && v !== '') u.set(k, v);
  const s = u.toString();
  return s ? `?${s}` : '';
}
