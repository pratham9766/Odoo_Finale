import { Router } from 'express';
import { can } from '../../middleware/rbac.js';
import { validate, idParam } from '../../middleware/validate.js';
import { send } from '../../utils/http.js';
import * as s from './inventory.service.js';
import { stockQuery, lotQuery, movementQuery, receiptSchema, receiptQuery, adjustmentSchema, adjustmentQuery } from './inventory.schema.js';

const r = Router();

r.get('/stock', can('stock.view'), validate({ query: stockQuery }), send((req) => s.listStock(req.ctx, req.valid.query)));
r.get('/stock/lots', can('stock.view'), validate({ query: lotQuery }), send((req) => s.listLots(req.ctx, req.valid.query)));
r.get('/stock/movements', can('stock.view'), validate({ query: movementQuery }), send((req) => s.listMovements(req.ctx, req.valid.query)));
r.get('/stock/finished', can('stock.view', 'dispatch.view'), send((req) => s.finishedStock(req.ctx)));

r.get('/stock/adjustments', can('stock.adjust', 'stock.adjust_approve'), validate({ query: adjustmentQuery }), send((req) => s.listAdjustments(req.ctx, req.valid.query)));
r.post('/stock/adjustments', can('stock.adjust'), validate({ body: adjustmentSchema }), send((req) => s.createAdjustment(req.ctx, req.valid.body), 201));
r.post('/stock/adjustments/:id/approve', can('stock.adjust_approve'), validate({ params: idParam }), send((req) => s.approveAdjustment(req.ctx, req.valid.params.id)));
r.post('/stock/adjustments/:id/reject', can('stock.adjust_approve'), validate({ params: idParam }), send((req) => s.rejectAdjustment(req.ctx, req.valid.params.id)));

r.get('/receipts', can('stock.view'), validate({ query: receiptQuery }), send((req) => s.listReceipts(req.ctx, req.valid.query)));
r.post('/receipts', can('receipt.create'), validate({ body: receiptSchema }), send((req) => s.createReceipt(req.ctx, req.valid.body), 201));
r.get('/receipts/:id', can('stock.view'), validate({ params: idParam }), send((req) => s.getReceipt(req.ctx, req.valid.params.id)));
r.post('/receipts/:id/post', can('receipt.create'), validate({ params: idParam }), send((req) => s.postReceipt(req.ctx, req.valid.params.id)));
r.post('/receipts/:id/cancel', can('receipt.create'), validate({ params: idParam }), send((req) => s.cancelReceipt(req.ctx, req.valid.params.id)));

export default r;
