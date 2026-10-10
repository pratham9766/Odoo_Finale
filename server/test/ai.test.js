import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { makeUser, makeOrg, as, cleanup, sqlAdmin } from './helpers.js';
import { ask, runReadOnly } from '../src/modules/ai/ai.service.js';
import { allowedViews } from '../src/modules/ai/views.js';
import { RULES } from '../src/jobs/insights.js';
import { withTenant } from '../src/db/withTenant.js';
import { env } from '../src/config/env.js';

// The Gemini calls are replaced by stubs: this proves everything AROUND the model (permissions, guard,
// read-only role, tenant isolation, chat storage). Run a few real questions by hand once GEMINI_API_KEY is set.
let ownerA, ownerB, orgA, orgB, A;
const ctxOf = async (user, org) => {
  const c = (await as(user).get(`/me/orgs/${org.id}/context`)).body.data;
  return { orgId: org.id, userId: user.id, permissions: new Set(c.permissions) };
};
const planner = (sql) => async () => ({ can_answer: true, reason_if_not: '', sql, chart: { type: 'table', x: 'name', y: 'on_hand' }, explanation: '' });
const answerer = async ({ rows }) => `${rows.length} row(s)`;

before(async () => {
  [ownerA, ownerB] = await Promise.all([makeUser('aiA'), makeUser('aiB')]);
  orgA = await makeOrg(ownerA, 'AI Mill A');
  orgB = await makeOrg(ownerB, 'AI Mill B');
  A = as(ownerA, orgA.id);
  for (const [u, o, name] of [[ownerA, orgA, 'A-Yarn'], [ownerB, orgB, 'B-Yarn']]) {
    const item = (await as(u, o.id).post('/items', { kind: 'yarn', name, uom: 'kg' })).body.data.id;
    await sqlAdmin(
      `with l as (insert into stock_lots (org_id, item_id, lot_no) values ($1,$2,'X1') returning id)
       insert into stock_movements (org_id, item_id, lot_id, type, qty) select $1,$2,l.id,'in',50 from l`, [o.id, item]);
  }
});
after(cleanup);

test('the assistant only sees its own organization (RLS through ai_reader)', async () => {
  const ctx = await ctxOf(ownerA, orgA);
  const out = await ask(ctx, { question: 'stock?' }, { plan: planner('select name, on_hand from v_stock order by name'), answer: answerer });
  assert.deepEqual(out.rows.map((r) => r.name), ['A-Yarn']);
  assert.equal(out.answer, '1 row(s)');
});

test('ai_reader cannot write or read protected tables even if the guard were bypassed', async () => {
  const ctx = await ctxOf(ownerA, orgA);
  await assert.rejects(runReadOnly(ctx, `insert into warehouses (org_id, name, kind) values ('${orgA.id}', 'x', 'raw')`));
  await assert.rejects(runReadOnly(ctx, 'select * from audit_logs'), /permission denied/);
  await assert.rejects(runReadOnly(ctx, 'select * from staff_invites'), /permission denied/);
  await assert.rejects(runReadOnly(ctx, 'select pg_sleep(6)'), /timeout|cancel/i);
  // with no org set, nothing is visible
  const rows = await runReadOnly({ orgId: '' }, 'select * from v_stock');
  assert.equal(rows.length, 0);
});

test('unsafe model output is rejected, never executed', async () => {
  const ctx = await ctxOf(ownerA, orgA);
  for (const sql of ['delete from items', 'select * from items', 'select * from v_stock; drop table items', "select set_config('app.org_id','x',false)"]) {
    await assert.rejects(ask(ctx, { question: 'x' }, { plan: planner(sql), answer: answerer }), (e) => e.code === 'AI_UNSAFE_SQL', sql);
  }
  assert.equal((await sqlAdmin('select count(*)::int c from items where org_id = $1', [orgA.id])).rows[0].c, 1);
});

test('a failing query is retried once with the error; the model can also decline', async () => {
  const ctx = await ctxOf(ownerA, orgA);
  let calls = 0;
  const plan = async (arg) => {
    calls++;
    return planner(arg.retryNote ? 'select name from v_stock' : 'select nonexistent_col from v_stock')();
  };
  const out = await ask(ctx, { question: 'x' }, { plan, answer: answerer });
  assert.equal(calls, 2);
  assert.equal(out.rows.length, 1);
  const declined = await ask(ctx, { question: 'x' }, {
    plan: async () => ({ can_answer: false, reason_if_not: 'No such data', sql: '', chart: { type: 'table', x: '', y: '' }, explanation: '' }), answer: answerer });
  assert.equal(declined.answer, 'No such data');
  assert.deepEqual(declined.rows, []);
});

