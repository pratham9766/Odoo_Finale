// Entry point of the quality module (backend plan §10.8): Vipul mounts this one router at the tenant root.
//   POST /rolls                       production.log      create a roll from the final-stage work order
//   GET  /rolls/:rollNo[/trace]       qc.view (roll also production.view)
//   GET  /rolls/:rollNo/label.pdf     production.log
//   GET  /qc/queue?status=            qc.view
//   POST /qc/inspections              qc.inspect
//   POST /qc/inspections/:id/override qc.override
//   GET  /qc/summary, /qc/defects     qc.view

import { Router } from 'express';
import { can, requireModule } from '../../middleware/rbac.js';
import { validate } from '../../middleware/validate.js';
import { idParams } from '../../utils/crud/index.js';
import * as c from './quality.controller.js';
import * as s from './quality.schema.js';

const r = Router();
r.use(['/rolls', '/qc'], requireModule('quality'));

r.post('/rolls', can('production.log'), validate({ body: s.createRollSchema }), c.create);
r.get('/rolls/:rollNo', can('qc.view', 'production.view'), validate({ params: s.rollNoParams }), c.getRoll);
r.get('/rolls/:rollNo/trace', can('qc.view'), validate({ params: s.rollNoParams }), c.trace);
r.get('/rolls/:rollNo/label.pdf', can('production.log'), validate({ params: s.rollNoParams }), c.label);

r.get('/qc/queue', can('qc.view'), validate({ query: s.queueQuery }), c.queue);
r.post('/qc/inspections', can('qc.inspect'), validate({ body: s.inspectionSchema }), c.inspect);
r.post('/qc/inspections/:id/override', can('qc.override'), validate({ params: idParams, body: s.overrideSchema }), c.override);
r.get('/qc/summary', can('qc.view'), validate({ query: s.summaryQuery }), c.summary);
r.get('/qc/defects', can('qc.view'), validate({ query: s.defectsQuery }), c.defects);

export default r;
