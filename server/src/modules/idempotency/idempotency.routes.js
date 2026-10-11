// Recovery for a write whose response was lost. Only the caller's own keys are visible.
//   GET /idempotency/:operation/:key   → { data: { found: false } } | { data: { found: true, response } }
// `found: true` means the entry was committed, with exactly the response the first request would have returned: show it as done.
// `found: false` means nothing was committed under that key (so far): retry with the SAME key. Retrying is always safe;
// a retry of a committed entry returns the stored response instead of repeating it (see utils/idempotency.js).

import { Router } from 'express';
import { z } from 'zod';
import { withTx } from '../../db/tx.js';
import { validate } from '../../middleware/validate.js';
import { KEY_PATTERN } from '../../utils/idempotency.js';
import { send } from '../../utils/http.js';

const params = z.object({ operation: z.enum(['production.log', 'roll.create']), key: z.string().regex(KEY_PATTERN) });

const r = Router();
r.get('/idempotency/:operation/:key', validate({ params }), send((req) =>
  withTx(async (db) => {
    const { operation, key } = req.valid.params;
    const { rows: [row] } = await db.query(
      `select response, created_at from idempotency_keys where actor_id = $1 and operation = $2 and key = $3`, [req.ctx.userId, operation, key]);
    return row ? { found: true, response: row.response, recorded_at: row.created_at } : { found: false };
  })));

export default r;
