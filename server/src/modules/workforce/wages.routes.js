// Wage runs, advances and payslips (backend plan §10.10). Wages are confidential (🔒). Absolute paths, like attendance.routes.js.
//   GET/POST /wages/runs, GET /wages/runs/:id      wages.view / wages.run
//   POST /wages/runs/:id/approve | /pay            wages.pay   (the approver is not the preparer when somebody else can approve)
//   GET/POST /wages/advances                       wages.view / wages.run
//   GET /wages/payslips/:workerId?month=&format=   wages.view, or the worker's own payslip (checked in the service)

import { Router } from 'express';
import { can } from '../../middleware/rbac.js';
import { validate } from '../../middleware/validate.js';
import { idParams } from '../../utils/crud/index.js';
import * as c from './wages.controller.js';
import * as s from './wages.schema.js';

const r = Router();

r.get('/wages/runs', can('wages.view'), c.listRuns);
r.post('/wages/runs', can('wages.run'), validate({ body: s.prepareRunSchema }), c.prepare);
r.get('/wages/runs/:id', can('wages.view'), validate({ params: idParams }), c.getRun);
r.post('/wages/runs/:id/approve', can('wages.pay'), validate({ params: idParams }), c.approve);
r.post('/wages/runs/:id/pay', can('wages.pay'), validate({ params: idParams }), c.pay);

r.get('/wages/advances', can('wages.view', 'wages.run'), validate({ query: s.listAdvancesQuery }), c.advances.list);
r.post('/wages/advances', can('wages.run'), validate({ body: s.advanceSchema }), c.advances.create);

r.get('/wages/payslips/:workerId', validate({ params: s.payslipParams, query: s.payslipQuery }), c.payslip);

export default r;
