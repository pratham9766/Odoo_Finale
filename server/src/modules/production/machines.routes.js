// /machines: machine master (backend plan §10.7). Read: production.view; write: settings.manage.

import { Router } from 'express';
import { can } from '../../middleware/rbac.js';
import { crudHandlers, mountCrud } from '../../utils/crud/index.js';
import { machines } from './machines.service.js';
import * as s from './machines.schema.js';

const r = Router();
mountCrud(r, '/', {
  handlers: crudHandlers(machines),
  read: [can('production.view', 'settings.manage')],
  write: [can('settings.manage')],
  schemas: { list: s.listMachinesQuery, create: s.createMachineSchema, update: s.updateMachineSchema },
});
export default r;
