// /workers. Read: attendance.view (scope-filtered); write: workers.manage.

import { Router } from 'express';
import { can } from '../../middleware/rbac.js';
import { crudHandlers, mountCrud } from '../../utils/crud/index.js';
import * as s from './workers.schema.js';
import { workers } from './workers.service.js';

const r = Router();
const manage = can('workers.manage');

mountCrud(r, '/', {
  handlers: crudHandlers(workers),
  read: [can('attendance.view', 'workers.manage')],
  write: [manage],
  schemas: { list: s.listWorkersQuery, create: s.createWorkerSchema, update: s.updateWorkerSchema },
});

export default r;
