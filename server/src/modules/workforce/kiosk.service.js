// The gate kiosk (backend plan §11.12): a tablet with a device token scans a worker's badge. No user login, no tenant middleware:
// the token resolves the org (resolve_kiosk_device), and everything after runs as a system user of that org.

import { pool } from '../../db/pool.js';
import { withSystem } from '../../db/withTenant.js';
import { assertOrgPath } from '../../utils/crud/index.js';
import { AppError } from '../../utils/errors.js';
import { sha256Hex } from '../../utils/tokens.js';
import { announcePunch, punch } from './attendance.service.js';

/** The org and device behind a device token (only its sha256 is stored). */
async function resolveDevice(token) {
  const { rows: [device] } = await pool.query(`select * from resolve_kiosk_device($1)`, [sha256Hex(token)]);
  if (!device) throw new AppError(401, 'INVALID_TOKEN', 'This device is not registered');
  return device;
}

/**
 * Punch a worker in or out from the badge QR. A second scan within a minute is ignored (`duplicate: true`).
 * @returns {{ name, emp_code, type: 'in'|'out', time, shift, late_min?, worked_hours?, ot_hours?, duplicate: boolean }}
 */
export async function kioskPunch(deviceToken, { qr_token: qrToken, photo_path: photoPath }, { at = new Date() } = {}) {
  const device = await resolveDevice(deviceToken);
  const orgId = device.org_id;
  assertOrgPath({ orgId }, photoPath, 'photo_path');

  const { worker, result } = await withSystem(orgId, async (db) => {
    const { rows: [org] } = await db.query(`select settings from organizations where id = $1`, [orgId]);
    if (org.settings?.modules?.workforce === false) throw new AppError(403, 'MODULE_DISABLED', 'Attendance is switched off for this organization');

    const { rows: [worker] } = await db.query(
      `select id, name, emp_code, default_shift_id from workers where org_id = $1 and qr_token = $2 and active`, [orgId, qrToken]);
    if (!worker) throw new AppError(404, 'NOT_FOUND', 'Card not recognised');
    const result = await punch(db, { orgId, worker, at, method: 'kiosk', deviceId: device.device_id, photoPath: photoPath ?? null });
    await db.query(`update kiosk_devices set last_seen_at = $2 where id = $1`, [device.device_id, at]);
    return { worker, result };
  });

  if (!result.duplicate) await announcePunch(orgId, worker.id, result.type);
  return {
    name: worker.name, emp_code: worker.emp_code, org: device.org_name, type: result.type, time: result.at, shift: result.shift,
    late_min: result.lateMin ?? null, worked_hours: result.workedHours ?? null, ot_hours: result.otHours ?? null, duplicate: Boolean(result.duplicate),
  };
}
