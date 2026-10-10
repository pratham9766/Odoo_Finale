// Entry point of the workforce module: Vipul mounts this one router at the tenant root.
// The public kiosk punch route (device-token auth, no tenant middleware) is kiosk.routes.js, mounted separately in app.js.

import { Router } from 'express';
import { requireModule } from '../../middleware/rbac.js';
import attendanceRoutes from './attendance.routes.js';
import kioskDevicesRoutes from './kioskDevices.routes.js';
import wagesRoutes from './wages.routes.js';
import workersRoutes from './workers.routes.js';

const r = Router();
// path-scoped on purpose: a bare r.use(requireModule(...)) would also block unrelated routes mounted after this router
r.use(['/workers', '/kiosk-devices', '/attendance', '/leave', '/wages'], requireModule('workforce'));
r.use('/workers', workersRoutes);
r.use('/kiosk-devices', kioskDevicesRoutes);
r.use(attendanceRoutes);
r.use(wagesRoutes);
export default r;
