// /work-orders (backend plan §10.7): list, open, and schedule (machine, planned start). Read: production.view; schedule: production.plan.

import { Router } from 'express';
import { can } from '../../middleware/rbac.js';
import { crudHandlers, mountCrud } from '../../utils/crud/index.js';
import * as s from './workOrders.schema.js';
import { workOrders } from './workOrders.service.js';

const r = Router();
mountCrud(r, '/', {
  handlers: crudHandlers(workOrders),
  only: ['list', 'get', 'update'],
  read: [can('production.view', 'production.plan')],
  write: [can('production.plan')],
  schemas: { list: s.listWorkOrdersQuery, update: s.updateWorkOrderSchema },
});
export default r;
