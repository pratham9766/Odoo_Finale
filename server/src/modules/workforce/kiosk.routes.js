// POST /kiosk/punch (backend plan §10.10). Public router: Vipul mounts it in app.js at /api/v1/kiosk BEFORE the auth and
// tenant middleware, with the kiosk rate limit in front. The device token in `x-device-token` is the only credential.

import { Router } from 'express';
import { z } from 'zod';
import { validate } from '../../middleware/validate.js';
import { optionalText } from '../../utils/crud/index.js';
import { AppError } from '../../utils/errors.js';
import { kioskPunch } from './kiosk.service.js';

const punchSchema = z.object({ qr_token: z.string().trim().min(8).max(64), photo_path: optionalText(300) });

const r = Router();
r.post('/punch', validate({ body: punchSchema }), async (req, res) => {
  const token = req.get('x-device-token');
  if (!token) throw new AppError(401, 'UNAUTHENTICATED', 'Missing device token');
  res.json({ data: await kioskPunch(token, req.valid.body) });
});
export default r;
