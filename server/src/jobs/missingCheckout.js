// Missing check-outs (backend plan §11.12, §14): two hours after a shift ended, a day with a check-in but no check-out needs a correction.

import { shiftWindow } from '../utils/shifts.js';
import { addDays, istParts } from '../utils/time.js';
import { forEachActiveOrg } from './forEachActiveOrg.js';

const AFTER_END_MIN = 120;
const LOOK_BACK_DAYS = 3;

/** Flag the org's overdue open days. @returns {Promise<number>} how many were flagged */
export async function flagMissingCheckouts(db, orgId, now = new Date()) {
  const { rows } = await db.query(
    `select a.id, a.date, sh.start_time, sh.end_time
       from attendance a join shifts sh on sh.id = a.shift_id
      where a.org_id = $1 and a.check_in is not null and a.check_out is null and not a.needs_correction and a.date >= $2::date`,
    [orgId, addDays(istParts(now).date, -LOOK_BACK_DAYS)]);
  const overdue = rows.filter((a) => now >= new Date(shiftWindow(a, a.date).end.getTime() + AFTER_END_MIN * 60_000));
  if (overdue.length) await db.query(`update attendance set needs_correction = true where id = any($1::uuid[])`, [overdue.map((a) => a.id)]);
  return overdue.length;
}

async function run(now = new Date()) {
  const { ok } = await forEachActiveOrg('missingCheckout', (db, orgId) => flagMissingCheckouts(db, orgId, now));
  return ok.reduce((total, { result }) => total + result, 0);
}

export const missingCheckout = { name: 'missingCheckout', schedule: '*/30 * * * *', run };
