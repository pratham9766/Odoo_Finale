// Entry point of the maintenance module (backend plan §10.7): Vipul mounts this router at the tenant root.
//   POST /machines/:id/breakdown              breakdown.report
//   GET  /maintenance/tickets[/:id]           breakdown.report or maintenance.fix
//   POST /maintenance/tickets/:id/start|resolve   maintenance.fix or breakdown.close

import { Router } from 'express';
import { can, requireModule } from '../../middleware/rbac.js';
import { validate } from '../../middleware/validate.js';
import { idParams } from '../../utils/crud/index.js';
import * as c from './maintenance.controller.js';
import * as s from './maintenance.schema.js';

const r = Router();
r.use(['/maintenance', '/machines/:id/breakdown'], requireModule('maintenance'));

r.post('/machines/:id/breakdown', can('breakdown.report'), validate({ params: idParams, body: s.breakdownSchema }), c.breakdown);

const read = can('breakdown.report', 'maintenance.fix');
const work = can('maintenance.fix', 'breakdown.close');
r.get('/maintenance/tickets', read, validate({ query: s.listTicketsQuery }), c.list);
r.get('/maintenance/tickets/:id', read, validate({ params: idParams }), c.get);
r.post('/maintenance/tickets/:id/start', work, validate({ params: idParams }), c.start);
r.post('/maintenance/tickets/:id/resolve', work, validate({ params: idParams, body: s.resolveSchema }), c.resolve);

export default r;
