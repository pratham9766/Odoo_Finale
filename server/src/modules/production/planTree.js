// Pure part of planning (no database): which work orders does an explode() tree call for?

import { round3 } from '../../utils/textile.js';

/**
 * Flatten an explode() tree into work order specs. One per (stage, item): the warp and weft of the same yarn are
 * two nodes in the tree but one spinning job. Nodes that are bought, fully covered by stock, or have no mill stage
 * (garment cutting happens at the buyer) produce nothing.
 * @returns {Array<{ stage_id: string, output_item_id: string, uom: string, target_qty: number }>}
 */
export function workOrdersFromTree(root) {
  const merged = new Map();
  (function walk(node) {
    if (node.action === 'produce' && node.stage_id && node.to_make > 0) {
      const key = `${node.stage_id}:${node.item.id}`;
      const spec = merged.get(key) ?? { stage_id: node.stage_id, output_item_id: node.item.id, uom: node.item.uom, target_qty: 0 };
      spec.target_qty += node.to_make;
      merged.set(key, spec);
    }
    node.children.forEach(walk);
  })(root);
  return [...merged.values()].map((spec) => ({ ...spec, target_qty: round3(spec.target_qty) }));
}
