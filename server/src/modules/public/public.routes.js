import { Router } from 'express';
import { z } from 'zod';
import { withTx } from '../../db/tx.js';
import { notFound } from '../../utils/errors.js';
import { validate } from '../../middleware/validate.js';
import { publicLimiter } from '../../middleware/rateLimit.js';
import { send } from '../../utils/http.js';

const r = Router();

// buyer tracking link: no auth, no prices, no internals (the SQL function decides what is exposed)
r.get('/track/:token', publicLimiter, validate({ params: z.object({ token: z.string().min(8).max(64) }) }),
  send(async (req) => {
    const data = await withTx(async (db) =>
      (await db.query('select public_track($1) as t', [req.valid.params.token])).rows[0].t);
    if (!data) throw notFound('Tracking link');
    return data;
  }));

export default r;
