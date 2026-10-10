import test from 'node:test';
import assert from 'node:assert/strict';
import { request } from '../src/lib/api.js';
test('send the auth header, no tenant header, and serialize writes', async t => {
  t.mock.method(globalThis,'fetch',async (_url,options) => {
    assert.equal(options.headers['x-org-id'],undefined); assert.equal(options.headers.Authorization,'Bearer token'); assert.equal(options.body,'{"qty":12}');
    return new Response(JSON.stringify({data:{id:'order'}}),{status:201});
  });
  assert.deepEqual(await request('/orders',{token:'token',method:'POST',body:{qty:12}}),{data:{id:'order'}});
});
test('preserve server conflict for duplicate dispatch', async t => {
  t.mock.method(globalThis,'fetch',async () => new Response(JSON.stringify({error:{code:'ROLL_ALREADY_DISPATCHED',message:'Roll already dispatched'}}),{status:409}));
  await assert.rejects(request('/dispatch'),error => error.status === 409 && error.code === 'ROLL_ALREADY_DISPATCHED');
});
test('reject HTML/malformed successful responses instead of presenting empty data', async t => {
  t.mock.method(globalThis,'fetch',async () => new Response('<html>proxy error</html>'));
  await assert.rejects(request('/orders'),error => error.code === 'INVALID_RESPONSE');
});
