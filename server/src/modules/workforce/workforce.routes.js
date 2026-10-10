// Entry point of the workforce module: workers, attendance and wages.

import { Router } from 'express';
import { requireModule } from '../../middleware/rbac.js';
import attendanceRoutes from './attendance.routes.js';
import wagesRoutes from './wages.routes.js';
import workersRoutes from './workers.routes.js';

const r = Router();
// path-scoped on purpose: a bare r.use(requireModule(...)) would also block unrelated routes mounted after this router
r.use(['/workers', '/attendance', '/wages'], requireModule('workforce'));
r.use('/workers', workersRoutes);
r.use(attendanceRoutes);
r.use(wagesRoutes);
export default r;
