import { pool } from './pool.js';

const TRANSIENT = new Set(['ENOTFOUND', 'EAI_AGAIN', 'ETIMEDOUT', 'ECONNRESET', 'ECONNREFUSED']);

// connecting is safe to retry (no statement has run yet); flaky DNS/network must not fail a request
async function connect() {
  for (let attempt = 1; ; attempt++) {
    try {
      return await pool.connect();
    } catch (err) {
      if (!TRANSIENT.has(err.code) || attempt >= 3) throw err;
      await new Promise((r) => setTimeout(r, 250 * attempt));
    }
  }
}

async function run(ctx, fn) {
  const client = await connect();
  try {
    await client.query('BEGIN');
    await client.query(
      "select set_config('app.org_id', $1, true), set_config('app.user_id', $2, true)",
      [ctx.orgId ?? '', ctx.userId ?? ''],
    );
    const result = await fn(client);
    await client.query('COMMIT');
    return result;
  } catch (err) {
    await client.query('ROLLBACK').catch(() => {});
    throw err;
  } finally {
    client.release();
  }
}

// request-scoped: ctx comes from tenant middleware
export const withTenant = (ctx, fn) => run(ctx, fn);

// trusted server-side work for another org (event listeners, cron), e.g. creating
// the buyer's incoming GRN after the mill confirms a dispatch
export const withSystem = (orgId, fn) => run({ orgId, userId: null }, fn);

// switch the tenant inside an open transaction (used by flows that must write
// rows for two orgs atomically, e.g. accepting a partner invite)
export const setTenant = (db, orgId, userId = null) =>
  db.query("select set_config('app.org_id', $1, true), set_config('app.user_id', $2, true)", [
    orgId ?? '',
    userId ?? '',
  ]);
