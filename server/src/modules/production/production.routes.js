// Entry point of the production module: Vipul mounts this one router at the tenant root.

import { Router } from 'express';
import { requireModule } from '../../middleware/rbac.js';
import assignmentsRoutes from './assignments.routes.js';
import boardRoutes from './board.routes.js';
import machinesRoutes from './machines.routes.js';
import planningRoutes from './planning.routes.js';
import workOrderActionsRoutes from './workOrderActions.routes.js';
import workOrdersRoutes from './workOrders.routes.js';

const r = Router();
// path-scoped on purpose: a bare r.use(requireModule(...)) would also block unrelated routes mounted after this router
r.use(['/machines', '/work-orders', '/assignments', '/production', '/orders/:id/plan'], requireModule('production'));
r.use('/machines', machinesRoutes);
r.use('/work-orders', workOrdersRoutes);
r.use('/work-orders', workOrderActionsRoutes);
r.use('/assignments', assignmentsRoutes);
r.use('/production', boardRoutes);
r.use('/orders', planningRoutes);
export default r;
