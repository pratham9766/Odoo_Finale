// Test helpers: real Supabase auth users + the real database (the dev project).
// Everything a test creates is tracked and removed in cleanup().
import { randomBytes } from 'node:crypto';
import pg from 'pg';
import { createClient } from '@supabase/supabase-js';
import request from 'supertest';
import { env } from '../src/config/env.js';
import { app } from '../src/app.js';
import { pool } from '../src/db/pool.js';
import { registerListeners } from '../src/events/listeners/index.js';

await registerListeners(); // bus listeners run in tests too (async reactions)

const admin = createClient(env.SUPABASE_URL, env.SUPABASE_SERVICE_ROLE_KEY, { auth: { persistSession: false } });
const publicClient = () =>
  createClient(env.SUPABASE_URL, process.env.SUPABASE_PUBLISHABLE_KEY, { auth: { persistSession: false } });

export const api = () => request(app);
export async function waitFor(fn, { tries = 40, ms = 500 } = {}) {
  for (let i = 0; i < tries; i++) {
    const v = await fn();
    if (v) return v;
    await new Promise((r) => setTimeout(r, ms));
  }
  throw new Error('waitFor timed out');
}

export const rand = () => randomBytes(4).toString('hex');

const users = [];
const orgIds = [];

export async function makeUser(label = 'u') {
  const email = `tl-${label}-${rand()}@example.com`;
  const password = `Pw-${rand()}-${rand()}`;
  const { data, error } = await admin.auth.admin.createUser({ email, password, email_confirm: true });
  if (error) throw error;
  const c = publicClient();
  const { data: s, error: e2 } = await c.auth.signInWithPassword({ email, password });
  if (e2) throw e2;
  const u = { id: data.user.id, email, token: s.session.access_token };
  users.push(u);
  return u;
}

export const as = (user, orgId) => {
  const h = { Authorization: `Bearer ${user.token}` };
  if (orgId) h['x-org-id'] = orgId;
  return {
    get: (p) => api().get(`/api/v1${p}`).set(h),
    post: (p, body) => api().post(`/api/v1${p}`).set(h).send(body ?? {}),
    put: (p, body) => api().put(`/api/v1${p}`).set(h).send(body ?? {}),
    patch: (p, body) => api().patch(`/api/v1${p}`).set(h).send(body ?? {}),
    delete: (p) => api().delete(`/api/v1${p}`).set(h),
  };
};

export async function makeOrg(user, name, types = ['manufacturer']) {
  const res = await as(user).post('/me/orgs', { name, types });
  if (res.status !== 201) throw new Error(`createOrg failed: ${res.status} ${JSON.stringify(res.body)}`);
  orgIds.push(res.body.data.id);
  return res.body.data;
}

// run SQL as the postgres role (bypasses RLS) for setup/inspection
export async function sqlAdmin(text, params) {
  const c = new pg.Client({ connectionString: process.env.MIGRATION_DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  try { return await c.query(text, params); } finally { await c.end(); }
}

export async function cleanup() {
  const c = new pg.Client({ connectionString: process.env.MIGRATION_DATABASE_URL, ssl: { rejectUnauthorized: false } });
  await c.connect();
  try {
    // delete table by table across ALL test orgs and match either party, children first:
    // rows of one org can point at another test org (supplier ↔ mill ↔ transporter)
    for (const sql of [
      'delete from rolls where org_id = any($1)', 'delete from material_issues where org_id = any($1)',
      'delete from production_logs where org_id = any($1)', 'delete from work_order_outputs where org_id = any($1)',
      'delete from work_orders where org_id = any($1)', 'delete from reservations where org_id = any($1)',
      'delete from dispatch_rolls where from_org_id = any($1) or to_org_id = any($1)',
      'delete from invoice_lines where seller_org_id = any($1) or buyer_org_id = any($1)',
      'delete from payments where seller_org_id = any($1) or buyer_org_id = any($1)',
      'delete from invoices where seller_org_id = any($1) or buyer_org_id = any($1)',
      'delete from trip_events where requester_org_id = any($1) or transporter_org_id = any($1) or receiver_org_id = any($1)',
      'delete from trips where requester_org_id = any($1) or transporter_org_id = any($1) or receiver_org_id = any($1)',
      'delete from gate_entries where org_id = any($1)',
      'delete from dispatch_lots where from_org_id = any($1) or to_org_id = any($1)',
      'delete from dispatches where from_org_id = any($1) or to_org_id = any($1)',
      'delete from goods_receipts where org_id = any($1)',
      'delete from order_events where seller_org_id = any($1) or buyer_org_id = any($1)',
      'delete from po_lines where buyer_org_id = any($1) or supplier_org_id = any($1)',
      'delete from purchase_orders where buyer_org_id = any($1) or supplier_org_id = any($1)',
      'delete from order_lines where seller_org_id = any($1) or buyer_org_id = any($1)',
      'delete from orders where seller_org_id = any($1) or buyer_org_id = any($1)',
      'delete from partnerships where requester_org_id = any($1) or target_org_id = any($1)',
      'delete from audit_logs where org_id = any($1)',
      'delete from organizations where id = any($1)',
    ]) await c.query(sql, [orgIds]).catch((e) => console.error('[cleanup]', sql.slice(0, 45), e.message));
  } finally { await c.end(); }
  for (const u of users) await admin.auth.admin.deleteUser(u.id).catch(() => {});
  await pool.end();
}
