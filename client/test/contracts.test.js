import test from 'node:test';
import assert from 'node:assert/strict';
import { cleanPath } from '../src/lib/contracts.js';
test('empty filters do not trigger backend status validation errors', () => {
  assert.equal(cleanPath('/orders?page=1&limit=25&status=&q='), '/orders?page=1&limit=25');
  assert.equal(cleanPath('/orders?status=draft&q=ORD%201'), '/orders?status=draft&q=ORD+1');
});
