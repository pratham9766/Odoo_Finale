// /kiosk-devices (backend plan §10.2). settings.manage only. POST returns the plain device token once.

import { Router } from 'express';
import { can } from '../../middleware/rbac.js';
import { crudHandlers, mountCrud } from '../../utils/crud/index.js';
import * as s from './kiosk.schema.js';
import { kioskDevices } from './kioskDevices.service.js';

const r = Router();
const manage = can('settings.manage');
mountCrud(r, '/', {
  handlers: crudHandlers(kioskDevices),
  read: [manage],
  write: [manage],
  schemas: { create: s.createKioskDeviceSchema, update: s.updateKioskDeviceSchema },
});
export default r;
