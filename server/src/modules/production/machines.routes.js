// /machines: machine master (backend plan §10.7). Read: production.view or machines.view; create / update / delete: machines.create / update / delete.

import { Router } from 'express';
import { can } from '../../middleware/rbac.js';
import { crudHandlers, mountCrud } from '../../utils/crud/index.js';
import { machines } from './machines.service.js';
import * as s from './machines.schema.js';

const r = Router();
mountCrud(r, '/', {
  handlers: crudHandlers(machines),
  read: [can('production.view', 'machines.view')],
  create: [can('machines.create')], update: [can('machines.update')], remove: [can('machines.delete')],
  schemas: { list: s.listMachinesQuery, create: s.createMachineSchema, update: s.updateMachineSchema },
});
export default r;
