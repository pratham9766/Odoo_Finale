import { Router } from 'express';
import { can } from '../../middleware/rbac.js';
import { validate, idParam } from '../../middleware/validate.js';
import { send } from '../../utils/http.js';
import * as s from './orders.service.js';
import { createOrderSchema, orderQuery, confirmSchema, cancelSchema } from './orders.schema.js';

const r = Router();

r.get('/orders', can('orders.view'), validate({ query: orderQuery }), send((req) => s.listOrders(req.ctx, req.valid.query)));
r.get('/orders/summary', can('orders.view'), send(() => s.orderSummary()));   // before /orders/:id
r.post('/orders', can('orders.create'), validate({ body: createOrderSchema }), send((req) => s.createOrder(req.ctx, req.valid.body), 201));
r.get('/orders/:id', can('orders.view'), validate({ params: idParam }), send((req) => s.getOrder(req.ctx, req.valid.params.id)));
r.get('/orders/:id/requirements', can('orders.view', 'bom.view'), validate({ params: idParam }), send((req) => s.requirements(req.ctx, req.valid.params.id)));
r.post('/orders/:id/confirm', can('orders.confirm'), validate({ params: idParam, body: confirmSchema }), send((req) => s.confirmOrder(req.ctx, req.valid.params.id, req.valid.body)));
r.post('/orders/:id/reserve', can('orders.confirm'), validate({ params: idParam }), send((req) => s.reserve(req.ctx, req.valid.params.id)));
r.post('/orders/:id/cancel', can('orders.cancel'), validate({ params: idParam, body: cancelSchema }), send((req) => s.cancelOrder(req.ctx, req.valid.params.id, req.valid.body)));
r.post('/orders/:id/tracking-link', can('orders.view'), validate({ params: idParam }), send((req) => s.trackingLink(req.ctx, req.valid.params.id)));
// POST /orders/:id/plan is added by the production module (production.plan)

export default r;
