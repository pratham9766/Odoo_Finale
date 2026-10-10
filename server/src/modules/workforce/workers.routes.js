// /workers (backend plan §10.10). Read: attendance.view (scope-filtered); write and badge: workers.manage.

import { Router } from 'express';
import { can } from '../../middleware/rbac.js';
import { validate } from '../../middleware/validate.js';
import { crudHandlers, idParams, mountCrud } from '../../utils/crud/index.js';
import * as c from './workers.controller.js';
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
r.get('/:id/badge.pdf', manage, validate({ params: idParams }), c.badge);

export default r;
