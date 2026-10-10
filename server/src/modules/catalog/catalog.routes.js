import { Router } from 'express';
import { can } from '../../middleware/rbac.js';
import { validate, idParam } from '../../middleware/validate.js';
import { send } from '../../utils/http.js';
import * as items from './items.service.js';
import * as bom from './bom.service.js';
import { itemSchema, itemUpdateSchema, itemQuery, bomSchema, bomUpdateSchema, bomQuery, explodeQuery, convertSchema } from './catalog.schema.js';

const r = Router();

r.get('/items', can('items.view'), validate({ query: itemQuery }), send((req) => items.listItems(req.ctx, req.valid.query)));
r.post('/items', can('items.create'), validate({ body: itemSchema }), send((req) => items.createItem(req.ctx, req.valid.body), 201));
r.get('/items/:id', can('items.view'), validate({ params: idParam }), send((req) => items.getItem(req.ctx, req.valid.params.id)));
r.put('/items/:id', can('items.update'), validate({ params: idParam, body: itemUpdateSchema }), send((req) => items.updateItem(req.ctx, req.valid.params.id, req.valid.body)));
r.delete('/items/:id', can('items.delete'), validate({ params: idParam }), send((req) => items.deactivateItem(req.ctx, req.valid.params.id)));

r.get('/boms', can('bom.view'), validate({ query: bomQuery }), send((req) => bom.listBoms(req.ctx, req.valid.query)));
r.post('/boms', can('bom.create'), validate({ body: bomSchema }), send((req) => bom.createBom(req.ctx, req.valid.body), 201));
r.get('/boms/:id', can('bom.view'), validate({ params: idParam }), send((req) => bom.getBom(req.ctx, req.valid.params.id)));
r.put('/boms/:id', can('bom.update'), validate({ params: idParam, body: bomUpdateSchema }), send((req) => bom.updateBom(req.ctx, req.valid.params.id, req.valid.body)));
r.delete('/boms/:id', can('bom.delete'), validate({ params: idParam }), send((req) => bom.deleteBom(req.ctx, req.valid.params.id)));

r.get('/bom/explode', can('bom.view'), validate({ query: explodeQuery }), send((req) => bom.explodeRequest(req.ctx, req.valid.query)));
r.post('/bom/convert', can('bom.view'), validate({ body: convertSchema }), send((req) => bom.convert(req.valid.body)));

export default r;
