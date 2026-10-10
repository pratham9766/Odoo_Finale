// Dispatches: create, scan rolls onto them, take a roll off, move the status along (in transit → delivered).
// Every function takes an optional `{ at }` so the seed can replay history.

import { withTx } from '../../db/tx.js';
import { bus } from '../../events/bus.js';
import { Filter } from '../../utils/crud/index.js';
import { AppError } from '../../utils/errors.js';
import { nextNumber } from '../../utils/numbering.js';
import { loadContact, loadMillParty } from '../mill/parties.js';
import { dispatchTotals, markRollsDelivered } from './dispatchSupport.js';

const SHIPPABLE = ['in_production', 'in_qc', 'ready_to_ship', 'partially_dispatched'];   // order statuses that can have a dispatch
const notFound = () => new AppError(404, 'NOT_FOUND', 'Dispatch not found');

const SELECT = `
  select d.*, o.order_no, bc.name as to_party,
         (select count(*)::int from dispatch_rolls dr where dr.dispatch_id = d.id) as roll_count,
         (select coalesce(sum(dr.length_m), 0) from dispatch_rolls dr where dr.dispatch_id = d.id) as total_m
    from dispatches d
    left join orders o on o.id = d.order_id
    left join contacts bc on bc.id = d.to_contact_id`;

export async function createDispatch(ctx, input, { at = new Date() } = {}) {
  const id = await withTx(async (db) => {
    const { rows: [order] } = await db.query(
      `select id, order_no, status, buyer_contact_id from orders where id = $1`, [input.order_id]);
    if (!order) throw new AppError(404, 'NOT_FOUND', 'Order not found');
    if (!SHIPPABLE.includes(order.status)) {
      throw new AppError(409, 'INVALID_STATE_TRANSITION', `Order ${order.order_no} is ${order.status}; it has nothing ready to dispatch`);
    }
    const { rows: [d] } = await db.query(
      `insert into dispatches (dispatch_no, to_contact_id, order_id, vehicle_no, driver_name, driver_phone, created_at, created_by)
       values ($1, $2, $3, $4, $5, $6, $7, $8) returning id`,
      [await nextNumber(db, 'DSP'), order.buyer_contact_id, order.id,
       input.vehicle_no ?? null, input.driver_name ?? null, input.driver_phone ?? null, at, ctx.userId]);
    return d.id;
  });
  return getDispatch(ctx, id);
}

/** This mill's dispatches. → { rows, total } */
export function listDispatches(ctx, { status, order_id: orderId, page = 1, limit = 100 } = {}) {
  return withTx(async (db) => {
    const f = new Filter().eq('d.status', status).eq('d.order_id', orderId);
    const { rows } = await db.query(
      `${SELECT} where ${f.sql} order by d.created_at desc, d.dispatch_no desc limit $${f.params.length + 1} offset $${f.params.length + 2}`,
      [...f.params, limit, (page - 1) * limit]);
    const { rows: [{ n }] } = await db.query(`select count(*)::int as n from dispatches d where ${f.sql}`, f.params);
    return { rows, total: n };
  });
}

/** One dispatch with its scanned rolls and the ordered / scanned / remaining totals. */
export function getDispatch(ctx, id) {
  return withTx(async (db) => {
    const { rows: [d] } = await db.query(
      `${SELECT} where d.id = $1`, [id]);
    if (!d) throw notFound();
    const { rows: rolls } = await db.query(
      `select dr.roll_id, r.roll_no, i.name as item, i.colour, dr.length_m, r.weight_kg, dr.scanned_at
         from dispatch_rolls dr left join rolls r on r.id = dr.roll_id left join items i on i.id = r.item_id
        where dr.dispatch_id = $1 order by dr.scanned_at, r.roll_no`, [id]);
    return { ...d, rolls, totals: await dispatchTotals(db, d) };
  });
}

async function lockOwnDispatch(db, ctx, id) {
  const { rows: [d] } = await db.query(`select * from dispatches where id = $1 for update`, [id]);
  if (!d) throw notFound();
  return d;
}

