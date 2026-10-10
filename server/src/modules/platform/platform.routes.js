import { Router } from 'express';
import { z } from 'zod';
import { withTenant } from '../../db/withTenant.js';
import { AppError } from '../../utils/errors.js';
import { validate, idParam } from '../../middleware/validate.js';
import { send } from '../../utils/http.js';
import { runJob } from '../../jobs/index.js';

const r = Router();
const NO_ORG = (user) => ({ orgId: null, userId: user.id });

// platform_* functions are callable by app_user, so every route verifies the flag first
async function asAdmin(user, fn) {
  return withTenant(NO_ORG(user), async (db) => {
    const { rows: [p] } = await db.query('select is_platform_admin from profiles where id = $1', [user.id]);
    if (!p?.is_platform_admin) throw new AppError(403, 'FORBIDDEN', 'Platform admin only');
    return fn(db);
  });
}

r.get('/orgs', send((req) => asAdmin(req.user, async (db) => (await db.query('select * from platform_org_overview()')).rows)));

r.post('/orgs/:id/status',
  validate({ params: idParam, body: z.object({ status: z.enum(['pending', 'active', 'suspended']) }) }),
  send((req) => asAdmin(req.user, async (db) => {
    await db.query('select platform_set_org_status($1, $2)', [req.valid.params.id, req.valid.body.status]);
    return { id: req.valid.params.id, status: req.valid.body.status };
  })));

r.get('/usage', send((req) => asAdmin(req.user, async (db) => (await db.query('select * from platform_usage()')).rows[0])));

r.post('/announcements',
  validate({ body: z.object({ title: z.string().trim().min(1).max(200), body: z.string().trim().min(1).max(5000) }) }),
  send((req) => asAdmin(req.user, async (db) =>
    (await db.query('insert into platform_announcements (title, body) values ($1,$2) returning *',
      [req.valid.body.title, req.valid.body.body])).rows[0]), 201));

// §22.6 #6: trigger a cron job on demand (free hosting sleeps)
r.post('/jobs/:name/run', validate({ params: z.object({ name: z.string().regex(/^[a-zA-Z]+$/).max(40) }) }),
  send((req) => asAdmin(req.user, async () => runJob(req.valid.params.name))));

export default r;
