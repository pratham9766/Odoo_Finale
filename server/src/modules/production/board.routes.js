// GET /production/board?stage_id=&mine=true (backend plan §10.7). production.view, scope-filtered.

import { Router } from 'express';
import { z } from 'zod';
import { can } from '../../middleware/rbac.js';
import { validate } from '../../middleware/validate.js';
import { boolQuery, uuid } from '../../utils/crud/index.js';
import { getBoard } from './board.service.js';

const query = z.object({ stage_id: uuid.optional(), mine: boolQuery.optional() });

const r = Router();
r.get('/board', can('production.view'), validate({ query }), async (req, res) => {
  const { stage_id: stageId, mine } = req.valid.query;
  res.json({ data: await getBoard(req.ctx, { stageId, mine }) });
});
export default r;
