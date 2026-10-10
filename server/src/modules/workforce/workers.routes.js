// /workers. Read: attendance.view or workers.view (scope-filtered); create / update / delete: workers.create / update / delete.

import { Router } from 'express';
import { can } from '../../middleware/rbac.js';
import { crudHandlers, mountCrud } from '../../utils/crud/index.js';
import * as s from './workers.schema.js';
import { workers } from './workers.service.js';

const r = Router();

mountCrud(r, '/', {
  handlers: crudHandlers(workers),
  read: [can('attendance.view', 'workers.view')],
  create: [can('workers.create')], update: [can('workers.update')], remove: [can('workers.delete')],
  schemas: { list: s.listWorkersQuery, create: s.createWorkerSchema, update: s.updateWorkerSchema },
});

export default r;
