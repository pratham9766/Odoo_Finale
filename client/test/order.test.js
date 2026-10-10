import test from 'node:test';
import assert from 'node:assert/strict';
import { validateLines } from '../src/lib/order.js';
test('reject empty, invalid and non-finite quantities', () => {
  for (const lines of [[], [{item_id:'id',uom:'m',qty:0}], [{item_id:'id',uom:'m',qty:Infinity}], [{item_id:'id',uom:'m',qty:'bad'}], [{item_id:'id',uom:'m',qty:1,rate:-1}]]) assert.ok(validateLines(lines));
});
test('accept fractional quantity and zero price', () => assert.equal(validateLines([{item_id:'id',uom:'m',qty:0.001,rate:0}]),null));
