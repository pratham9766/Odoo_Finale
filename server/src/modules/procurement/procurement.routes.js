// Routes for purchase orders.
import { Router } from 'express';
import { can } from '../../middleware/rbac.js';
import { validate, idParam } from '../../middleware/validate.js';
import { send } from '../../utils/http.js';
import * as s from './procurement.service.js';
import { poSchema, poQuery, respondSchema } from './procurement.schema.js';

const r = Router();

r.get('/purchase-orders', can('po.view'), validate({ query: poQuery }), send((req) => s.listPos(req.ctx, req.valid.query)));
r.post('/purchase-orders', can('po.create'), validate({ body: poSchema }), send((req) => s.createPo(req.ctx, req.valid.body), 201));
r.get('/purchase-orders/:id', can('po.view'), validate({ params: idParam }), send((req) => s.getPo(req.ctx, req.valid.params.id)));
r.post('/purchase-orders/:id/approve', can('po.approve'), validate({ params: idParam }), send((req) => s.approvePo(req.ctx, req.valid.params.id)));
r.post('/purchase-orders/:id/send', can('po.update'), validate({ params: idParam }), send((req) => s.sendPo(req.ctx, req.valid.params.id)));
// the mill records the supplier's answer
r.post('/purchase-orders/:id/respond', can('po.update'), validate({ params: idParam, body: respondSchema }),
  send((req) => s.respondPo(req.ctx, req.valid.params.id, req.valid.body)));
r.post('/purchase-orders/:id/cancel', can('po.delete'), validate({ params: idParam }), send((req) => s.cancelPo(req.ctx, req.valid.params.id)));

export default r;
