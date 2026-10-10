// Confirm & invoice (backend plan §11.10): one transaction turns a packed dispatch into a sent one, an invoice and (with a
// transporter) a trip request with a delivery OTP. The OTP is never returned to the mill: it only travels in the event, to the buyer.

import { randomUUID } from 'node:crypto';
import { withTenant } from '../../db/withTenant.js';
import { bus } from '../../events/bus.js';
import { AppError } from '../../utils/errors.js';
import { nextNumber } from '../../utils/numbering.js';
import { generateOtp, hashOtp } from '../../utils/otp.js';
import { createInvoiceFromDispatch } from '../finance/invoicing.service.js';
import { getDispatch } from './dispatches.service.js';
import { scannedRolls } from './dispatchSupport.js';

/** The trip request for the transporter, with its first event and the hashed OTP. Returns the OTP once, for the event. */
async function createTrip(db, ctx, dispatch, rolls, at) {
  const { rows: [org] } = await db.query(`select connect_code, address from organizations where id = $1`, [ctx.orgId]);
  const { rows: [order] } = await db.query(`select delivery_address from orders where id = $1`, [dispatch.order_id]);
  const tripId = randomUUID();
  const otp = generateOtp();
  // trip numbers are unique per transporter, who works for many mills: the mill's connect code keeps ours apart
  const tripNo = `${org.connect_code}-${await nextNumber(db, ctx.orgId, 'TRP')}`;

  await db.query(
    `insert into trips (id, trip_no, dispatch_id, transporter_org_id, requester_org_id, receiver_org_id, pickup_address, drop_address,
                        roll_count, weight_kg, status, otp_hash, created_at)
     values ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, 'requested', $11, $12)`,
    [tripId, tripNo, dispatch.id, dispatch.transporter_org_id, ctx.orgId, dispatch.to_org_id, org.address, order?.delivery_address ?? null,
     rolls.length, rolls.reduce((sum, r) => sum + Number(r.weight_kg ?? 0), 0) || null, hashOtp(tripId, otp), at]);
  await db.query(
    `insert into trip_events (trip_id, transporter_org_id, requester_org_id, receiver_org_id, status, at, created_by)
     values ($1, $2, $3, $4, 'requested', $5, $6)`, [tripId, dispatch.transporter_org_id, ctx.orgId, dispatch.to_org_id, at, ctx.userId]);
  return { id: tripId, otp };
}

/** @returns {Promise<{ dispatch, invoice_id: string, trip_id: string|null }>} */
export async function confirmDispatch(ctx, dispatchId, { at = new Date() } = {}) {
  const { dispatch, invoice, trip } = await withTenant(ctx, async (db) => {
    const { rows: [dispatch] } = await db.query(`select * from dispatches where id = $1 and from_org_id = $2 for update`, [dispatchId, ctx.orgId]);
    if (!dispatch) throw new AppError(404, 'NOT_FOUND', 'Dispatch not found');
    if (dispatch.status !== 'packing') throw new AppError(409, 'INVALID_STATE_TRANSITION', `Dispatch ${dispatch.dispatch_no} is already ${dispatch.status}`);

    const rolls = await scannedRolls(db, dispatch.id);
    if (!rolls.length) throw new AppError(422, 'VALIDATION_FAILED', 'Scan at least one roll before confirming the dispatch');

    await db.query(`update dispatches set status = 'confirmed', confirmed_at = $2 where id = $1`, [dispatch.id, at]);
    await db.query(`update rolls set status = 'dispatched' where id = any($1::uuid[])`, [rolls.map((r) => r.id)]);
    await db.query(
      `insert into roll_history (org_id, roll_id, event, data, at)
       select $1, r, 'dispatched', $2, $3 from unnest($4::uuid[]) as r`,
      [ctx.orgId, JSON.stringify({ dispatch_no: dispatch.dispatch_no }), at, rolls.map((r) => r.id)]);

    const invoice = await createInvoiceFromDispatch(db, ctx, dispatch, at);
    const trip = dispatch.transporter_org_id ? await createTrip(db, ctx, dispatch, rolls, at) : null;
    return { dispatch, invoice, trip };
  });

  bus.emit('dispatch.confirmed', {
    dispatchId, sellerOrgId: ctx.orgId, buyerOrgId: dispatch.to_org_id, tripId: trip?.id ?? null, otp: trip?.otp ?? null,
  });
  return { dispatch: await getDispatch(ctx, dispatchId), invoice_id: invoice.id, trip_id: trip?.id ?? null };
}
