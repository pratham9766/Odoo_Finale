// /workers. Read: attendance.view or workers.view (scope-filtered); create / update / delete: workers.create / update / delete.

import { Router } from 'express';
import { can } from '../../middleware/rbac.js';
import { validate } from '../../middleware/validate.js';
import { crudHandlers, idParams, mountCrud } from '../../utils/crud/index.js';
import { sendPdf } from '../../utils/pdf.js';
import * as s from './workers.schema.js';
import { workerBadgePdf, workers } from './workers.service.js';

const r = Router();

r.get('/:id/badge.pdf', can('workers.view', 'workers.create', 'workers.update'), validate({ params: idParams }), async (req, res) => {
  const { buffer, filename } = await workerBadgePdf(req.ctx, req.valid.params.id);
  sendPdf(res, buffer, filename);
});

mountCrud(r, '/', {
  handlers: crudHandlers(workers),
  read: [can('attendance.view', 'workers.view')],
  create: [can('workers.create')], update: [can('workers.update')], remove: [can('workers.delete')],
  schemas: { list: s.listWorkersQuery, create: s.createWorkerSchema, update: s.updateWorkerSchema },
});

export default r;
