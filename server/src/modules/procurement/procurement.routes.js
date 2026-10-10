import { Router } from 'express';
import { can } from '../../middleware/rbac.js';
import { validate, idParam } from '../../middleware/validate.js';
import { send } from '../../utils/http.js';
import * as s from './procurement.service.js';
import { poSchema, poQuery, respondSchema, dispatchPoSchema } from './procurement.schema.js';

const r = Router();

r.get('/purchase-orders', can('po.view'), validate({ query: poQuery }), send((req) => s.listPos(req.ctx, req.valid.query)));
r.post('/purchase-orders', can('po.create'), validate({ body: poSchema }), send((req) => s.createPo(req.ctx, req.valid.body), 201));
r.get('/purchase-orders/:id', can('po.view'), validate({ params: idParam }), send((req) => s.getPo(req.ctx, req.valid.params.id)));
r.post('/purchase-orders/:id/approve', can('po.approve'), validate({ params: idParam }), send((req) => s.approvePo(req.ctx, req.valid.params.id)));
r.post('/purchase-orders/:id/send', can('po.create'), validate({ params: idParam }), send((req) => s.sendPo(req.ctx, req.valid.params.id)));
// supplier answers; the mill may also record the answer of an offline supplier (service checks which)
r.post('/purchase-orders/:id/respond', can('po.respond', 'po.create'), validate({ params: idParam, body: respondSchema }),
  send((req) => s.respondPo(req.ctx, req.valid.params.id, req.valid.body)));
r.post('/purchase-orders/:id/dispatch', can('dispatch.create'), validate({ params: idParam, body: dispatchPoSchema }), send((req) => s.dispatchPo(req.ctx, req.valid.params.id, req.valid.body), 201));
r.post('/purchase-orders/:id/cancel', can('po.create'), validate({ params: idParam }), send((req) => s.cancelPo(req.ctx, req.valid.params.id)));

export default r;
