// Times for attendance corrections. The mill works in Asia/Kolkata (UTC+05:30, no daylight saving), the same as the server
// (server/src/utils/time.js), so a typed "14:00" on a shift date means 14:00 at the mill, whatever the phone's own time zone is.

const IST_OFFSET_MIN = 330;

/** "6:05", "06:05", "0605" → { h, m }, or null when it is not a valid 24-hour time. */
export function parseHm(text) {
  const t = String(text ?? '').trim();
  const m = /^(\d{1,2})[:.]?(\d{2})$/.exec(t);
  if (!m) return null;
  const h = Number(m[1]); const min = Number(m[2]);
  return h <= 23 && min <= 59 ? { h, m: min } : null;
}

/** The instant (ISO, UTC) of `hm` on mill date `date` (YYYY-MM-DD), `dayOffset` days later (1 = the next morning of a night shift). */
export function millInstant(date, hm, dayOffset = 0) {
  const [y, mo, d] = date.split('-').map(Number);
  const utc = Date.UTC(y, mo - 1, d + dayOffset, hm.h, hm.m) - IST_OFFSET_MIN * 60_000;
  return new Date(utc).toISOString();
}

/** Hours and minutes between two instants, as "7 h 55 min". Empty when the order is wrong. */
export function describeDuration(fromIso, toIso) {
  const minutes = Math.round((new Date(toIso) - new Date(fromIso)) / 60_000);
  if (!Number.isFinite(minutes) || minutes <= 0) return '';
  return `${Math.floor(minutes / 60)} h ${String(minutes % 60).padStart(2, '0')} min`;
}

/** Wall-clock time at the mill, "06:05", for an ISO instant. */
export function millClock(iso) {
  if (!iso) return '–';
  const d = new Date(new Date(iso).getTime() + IST_OFFSET_MIN * 60_000);
  return `${String(d.getUTCHours()).padStart(2, '0')}:${String(d.getUTCMinutes()).padStart(2, '0')}`;
}

/**
 * Check the typed times before they are sent. Returns { error } or { checkIn?, checkOut, hours }.
 * The server checks again (order, not in the future, at most 20 hours); this only saves a round trip and explains the problem sooner.
 */
export function buildCorrection({ date, checkInText, checkOutText, nextDay, existingCheckIn }) {
  const out = parseHm(checkOutText);
  if (!out) return { error: { field: 'checkOut', text: 'Enter the check-out time as hours and minutes, for example 14:00.' } };
  let checkIn = existingCheckIn;
  let newIn;
  if (checkInText?.trim()) {
    const inn = parseHm(checkInText);
    if (!inn) return { error: { field: 'checkIn', text: 'Enter the check-in time as hours and minutes, for example 06:00.' } };
    checkIn = newIn = millInstant(date, inn, 0);
  }
  if (!checkIn) return { error: { field: 'checkIn', text: 'This record has no check-in time. Enter it.' } };
  const checkOut = millInstant(date, out, nextDay ? 1 : 0);
  if (new Date(checkOut) <= new Date(checkIn)) return { error: { field: 'checkOut', text: 'Check-out must be after check-in. For a night shift that ends the next morning, choose "Next day".' } };
  if (new Date(checkOut) - new Date(checkIn) > 20 * 3_600_000) return { error: { field: 'checkOut', text: 'That is more than 20 hours after check-in. Check the time and the day.' } };
  if (new Date(checkOut) > new Date(Date.now() + 5 * 60_000)) return { error: { field: 'checkOut', text: 'Check-out cannot be in the future.' } };
  return { checkIn: newIn, checkOut, hours: describeDuration(checkIn, checkOut) };
}