/** Scan a roll (its number or QR token) onto a dispatch that is still being packed. */
export async function scanRoll(ctx, dispatchId, { code }, { at = new Date() } = {}) {
  return withTx(async (db) => {
    const d = await lockOwnDispatch(db, ctx, dispatchId);
    if (d.status !== 'packing') throw new AppError(409, 'INVALID_STATE_TRANSITION', `Dispatch ${d.dispatch_no} is ${d.status} and can no longer be changed`);

    const { rows: [roll] } = await db.query(
      `select * from rolls where roll_no = $1 or qr_token = $1 for update`, [code]);
    if (!roll) throw new AppError(404, 'NOT_FOUND', `No roll matches "${code}"`);
    if (roll.order_id !== d.order_id) throw new AppError(409, 'ROLL_WRONG_ORDER', `Roll ${roll.roll_no} belongs to another order`);
    const { rows: [taken] } = await db.query(
      `select d2.dispatch_no from dispatch_rolls dr join dispatches d2 on d2.id = dr.dispatch_id where dr.roll_id = $1`, [roll.id]);
    if (roll.status === 'dispatched' || taken) {
      throw new AppError(409, 'ROLL_ALREADY_DISPATCHED', `Roll ${roll.roll_no} is already in dispatch ${taken?.dispatch_no ?? 'a confirmed dispatch'}`);
    }
    if (!['passed', 'packed'].includes(roll.status)) throw new AppError(409, 'ROLL_NOT_PASSED', `Roll ${roll.roll_no} has not passed QC (${roll.status})`);

    const before = await dispatchTotals(db, d);
    if (before.earlier + before.scanned + Number(roll.length_m) > before.ordered * 1.05) {            // 5% tolerance
      throw new AppError(409, 'QTY_EXCEEDS_ORDER', `Roll ${roll.roll_no} would exceed the ordered quantity`);
    }
    try {
      await db.query(
        `insert into dispatch_rolls (dispatch_id, roll_id, length_m, scanned_at) values ($1, $2, $3, $4)`,
        [d.id, roll.id, roll.length_m, at]);
    } catch (err) {                                          // two scanners racing for the same roll: the unique(roll_id) constraint decides
      if (err.code === '23505') throw new AppError(409, 'ROLL_ALREADY_DISPATCHED', `Roll ${roll.roll_no} is already in another dispatch`);
      throw err;
    }
    await db.query(`update rolls set status = 'packed' where id = $1`, [roll.id]);
    return {
      roll_no: roll.roll_no, length_m: Number(roll.length_m), scanned_total: before.scanned + Number(roll.length_m),
      ordered: before.ordered, remaining: before.ordered - before.earlier - before.scanned - Number(roll.length_m),
    };
  });
}

/** Take a scanned roll off a dispatch that is still being packed; the roll goes back to passed. */
export async function removeRoll(ctx, dispatchId, rollId) {
  await withTx(async (db) => {
    const d = await lockOwnDispatch(db, ctx, dispatchId);
    if (d.status !== 'packing') throw new AppError(409, 'INVALID_STATE_TRANSITION', `Dispatch ${d.dispatch_no} is ${d.status}; rolls can only be removed while packing`);
    const { rowCount } = await db.query(`delete from dispatch_rolls where dispatch_id = $1 and roll_id = $2`, [d.id, rollId]);
    if (!rowCount) throw new AppError(404, 'NOT_FOUND', 'That roll is not on this dispatch');
    await db.query(`update rolls set status = 'passed' where id = $1 and status = 'packed'`, [rollId]);
  });
  return getDispatch(ctx, dispatchId);
}

const NEXT_STATUS = { confirmed: ['in_transit', 'delivered'], in_transit: ['delivered'] };

/** The mill moves a dispatch along: confirmed → in_transit → delivered. */
export async function updateStatus(ctx, dispatchId, status, { at = new Date() } = {}) {
  const d = await withTx(async (db) => {
    const row = await lockOwnDispatch(db, ctx, dispatchId);
    if (!NEXT_STATUS[row.status]?.includes(status)) throw new AppError(409, 'INVALID_STATE_TRANSITION', `Dispatch ${row.dispatch_no} is ${row.status}; it cannot go to ${status}`);
    await db.query(`update dispatches set status = $2, delivered_at = $3 where id = $1`, [row.id, status, status === 'delivered' ? at : null]);
    if (status === 'delivered') await markRollsDelivered(db, row.id, [], at);
    return row;
  });
  if (status === 'delivered') bus.emit('dispatch.received', { dispatchId, orderId: d.order_id });
  return getDispatch(ctx, dispatchId);
}

/** Everything the packing list PDF needs. */
export async function packingListData(ctx, dispatchId) {
  const d = await getDispatch(ctx, dispatchId);
  return withTx(async (db) => ({
    dispatch: d, order: { order_no: d.order_no },
    seller: await loadMillParty(db),
    buyer: await loadContact(db, d.to_contact_id),
    rolls: d.rolls.map((r) => ({ roll_no: r.roll_no, item: r.item, colour: r.colour, length_m: r.length_m, weight_kg: r.weight_kg })),
  }));
}
