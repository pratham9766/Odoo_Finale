// /work-orders/:id/start · /resume · /pause · /logs · /finish (backend plan §10.7). All need production.log.
// Resume is start on a paused work order: same rules, same code, no material is issued twice.

import { Router } from 'express';
import { can } from '../../middleware/rbac.js';
import { validate } from '../../middleware/validate.js';
import { idParams } from '../../utils/crud/index.js';
import * as c from './workOrderActions.controller.js';
import * as s from './workOrderActions.schema.js';

const r = Router();
const act = [can('production.log')];

r.post('/:id/start', ...act, validate({ params: idParams }), c.start);
r.post('/:id/resume', ...act, validate({ params: idParams }), c.start);
r.post('/:id/pause', ...act, validate({ params: idParams, body: s.pauseSchema }), c.pause);
r.post('/:id/logs', ...act, validate({ params: idParams, body: s.logSchema }), c.log);
r.post('/:id/finish', ...act, validate({ params: idParams, body: s.finishSchema }), c.finish);
export default r;
