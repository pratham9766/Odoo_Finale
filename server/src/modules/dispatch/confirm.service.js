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

    const rolls = await scannedRolls(db, dispatch.id);
    if (!rolls.length) throw new AppError(422, 'VALIDATION_FAILED', 'Scan at least one roll before confirming the dispatch');

    await db.query(`update dispatches set status = 'confirmed', confirmed_at = $2 where id = $1`, [dispatch.id, at]);
    await db.query(`update rolls set status = 'dispatched' where id = any($1::uuid[])`, [rolls.map((r) => r.id)]);
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
