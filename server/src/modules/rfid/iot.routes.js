// Physical scanners (ESP32 + RC522). No user session: the device proves itself with the X-Device-Key header.
//   POST /api/v1/iot/rfid-scan   { cardUid, deviceId, eventId? }   → 200 { data: scan result } for every processed scan
//   400 malformed body / UID, 401 unknown device or wrong key, 403 device switched off, 429 too many requests
// The mill is the only organisation, so it follows from the device; nothing in the body can choose it.

import { Router } from 'express';
import rateLimit from 'express-rate-limit';
import { withTx } from '../../db/tx.js';
import { z } from 'zod';
import { AppError } from '../../utils/errors.js';
import { deviceKeyMatches } from './rfid.rules.js';
import { iotScanSchema } from './rfid.schema.js';
import { hardwareScan } from './rfid.service.js';

const r = Router();

const deviceLimiter = rateLimit({
  windowMs: 60 * 1000,
  limit: 120,
  standardHeaders: 'draft-8',
  legacyHeaders: false,
  message: { error: { code: 'RATE_LIMITED', message: 'Too many scans from this address' } },
});

/** A malformed body or UID is a 400 for devices (the staff API uses 422 for form validation). */
function validateScan(req, _res, next) {
  const parsed = iotScanSchema.safeParse(req.body ?? {});
  if (!parsed.success) return next(new AppError(400, 'BAD_REQUEST', 'Invalid scan request', z.flattenError(parsed.error)));
  req.valid = { body: parsed.data };
  next();
}

/** The scanner must be registered, a hardware device, active, and send its own key. One generic answer for every failure. */
async function deviceAuth(req, _res, next) {
  try {
    const key = req.get('x-device-key');
    const { rows: [device] } = await withTx((db) =>
      db.query(`select id, code, key_hash, active from rfid_devices where code = $1 and kind = 'hardware'`, [req.valid.body.deviceId]));
    if (!device || !deviceKeyMatches(key, device.key_hash)) {
      return next(new AppError(401, 'DEVICE_UNAUTHORIZED', 'Unknown scanner or wrong device key'));
    }
    if (!device.active) return next(new AppError(403, 'DEVICE_DISABLED', 'This scanner has been deactivated'));
    req.device = { id: device.id, code: device.code };
    next();
  } catch (err) {
    next(err);
  }
}

r.post('/rfid-scan', deviceLimiter, validateScan, deviceAuth, async (req, res) => {
  const { cardUid, eventId } = req.valid.body;
  res.json({ data: await hardwareScan(req.device, { cardUid, eventId }) });
});

export default r;
