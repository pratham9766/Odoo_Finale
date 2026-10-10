import test from 'node:test';
import assert from 'node:assert/strict';
import { organizations, cleanPath } from '../src/lib/contracts.js';
test('Supabase organization rows have usable IDs and disabled memberships are excluded', () => {
  assert.deepEqual(organizations([{org_id:'mill', name:'Mill', membership_status:'active'}, {org_id:'other',membership_status:'disabled'}]).map(row => row.id), ['mill']);
});
test('empty filters do not trigger backend status validation errors', () => {
  assert.equal(cleanPath('/orders?page=1&limit=25&status=&q='), '/orders?page=1&limit=25');
  assert.equal(cleanPath('/orders?status=draft&q=ORD%201'), '/orders?status=draft&q=ORD+1');
});
