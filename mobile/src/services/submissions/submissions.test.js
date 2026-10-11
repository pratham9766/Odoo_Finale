import { test } from 'node:test';
import assert from 'node:assert/strict';
import { ApiError } from '../api/client.js';
import { createAuthorizedApi } from '../auth/authorizedApi.js';
import { createPendingStore, KEY_PATTERN, newOperationKey } from './pendingStore.js';
import { createSubmissionEngine } from './submissionEngine.js';

const memory = () => {
  const m = new Map();
  return { map: m, get: async (k) => m.get(k) ?? null, set: async (k, v) => { m.set(k, v); }, remove: async (k) => { m.delete(k); } };
};
const input = { operation: 'production.log', path: '/work-orders/wo-1/logs', body: { qty: 12 }, label: '12 m on WO-1', subjectId: 'wo-1' };

/** A fake server that behaves like the real one: the first request with a key commits, repeats return the original. */
function fakeServer() {
  const committed = new Map();
  const calls = [];
  const state = { dropNextResponse: 0, failNext: null, down: false };
  const api = async (path, { method = 'GET', body, idempotencyKey } = {}) => {
    calls.push({ path, method, body, idempotencyKey });
    if (state.down) throw new ApiError('offline', 0, 'NETWORK');
    if (path.startsWith('/idempotency/')) {
      const key = path.split('/').pop();
      return { data: committed.has(key) ? { found: true, response: committed.get(key) } : { found: false } };
    }
    if (state.failNext) { const e = state.failNext; state.failNext = null; throw e; }
    const replayed = committed.has(idempotencyKey);
    if (!replayed) committed.set(idempotencyKey, { log: { qty: body.qty }, total: [...committed.values()].length + 1 });
    if (state.dropNextResponse > 0) { state.dropNextResponse -= 1; throw new ApiError('timeout', 0, 'TIMEOUT'); }    // committed, but the phone never hears
    return { data: committed.get(idempotencyKey), meta: { replayed } };
  };
  return { api, committed, calls, state };
}

test('keys are valid for the server and unique per entry', () => {
  const keys = new Set(Array.from({ length: 200 }, () => newOperationKey()));
  assert.equal(keys.size, 200);
  for (const k of keys) assert.match(k, KEY_PATTERN);
});

test('a normal submission is saved once, sent with its key, and leaves nothing pending', async () => {
  const server = fakeServer(); const store = createPendingStore(memory());
  const engine = createSubmissionEngine({ store, api: server.api, userId: 'u1' });
  const out = await engine.begin(input);
  assert.equal(out.outcome, 'saved');
  assert.match(server.calls[0].idempotencyKey, KEY_PATTERN);
  assert.equal(server.committed.size, 1);
  assert.deepEqual(await engine.list(), []);
});

test('a lost response keeps the entry; resending with the SAME key records the output once', async () => {
  const server = fakeServer(); const store = createPendingStore(memory());
  const engine = createSubmissionEngine({ store, api: server.api, userId: 'u1' });
  server.state.dropNextResponse = 1;
  const first = await engine.begin(input);
  assert.equal(first.outcome, 'uncertain');
  assert.equal(first.entry.state, 'uncertain');
  assert.equal((await engine.list()).length, 1);
  const retry = await engine.resend(first.entry);
  assert.equal(retry.outcome, 'saved');
  assert.equal(retry.replayed, true, 'the server answered from what it had already saved');
  assert.equal(server.committed.size, 1, 'recorded exactly once');
  assert.equal(server.calls[0].idempotencyKey, server.calls[1].idempotencyKey);
  assert.deepEqual(await engine.list(), []);
});

test('the entry is persisted before the request is sent and survives an app restart', async () => {
  const mem = memory(); const server = fakeServer();
  let seenWhileSending = null;
  const api = async (...args) => { seenWhileSending = await createPendingStore(mem).list('u1'); throw new ApiError('boom', 0, 'NETWORK'); };
  await createSubmissionEngine({ store: createPendingStore(mem), api, userId: 'u1' }).begin(input);
  assert.equal(seenWhileSending.length, 1, 'already on disk while the request was in flight');
  // the app restarts: a new store and engine over the same storage
  const restarted = createSubmissionEngine({ store: createPendingStore(mem), api: server.api, userId: 'u1' });
  const [entry] = await restarted.list();
  assert.equal(entry.state, 'uncertain', 'still unresolved after the restart, not silently cleared');
  const out = await restarted.resend(entry);
  assert.equal(out.outcome, 'saved');
  assert.equal(server.committed.size, 1);
});

test('check asks the server without changing anything: found settles the entry, not found allows a deliberate resend or a late discard', async () => {
  const server = fakeServer(); const store = createPendingStore(memory());
  let clock = 1_000_000;
  const engine = createSubmissionEngine({ store, api: server.api, userId: 'u1', now: () => clock });
  server.state.dropNextResponse = 1;
  const a = await engine.begin(input);                                   // committed on the server, response lost
  const settled = await engine.check(a.entry);
  assert.equal(settled.outcome, 'saved');
  assert.deepEqual(await engine.list(), []);

  server.state.down = false; server.state.failNext = new ApiError('x', 0, 'NETWORK');
  const b = await engine.begin(input);                                   // never reached the server
  assert.equal(b.outcome, 'uncertain');
  const checked = await engine.check(b.entry);
  assert.equal(checked.outcome, 'not_saved');
  assert.equal(server.committed.size, 1, 'the check itself recorded nothing');
  assert.equal(await engine.discard(checked.entry), false, 'too soon: a slow first request could still commit');
  clock += 61_000;
  const later = (await engine.list())[0];
  assert.equal(await engine.discard(later), true);
  assert.deepEqual(await engine.list(), []);
});

