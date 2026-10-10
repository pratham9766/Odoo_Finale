// Entry point of the gate module (backend plan §10.9): Vipul mounts this one router at the tenant root.
//   GET  /gate/entries?direction=&purpose=&inside=&q=&from=&to=   gate.view   the register; inside=true = vehicles in the premises now
//   POST /gate/entries                                            gate.log    log a vehicle in / out (a supplier's truck also gets its draft GRN)
//   GET  /gate/expected                                           gate.log    supplier dispatches on their way, with their lots

import { Router } from 'express';
import { can, requireModule } from '../../middleware/rbac.js';
import { validate } from '../../middleware/validate.js';
import * as c from './gate.controller.js';
import * as s from './gate.schema.js';

const r = Router();
r.use('/gate', requireModule('gate'));

r.get('/gate/entries', can('gate.view'), validate({ query: s.listEntriesQuery }), c.list);
r.post('/gate/entries', can('gate.log'), validate({ body: s.logEntrySchema }), c.log);
r.get('/gate/expected', can('gate.log'), c.expected);

export default r;
