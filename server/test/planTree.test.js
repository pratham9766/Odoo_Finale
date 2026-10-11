// Unit tests for turning a BOM explosion into work orders (stage order, quantities).
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { workOrdersFromTree } from '../src/modules/production/planTree.js';

const item = (id, uom = 'kg') => ({ id, uom });
const node = (id, to_make, { stage = null, action = to_make > 0 ? 'produce' : null, uom, children = [] } = {}) =>
  ({ item: item(id, uom), required: to_make, to_make, action, stage_id: stage, children });

test('one work order per produced node, quantities as exploded', () => {
  const tree = node('finished', 1578, { stage: 'dye', uom: 'm', children: [
    node('grey', 1643.75, { stage: 'weave', uom: 'm', children: [
      node('yarn', 92, { stage: 'spin', children: [node('fibre', 105, { action: 'buy' })] }),
    ] }),
  ] });
  assert.deepEqual(workOrdersFromTree(tree), [
    { stage_id: 'dye', output_item_id: 'finished', uom: 'm', target_qty: 1578 },
    { stage_id: 'weave', output_item_id: 'grey', uom: 'm', target_qty: 1643.75 },
    { stage_id: 'spin', output_item_id: 'yarn', uom: 'kg', target_qty: 92 },
  ]);
});

test('warp and weft of the same yarn become ONE spinning job with the summed quantity', () => {
  const tree = node('grey', 1000, { stage: 'weave', uom: 'm', children: [
    node('yarn-40s', 40.5, { stage: 'spin' }),      // warp
    node('yarn-40s', 51.5, { stage: 'spin' }),      // weft
  ] });
  const specs = workOrdersFromTree(tree);
  assert.equal(specs.length, 2);
  assert.deepEqual(specs.find((s) => s.output_item_id === 'yarn-40s'), { stage_id: 'spin', output_item_id: 'yarn-40s', uom: 'kg', target_qty: 92 });
});

test('different yarns in the same stage stay separate jobs', () => {
  const tree = node('grey', 100, { stage: 'weave', uom: 'm', children: [node('yarn-a', 10, { stage: 'spin' }), node('yarn-b', 5, { stage: 'spin' })] });
  assert.deepEqual(workOrdersFromTree(tree).map((s) => s.output_item_id).sort(), ['grey', 'yarn-a', 'yarn-b']);
});

test('nothing is made for bought items, fully stocked nodes, or nodes without a mill stage', () => {
  const stocked = node('yarn', 0, { stage: 'spin' });                                   // covered by stock: to_make 0
  const bought = node('dye', 6.6, { action: 'buy' });
  const garment = node('shirt', 1000, { stage: null, children: [node('finished', 1778, { stage: 'dye', uom: 'm' })] });   // cutting is the buyer's job
  assert.deepEqual(workOrdersFromTree(node('grey', 50, { stage: 'weave', uom: 'm', children: [stocked, bought] })).map((s) => s.output_item_id), ['grey']);
  assert.deepEqual(workOrdersFromTree(garment).map((s) => s.output_item_id), ['finished']);   // children of a stage-less node are still walked
});

test('a tree fully covered by stock yields no work orders', () => {
  assert.deepEqual(workOrdersFromTree(node('finished', 0, { stage: 'dye', uom: 'm' })), []);
});

test('quantities are rounded to 3 decimals (numeric(14,3))', () => {
  const tree = node('grey', 0.1 + 0.2, { stage: 'weave', uom: 'm', children: [node('yarn', 33.3333333, { stage: 'spin' }), node('yarn', 33.3333333, { stage: 'spin' })] });
  const specs = workOrdersFromTree(tree);
  assert.equal(specs.find((s) => s.output_item_id === 'grey').target_qty, 0.3);
  assert.equal(specs.find((s) => s.output_item_id === 'yarn').target_qty, 66.667);
});