test('a definite refusal from the server drops the entry; nothing was committed', async () => {
  const server = fakeServer(); const store = createPendingStore(memory());
  const engine = createSubmissionEngine({ store, api: server.api, userId: 'u1' });
  server.state.failNext = new ApiError('above the allowed output', 422, 'VALIDATION_FAILED');
  const out = await engine.begin(input);
  assert.equal(out.outcome, 'rejected');
  assert.equal(out.info.kind, 'validation');
  assert.deepEqual(await engine.list(), []);
  assert.equal(server.committed.size, 0);
});

test('a new entry gets a new key, so two genuine entries of the same size are both recorded', async () => {
  const server = fakeServer(); const store = createPendingStore(memory());
  const engine = createSubmissionEngine({ store, api: server.api, userId: 'u1' });
  await engine.begin(input); await engine.begin(input);
  assert.equal(server.committed.size, 2);
  assert.notEqual(server.calls[0].idempotencyKey, server.calls[1].idempotencyKey);
});

test('entries and drafts belong to one user: another person on the same phone sees nothing and cannot resend', async () => {
  const mem = memory(); const server = fakeServer();
  server.state.down = true;
  await createSubmissionEngine({ store: createPendingStore(mem), api: server.api, userId: 'alice' }).begin(input);
  const store = createPendingStore(mem);
  await store.putDraft('alice', 'wo-1.log', { qty: '5' });
  assert.equal((await createSubmissionEngine({ store, api: server.api, userId: 'bob' }).list()).length, 0);
  assert.equal(await store.getDraft('bob', 'wo-1.log'), null);
  assert.deepEqual(await store.getDraft('alice', 'wo-1.log'), { qty: '5' });
  assert.equal((await store.list('alice')).length, 1);
});

test('when the session has ended the entry is kept, not lost', async () => {
  const store = createPendingStore(memory());
  const api = async () => { throw new ApiError('Your session has ended.', 401, 'SESSION_EXPIRED'); };
  const engine = createSubmissionEngine({ store, api, userId: 'u1' });
  const out = await engine.begin(input);
  assert.equal(out.outcome, 'not_sent');
  assert.equal((await engine.list())[0].state, 'not_sent');
});

// ---- token refresh -----------------------------------------------------------------------------------------------------

function authHarness({ refreshImpl } = {}) {
  const log = { requests: [], refreshes: 0, lost: 0 };
  let token = 'old';
  const request = async (path, o) => {
    log.requests.push({ path, token: o.token, method: o.method ?? 'GET', key: o.idempotencyKey });
    if (o.token !== 'new') throw new ApiError('Session expired, please log in again', 401, 'INVALID_TOKEN');
    return { data: { ok: path } };
  };
  const refresh = async () => { log.refreshes += 1; await new Promise((r) => setTimeout(r, 15)); if (refreshImpl) return refreshImpl(); token = 'new'; return 'new'; };
  const api = createAuthorizedApi({ getAccessToken: async () => token, refresh, request, onAuthLost: () => { log.lost += 1; } });
  return { api, log };
}

test('an expired token is refreshed ONCE for many simultaneous reads, and each read is retried', async () => {
  const { api, log } = authHarness();
  const results = await Promise.all(Array.from({ length: 6 }, (_, i) => api(`/orders?i=${i}`)));
  assert.equal(results.length, 6);
  assert.equal(log.refreshes, 1, 'no refresh storm');
  assert.equal(log.requests.filter((r) => r.token === 'new').length, 6);
  assert.equal(log.lost, 0);
});

test('a write without a key is NOT replayed after a refresh; a keyed write is', async () => {
  const bare = authHarness();
  await assert.rejects(bare.api('/orders/1/confirm', { method: 'POST', body: {} }), (e) => e.code === 'AUTH_RENEWED');
  assert.equal(bare.log.requests.length, 1, 'the write was not sent a second time');
  const keyed = authHarness();
  const out = await keyed.api('/work-orders/w/logs', { method: 'POST', body: { qty: 1 }, idempotencyKey: 'sm-keyed-0000000000001' });
  assert.deepEqual(out.data, { ok: '/work-orders/w/logs' });
  assert.equal(keyed.log.requests.length, 2);
  assert.equal(keyed.log.requests[1].key, 'sm-keyed-0000000000001', 'same key on the retry');
});

test('a refresh token that is no longer valid ends the session; a failed refresh because of the network does not', async () => {
  const dead = authHarness({ refreshImpl: async () => { throw Object.assign(new Error('Invalid Refresh Token'), { fatal: true }); } });
  await assert.rejects(dead.api('/orders'), (e) => e.code === 'SESSION_EXPIRED');
  assert.equal(dead.log.lost, 1);
  const offline = authHarness({ refreshImpl: async () => { throw new Error('Network request failed'); } });
  await assert.rejects(offline.api('/orders'), (e) => e.code === 'NETWORK');
  assert.equal(offline.log.lost, 0, 'still signed in');
});

test('403 is shown as a permission problem and never answered with a refresh', async () => {
  const log = { refreshes: 0 };
  const api = createAuthorizedApi({
    getAccessToken: async () => 't', refresh: async () => { log.refreshes += 1; return 't'; },
    request: async () => { throw new ApiError('Missing permission: qc.inspect', 403, 'FORBIDDEN'); }, onAuthLost: () => {},
  });
  await assert.rejects(api('/qc/inspections', { method: 'POST' }), (e) => e.status === 403);
  assert.equal(log.refreshes, 0);
});
