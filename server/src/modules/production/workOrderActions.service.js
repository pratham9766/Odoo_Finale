// Work order lifecycle (backend plan §11.7): start / resume, pause, finish.
// Every function takes an optional `{ at }` so the seed can replay history; HTTP never passes it.

import { withTx } from '../../db/tx.js';
import { assertExists, invalid } from '../../utils/crud/index.js';
import { AppError } from '../../utils/errors.js';
import { bomInputQty, round3 } from '../../utils/textile.js';
import { issueForWorkOrder, produce } from '../inventory/inventory.service.js';
import { publishMachine } from './board.service.js';
import { assertUsableMachine } from './machineRules.js';
import { setMachineStatus } from './machineStatus.js';
import { announce, lockWorkOrder, notRunning } from './workOrderSupport.js';
import { workOrders } from './workOrders.service.js';
import { assertOutputWithin, overTargetPct } from './outputLimits.js';

/** Inputs this work order consumes: the output item's default BOM scaled to the target, one entry per item (warp and weft add up). */
async function materialFor(db, ctx, wo) {
  const { rows } = await db.query(
    `select l.component_item_id as item_id, l.qty, l.wastage_pct, b.output_qty
       from boms b join bom_lines l on l.bom_id = b.id
      where b.output_item_id = $1 and b.is_default`, [wo.output_item_id]);
  const needed = new Map();
  for (const line of rows) needed.set(line.item_id, (needed.get(line.item_id) ?? 0) + bomInputQty(wo.target_qty, line, line.output_qty));
  return [...needed].map(([item_id, qty]) => ({ item_id, qty: round3(qty) }));
}

/**
 * Start a planned work order, or resume a paused one. The first start issues its material from stock (FIFO from the
 * order's reservations); a resume only puts the machine back to work. The machine must be idle.
 */
export async function startWorkOrder(ctx, id, { at = new Date() } = {}) {
  const wo = await withTx(async (db) => {
    const row = await lockWorkOrder(db, ctx, id);
    if (!['planned', 'paused'].includes(row.status)) {
      throw new AppError(409, 'INVALID_STATE_TRANSITION', `Work order ${row.wo_no} is ${row.status}; only planned or paused work can be started`);
    }
    if (!row.machine_id) throw invalid('machine_id', `Assign a machine to ${row.wo_no} before starting it`);

    const machine = await assertUsableMachine(db, ctx, row.machine_id, { lock: true });
    if (machine.status !== 'idle') {
      throw new AppError(409, 'INVALID_STATE_TRANSITION', `Machine ${machine.code} is ${machine.status}, not idle`);
    }

    const firstStart = !row.started_at;
    if (firstStart && !row.is_rework) {                       // a rework re-processes a roll that already exists
      const items = await materialFor(db, ctx, row);
      if (items.length) await issueForWorkOrder(db, ctx, { workOrderId: row.id, orderId: row.order_id, items });
    }
    await setMachineStatus(db, ctx, machine.id, 'running', { workOrderId: row.id, at });
    await db.query(`update work_orders set status = 'running', started_at = coalesce(started_at, $2) where id = $1`, [row.id, at]);
    return row;
  });
  await announce(ctx, 'workorder.started', wo);
  return workOrders.get(ctx, id);
}

/** Pause a running work order; its machine goes idle. */
export async function pauseWorkOrder(ctx, id, { reason } = {}, { at = new Date() } = {}) {
  const wo = await withTx(async (db) => {
    const row = await lockWorkOrder(db, ctx, id);
    if (row.status !== 'running') throw notRunning(row, 'be paused');
    await setMachineStatus(db, ctx, row.machine_id, 'idle', { reason: reason ?? 'paused', at });
    await db.query(`update work_orders set status = 'paused' where id = $1`, [row.id]);
    return row;
  });
  await publishMachine(wo.machine_id);
  return workOrders.get(ctx, id);
}

/** Intermediate output (yarn, grey fabric) becomes a WIP lot the next stage can issue from; finished fabric lives on as rolls. */
async function stockOutput(db, ctx, wo, { good_qty, waste_qty, waste_item_id }) {
  if (good_qty > 0 && wo.output_kind !== 'finished_fabric' && !wo.is_rework) {         // a reworked roll already exists: it is not new stock
    // reserved for this order, so the next stage's start can issue it (issueForWorkOrder only takes reserved stock)
    await produce(db, ctx, { itemId: wo.output_item_id, qty: good_qty, lotNo: wo.wo_no, refType: 'work_order', refId: wo.id, orderId: wo.order_id });
  }
  if (waste_qty > 0 && waste_item_id) {
    await produce(db, ctx, { itemId: waste_item_id, qty: waste_qty, lotNo: `${wo.wo_no}-W`, refType: 'work_order', refId: wo.id });
  }
}

/** Finish a work order: record good output and waste, free the machine, stock the output. */
export async function finishWorkOrder(ctx, id, input, { at = new Date() } = {}) {
  const wo = await withTx(async (db) => {
    const row = await lockWorkOrder(db, ctx, id);
    if (!['running', 'paused'].includes(row.status)) {
      throw new AppError(409, 'INVALID_STATE_TRANSITION', `Work order ${row.wo_no} is ${row.status}; only running or paused work can be finished`);
    }
    assertOutputWithin(row, { good: input.good_qty, waste: input.waste_qty }, overTargetPct(ctx));
    if (input.waste_item_id) {
      await assertExists(db, 'items', input.waste_item_id, 'Waste item');
      const { rows: [item] } = await db.query(`select kind from items where id = $1`, [input.waste_item_id]);
      if (item.kind !== 'scrap') throw invalid('waste_item_id', 'Waste must be booked to a scrap item');
    }

    await db.query(
      `insert into work_order_outputs (work_order_id, good_qty, good_weight_kg, waste_qty, waste_item_id, waste_type, created_at, created_by)
       values ($1, $2, $3, $4, $5, $6, $7, $8)`,
      [row.id, input.good_qty, input.good_weight_kg ?? null, input.waste_qty, input.waste_item_id ?? null, input.waste_type ?? null, at, ctx.userId]);
    await db.query(
      `update work_orders set status = 'done', finished_at = $2, waste_qty = $3, produced_qty = greatest(produced_qty, $4) where id = $1`,
      [row.id, at, input.waste_qty, input.good_qty]);

    const { rows: [machine] } = await db.query(`select current_work_order_id from machines where id = $1 for update`, [row.machine_id]);
    if (machine?.current_work_order_id === row.id) {
      await setMachineStatus(db, ctx, row.machine_id, 'idle', { reason: 'work order finished', at });
    }
    await stockOutput(db, ctx, row, input);
    return row;
  });
  await announce(ctx, 'workorder.finished', wo);
  return workOrders.get(ctx, id);
}
