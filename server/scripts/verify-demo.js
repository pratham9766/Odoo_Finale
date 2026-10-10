// Read-only API checks. Does not output passwords or session tokens.
import assert from 'node:assert/strict';
import { env } from '../src/config/env.js';
const base = `http://localhost:${env.PORT}/api/v1`;
const origin = env.CLIENT_URL;
async function call(path, headers = {}, body) {
  const response = await fetch(base + path, { method: body ? 'POST' : 'GET', headers: { origin, ...headers, ...(body ? { 'content-type': 'application/json' } : {}) }, ...(body ? { body: JSON.stringify(body) } : {}) });
  const payload = await response.json();
  assert.equal(response.status,200,`${path}: ${response.status} ${payload.error?.message || ''}`);
  return payload.data;
}
const accounts = await call('/demo/accounts');
assert.equal(accounts.length,26);
assert(accounts.every(a => !('password' in a)));
for (const account of accounts) {
  const session = await call('/demo/session', {}, {id:account.id});
  const headers = {authorization:`Bearer ${session.access_token}`};
  const orgs = await call('/me/orgs',headers);
  assert.equal(orgs.length,1);
  const id = orgs[0].org_id || orgs[0].id;
  const context = await call(`/me/orgs/${id}/context`,headers);
  assert.equal(context.role.name,account.role);
  assert(context.org.types.includes(account.type));
  if (account.type === 'manufacturer' && account.role === 'Owner') {
    for (const path of ['/orders','/stock','/machines/board']) {
      await call(path,{...headers,'x-org-id':id});
    }
  }
  console.log(`Verified: ${account.type} / ${account.role}`);
}
for (const headers of [{},{origin:'https://untrusted.example'}]) {
  assert.equal((await fetch(base+'/demo/accounts',{headers})).status,404);
}
console.log('All demo accounts authenticated with their correct tenant and role; origin checks passed.');
