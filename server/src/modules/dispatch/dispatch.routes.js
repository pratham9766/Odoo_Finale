// Entry point of the dispatch module (backend plan §10.9): Vipul mounts this one router at the tenant root.
//   GET/POST /dispatches                       dispatch.view / dispatch.create
//   GET /dispatches/:id[/packing-list.pdf]     dispatch.view
//   POST /dispatches/:id/scan                  dispatch.create     { code } | { roll_no } | { qr_token }
//   DELETE /dispatches/:id/rolls/:rollId       dispatch.create     only while packing
//   POST /dispatches/:id/confirm | /status     dispatch.confirm    confirm & invoice; mill-managed status (no transporter org)
//   POST /dispatches/:id/receive               receipt.create      the buyer side

import { Router } from 'express';
import { can, requireModule } from '../../middleware/rbac.js';
import { validate } from '../../middleware/validate.js';
import { idParams } from '../../utils/crud/index.js';
import * as c from './dispatch.controller.js';
import * as s from './dispatch.schema.js';

const r = Router();
r.use('/dispatches', requireModule('dispatch'));

const view = can('dispatch.view');
const create = can('dispatch.create');
const confirm = can('dispatch.confirm');

r.get('/dispatches', view, validate({ query: s.listDispatchesQuery }), c.list);
r.post('/dispatches', create, validate({ body: s.createDispatchSchema }), c.create);
r.get('/dispatches/:id', view, validate({ params: idParams }), c.get);
r.get('/dispatches/:id/packing-list.pdf', view, validate({ params: idParams }), c.packingList);
r.post('/dispatches/:id/scan', create, validate({ params: idParams, body: s.scanSchema }), c.scan);
r.delete('/dispatches/:id/rolls/:rollId', create, validate({ params: s.rollParams }), c.removeRoll);
r.post('/dispatches/:id/confirm', confirm, validate({ params: idParams }), c.confirm);
r.post('/dispatches/:id/status', confirm, validate({ params: idParams, body: s.statusSchema }), c.status);
r.post('/dispatches/:id/receive', can('receipt.create'), validate({ params: idParams, body: s.receiveSchema }), c.receive);

export default r;
