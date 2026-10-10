// /assignments (backend plan §10.7). Read: production.view; write: assignment.manage.

import { Router } from 'express';
import { can } from '../../middleware/rbac.js';
import { validate } from '../../middleware/validate.js';
import { crudHandlers, mountCrud } from '../../utils/crud/index.js';
import * as c from './assignments.controller.js';
import * as s from './assignments.schema.js';
import { assignments } from './assignments.service.js';

const r = Router();
const write = [can('assignment.manage')];

r.post('/', ...write, validate({ body: s.saveAssignmentsSchema }), c.save);
mountCrud(r, '/', {
  handlers: crudHandlers(assignments),
  only: ['list', 'get', 'update', 'remove'],
  read: [can('production.view', 'assignment.manage')],
  write,
  schemas: { list: s.listAssignmentsQuery, update: s.updateAssignmentSchema },
});
export default r;
