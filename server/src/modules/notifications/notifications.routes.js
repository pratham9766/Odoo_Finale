import { Router } from 'express';
import { z } from 'zod';
import { withTx } from '../../db/tx.js';
import { validate, idParam, pageQuery } from '../../middleware/validate.js';
import { send } from '../../utils/http.js';
import { paged } from '../../utils/paginate.js';
import { must } from '../../utils/errors.js';
import { signUpload, BUCKETS } from '../../utils/storage.js';

const r = Router();

// visible = addressed to me, or broadcast (user_id null) for a permission I hold
const VISIBLE = `(n.user_id = $1
  or (n.user_id is null and (n.required_permission is null or n.required_permission = any($2::text[]))))`;

r.get('/notifications', validate({ query: z.object({ ...pageQuery, unread: z.enum(['true', 'false']).optional() }) }),
  send((req) => withTx(async (db) => {
    const { ctx, valid: { query: q } } = req;
    const params = [ctx.userId, [...ctx.permissions]];
    const { rows, meta } = await paged(
      db,
      `select n.id, n.type, n.title, n.body, n.link, n.data, n.created_at,
              case when n.user_id is null then (nr.user_id is not null) else (n.read_at is not null) end as read
         from notifications n
         left join notification_reads nr on nr.notification_id = n.id and nr.user_id = $1
        where ${VISIBLE} ${q.unread === 'true' ? `and not (case when n.user_id is null then nr.user_id is not null else n.read_at is not null end)` : ''}`,
      params, q, 'created_at desc',
    );
    const { rows: [{ unread }] } = await db.query(
      `select count(*)::int as unread from notifications n
         left join notification_reads nr on nr.notification_id = n.id and nr.user_id = $1
        where ${VISIBLE} and not (case when n.user_id is null then nr.user_id is not null else n.read_at is not null end)`,
      params,
    );
    return { data: rows, meta: { ...meta, unread } };
  })));

async function markRead(db, ctx, ids) {
  await db.query(
    `update notifications set read_at = now() where user_id = $1 and read_at is null and id = any($2)`,
    [ctx.userId, ids]);
  await db.query(
    `insert into notification_reads (notification_id, user_id)
     select n.id, $1 from notifications n
      where n.user_id is null and n.id = any($2)
        and (n.required_permission is null or n.required_permission = any($3::text[]))
     on conflict do nothing`,
    [ctx.userId, ids, [...ctx.permissions]]);
}

r.post('/notifications/:id/read', validate({ params: idParam }),
  send((req) => withTx(async (db) => {
    const { rowCount } = await db.query(`select 1 from notifications n where n.id = $3 and ${VISIBLE}`,
      [req.ctx.userId, [...req.ctx.permissions], req.valid.params.id]);
    must(rowCount ? {} : null, 'Notification');
    await markRead(db, req.ctx, [req.valid.params.id]);
    return { id: req.valid.params.id };
  })));

r.post('/notifications/read-all',
  send((req) => withTx(async (db) => {
    const { rows } = await db.query(`select n.id from notifications n where ${VISIBLE}`,
      [req.ctx.userId, [...req.ctx.permissions]]);
    await markRead(db, req.ctx, rows.map((x) => x.id));
    return { count: rows.length };
  })));

// signed upload URL for <uuid>-<filename>
r.post('/uploads/sign',
  validate({ body: z.object({ bucket: z.enum(BUCKETS), filename: z.string().trim().min(1).max(200) }) }),
  send((req) => signUpload(req.valid.body.bucket, req.valid.body.filename)));

export default r;