test('views follow permissions: finance views need data access AND ai.chat_finance', async () => {
  const owner = allowedViews(await ctxOf(ownerA, orgA));
  assert.ok(owner.includes('v_stock') && owner.includes('v_monthly_pnl') && owner.includes('v_receivables'));
  const base = new Set(['stock.view', 'ai.chat']);
  assert.deepEqual(allowedViews({ permissions: base }).sort(), ['v_finished_stock', 'v_low_stock', 'v_stock', 'v_stock_days_left']);
  assert.ok(!allowedViews({ permissions: new Set(['reports.pnl', 'ai.chat']) }).includes('v_monthly_pnl'));
  assert.ok(allowedViews({ permissions: new Set(['reports.pnl', 'ai.chat_finance']) }).includes('v_monthly_pnl'));
  await assert.rejects(ask({ ...(await ctxOf(ownerA, orgA)), permissions: new Set(['ai.chat']) }, { question: 'x' }, { plan: planner('select 1'), answer: answerer }),
    (e) => e.status === 403);
});

test('POST /ai/chat: clear 503 without a key, a real stored answer with one; permission required either way', async () => {
  const res = await A.post('/ai/chat', { question: 'How much stock do we have?' });
  if (env.GEMINI_API_KEY) {
    assert.equal(res.status, 200, JSON.stringify(res.body)); // live Gemini call
    assert.equal(typeof res.body.data.answer, 'string');
    assert.ok(res.body.data.sql.toLowerCase().includes('v_stock'));
    assert.deepEqual(res.body.data.rows.map((r) => r.name).sort(), ['A-Yarn']); // only this org's data
    const saved = await A.get(`/ai/chats/${res.body.data.chat_id}`);
    assert.equal(saved.body.data.messages.length, 2);
  } else {
    assert.equal(res.status, 503);
    assert.equal(res.body.error.code, 'AI_CANNOT_ANSWER');
  }
  const nobody = await makeUser('noai');
  const roles = (await A.get('/roles')).body.data;
  const inv = await A.post('/staff/invites', { email: nobody.email, role_id: roles.find((r) => r.name === 'Gate Security').id });
  await as(nobody).post(`/me/invites/staff/${inv.body.data.link.split('/').pop()}/accept`);
  assert.equal((await as(nobody, orgA.id).post('/ai/chat', { question: 'hello there' })).status, 403);
});

test('insight rules run cleanly against the real views and dismiss respects permissions', async () => {
  await withTenant({ orgId: orgA.id, userId: ownerA.id }, async (db) => {
    for (const rule of RULES) {
      const out = await rule(db);
      assert.ok(Array.isArray(out), `${rule.name} returned ${typeof out}`);
    }
    await db.query(
      `insert into ai_insights (org_id, type, severity, title, body, required_permission) values ($1,'t','info','Secret finance insight','b','reports.pnl'), ($1,'t','info','Open insight','b',null)`,
      [orgA.id]);
  });
  const mine = (await A.get('/ai/insights')).body.data;
  assert.deepEqual(mine.map((i) => i.title).sort(), ['Open insight', 'Secret finance insight']);
  const keeper = await makeUser('keeperAI');
  const roles = (await A.get('/roles')).body.data;
  const inv = await A.post('/staff/invites', { email: keeper.email, role_id: roles.find((r) => r.name === 'Store Keeper').id });
  await as(keeper).post(`/me/invites/staff/${inv.body.data.link.split('/').pop()}/accept`);
  const seen = (await as(keeper, orgA.id).get('/ai/insights')).body.data;
  assert.deepEqual(seen.map((i) => i.title), ['Open insight']);
  const secret = mine.find((i) => i.title === 'Secret finance insight');
  assert.equal((await as(keeper, orgA.id).post(`/ai/insights/${secret.id}/dismiss`)).status, 404);
  assert.equal((await A.post(`/ai/insights/${secret.id}/dismiss`)).status, 200);
});
