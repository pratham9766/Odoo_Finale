import { withSystem } from '../../db/withTenant.js';
import { nextNumber } from '../../utils/numbering.js';
import { newOtp, otpHash } from '../../utils/otp.js';
import { bus } from '../../events/bus.js';

/**
 * Contract for the dispatch module (called inside dispatch confirm, §11.10 step 3):
 *   createTripForDispatch(db, ctx, { dispatch, transporterOrgId, pickupAddress?, dropAddress?, rollCount?, weightKg? })
 * `db` runs in the SENDER's tenant. The trip number comes from the transporter's own counter, so it is
 * reserved in a separate transaction first. Returns { trip, otp }: the plain OTP must go only to the
 * receiving buyer (dispatch.confirmed listener); only its hash is stored.
 * Emit `trip.requested` after the surrounding transaction commits (the returned `emitRequested()` does it).
 */
export async function createTripForDispatch(db, ctx, { dispatch, transporterOrgId, pickupAddress = null, dropAddress = null, rollCount = null, weightKg = null }) {
  const tripNo = await withSystem(transporterOrgId, (tdb) => nextNumber(tdb, transporterOrgId, 'TRP'));
  const { rows: [probe] } = await db.query('select gen_random_uuid() as id'); // trip id is needed before insert to hash the OTP
  const otp = newOtp();
  const { rows: [trip] } = await db.query(
    `insert into trips (id, trip_no, dispatch_id, transporter_org_id, requester_org_id, receiver_org_id,
                        pickup_address, drop_address, roll_count, weight_kg, otp_hash)
     values ($1,$2,$3,$4,$5,$6,$7,$8,$9,$10,$11) returning *`,
    [probe.id, tripNo, dispatch.id, transporterOrgId, dispatch.from_org_id, dispatch.to_org_id ?? null,
     pickupAddress, dropAddress, rollCount, weightKg, otpHash(probe.id, otp)]);
  await db.query(
    `insert into trip_events (trip_id, transporter_org_id, requester_org_id, receiver_org_id, status, created_by)
     values ($1,$2,$3,$4,'requested',$5)`, [trip.id, transporterOrgId, trip.requester_org_id, trip.receiver_org_id, ctx.userId ?? null]);
  return {
    trip: { ...trip, otp_hash: undefined },
    otp,
    emitRequested: () => bus.emit('trip.status_changed', tripEventPayload(trip, 'requested')),
  };
}

export const tripEventPayload = (trip, status) => ({
  tripId: trip.id, tripNo: trip.trip_no, dispatchId: trip.dispatch_id, status,
  transporterOrgId: trip.transporter_org_id, requesterOrgId: trip.requester_org_id, receiverOrgId: trip.receiver_org_id,
});
