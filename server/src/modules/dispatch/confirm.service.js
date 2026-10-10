// Confirm & invoice: one transaction turns a packed dispatch into a sent one and an invoice made from its rolls.

import { withTx } from '../../db/tx.js';
import { bus } from '../../events/bus.js';
import { AppError } from '../../utils/errors.js';
import { createInvoiceFromDispatch } from '../finance/invoicing.service.js';
import { getDispatch } from './dispatches.service.js';
import { scannedRolls } from './dispatchSupport.js';

/** @returns {Promise<{ dispatch, invoice_id: string }>} */
export async function confirmDispatch(ctx, dispatchId, { at = new Date() } = {}) {
  const { dispatch, invoice } = await withTx(async (db) => {
    const { rows: [dispatch] } = await db.query(`select * from dispatches where id = $1 for update`, [dispatchId]);
    if (!dispatch) throw new AppError(404, 'NOT_FOUND', 'Dispatch not found');
    if (dispatch.status !== 'packing') throw new AppError(409, 'INVALID_STATE_TRANSITION', `Dispatch ${dispatch.dispatch_no} is already ${dispatch.status}`);

    const { rows: lockedRolls } = await db.query(
      `select r.id, r.roll_no, r.status, r.order_id, r.weight_kg, dr.length_m 
       from dispatch_rolls dr 
       join rolls r on r.id = dr.roll_id 
       where dr.dispatch_id = $1 
       order by r.roll_no for update`, [dispatch.id]);

    if (!lockedRolls.length) throw new AppError(422, 'VALIDATION_FAILED', 'Scan at least one roll before confirming the dispatch');

    for (const r of lockedRolls) {
      if (r.order_id !== dispatch.order_id) {
        throw new AppError(409, 'ROLL_WRONG_ORDER', `Roll ${r.roll_no} belongs to another order`);
      }
      if (!['passed', 'packed'].includes(r.status)) {
        throw new AppError(409, 'INVALID_ROLL_STATE', `Roll ${r.roll_no} has an invalid status (${r.status}) for dispatch`);
      }
    }

    const { rows: [totals] } = await db.query(
      `select (select coalesce(sum(length_m), 0) from dispatch_rolls where dispatch_id = $1)::float as scanned,
              (select coalesce(sum(qty), 0) from order_lines where order_id = $2)::float as ordered,
              (select coalesce(sum(dr.length_m), 0) from dispatch_rolls dr join dispatches d2 on d2.id = dr.dispatch_id
                where d2.order_id = $2 and d2.status <> 'cancelled' and d2.id <> $1)::float as earlier`, [dispatch.id, dispatch.order_id]);
    
    if (totals.earlier + totals.scanned > totals.ordered * 1.05) {
      throw new AppError(409, 'QTY_EXCEEDS_ORDER', `Confirmed quantity would exceed the ordered quantity`);
    }

    await db.query(`update dispatches set status = 'confirmed', confirmed_at = $2 where id = $1`, [dispatch.id, at]);
    await db.query(`update rolls set status = 'dispatched' where id = any($1::uuid[])`, [lockedRolls.map((r) => r.id)]);
    const rolls = lockedRolls;
    await db.query(
      `insert into roll_history (roll_id, event, data, at)
       select r, 'dispatched', $1, $2 from unnest($3::uuid[]) as r`,
      [JSON.stringify({ dispatch_no: dispatch.dispatch_no }), at, rolls.map((r) => r.id)]);

    const invoice = await createInvoiceFromDispatch(db, ctx, dispatch, at);
    return { dispatch, invoice };
  });

  bus.emit('dispatch.confirmed', { dispatchId, orderId: dispatch.order_id });
  return { dispatch: await getDispatch(ctx, dispatchId), invoice_id: invoice.id };
}
