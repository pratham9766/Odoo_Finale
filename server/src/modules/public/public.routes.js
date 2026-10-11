// Routes that need no login: the buyer's order-tracking link, staff invite preview/accept, and the aggregate numbers on the login page.
import { Router } from 'express';
import { z } from 'zod';
import { withTx } from '../../db/tx.js';
import { notFound } from '../../utils/errors.js';
import { validate } from '../../middleware/validate.js';
import { publicLimiter, authLimiter } from '../../middleware/rateLimit.js';
import { send } from '../../utils/http.js';
import { millStats } from './millStats.js';
import { previewInvite, joinWithInvite } from '../auth/me.service.js';
import { tokenParam, joinInviteSchema } from '../auth/me.schema.js';

const r = Router();

// buyer tracking link: no auth, no prices, no internals (the SQL function decides what is exposed)
r.get('/track/:token', publicLimiter, validate({ params: z.object({ token: z.string().min(8).max(64) }) }),
  send(async (req) => {
    const data = await withTx(async (db) =>
      (await db.query('select public_track($1) as t', [req.valid.params.token])).rows[0].t);
    if (!data) throw notFound('Tracking link');
    return data;
  }));

// login-screen preview: aggregate counts only
r.get('/mill-stats', publicLimiter, send(() => millStats()));

// staff invite link: the person has no account yet, so these two need no login
r.get('/invites/:token', authLimiter, validate({ params: tokenParam }), send((req) => previewInvite(req.valid.params.token)));
r.post('/invites/:token/accept', authLimiter, validate({ params: tokenParam, body: joinInviteSchema }),
  send((req) => joinWithInvite(req.valid.params.token, req.valid.body), 201));

export default r;
