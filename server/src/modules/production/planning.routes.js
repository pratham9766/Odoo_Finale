// POST /orders/:id/plan (backend plan §10.6). Mounted under /orders, next to the orders module's own routes.

import { Router } from 'express';
import { can } from '../../middleware/rbac.js';
import { validate } from '../../middleware/validate.js';
import { idParams } from '../../utils/crud/index.js';
import { plan } from './planning.controller.js';

const r = Router();
r.post('/:id/plan', can('production.plan'), validate({ params: idParams }), plan);
export default r;
