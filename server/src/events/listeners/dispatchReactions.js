// What the rest of the network hears when a dispatch changes (backend plan §11.10, §12).

import { withSystem } from '../../db/withTenant.js';
import { markRollsDelivered } from '../../modules/dispatch/dispatchSupport.js';
import { notify } from '../../modules/notifications/notifications.service.js';
import { loadParty } from '../../modules/orgs/parties.js';
import * as email from '../../utils/email.js';
import { on } from '../bus.js';

/** dispatch.confirmed: the buyer gets "on the way" with the delivery OTP (nobody else does), the transporter gets the trip request. */
async function onConfirmed({ dispatchId, sellerOrgId, buyerOrgId, tripId, otp }) {
  const info = await withSystem(sellerOrgId, async (db) => {
    const { rows: [d] } = await db.query(
      `select d.dispatch_no, d.vehicle_no, d.driver_name, d.driver_phone, d.to_contact_id, d.transporter_org_id, s.name as mill
         from dispatches d join organizations s on s.id = d.from_org_id where d.id = $1`, [dispatchId]);
    return { ...d, buyer: await loadParty(db, { orgId: buyerOrgId, contactId: d.to_contact_id }) };
  });

  if (buyerOrgId) {
    await withSystem(buyerOrgId, (db) => notify(db, {
      orgId: buyerOrgId, requiredPermission: 'dispatch.view', type: 'delivery.on_the_way', link: '/buyer/deliveries',
      title: `Delivery ${info.dispatch_no} is on the way`,
      body: otp ? `Your delivery OTP is ${otp}. Give it to the driver only after you have received and checked the goods.` : 'Goods are on the way.',
    }));
  }
  if (otp && info.buyer?.email) {                                       // connected buyer's org email, or the offline buyer's contact email
    await email.send({ to: info.buyer.email, template: 'delivery_otp', data: {
      otp, dispatch_no: info.dispatch_no, mill_name: info.mill, vehicle_no: info.vehicle_no, driver_name: info.driver_name, driver_phone: info.driver_phone } });
  }
  if (tripId && info.transporter_org_id) {
    await withSystem(info.transporter_org_id, (db) => notify(db, {
      orgId: info.transporter_org_id, requiredPermission: 'transport.manage', type: 'trip.requested', link: '/transport/trips',
      title: `New trip request from ${info.mill}`, body: `Dispatch ${info.dispatch_no}`,
    }));
  }
}

/** dispatch.received: the seller's side of a delivery the buyer confirmed (rolls delivered, timeline, a note to the sales team). */
async function onReceived({ dispatchId, orderId, sellerOrgId, buyerOrgId, issueRollIds, note, disputed }) {
  if (!buyerOrgId) return;                                              // the mill's own delivery update already did all of this
  await withSystem(sellerOrgId, async (db) => {
    await markRollsDelivered(db, sellerOrgId, dispatchId, issueRollIds, new Date());
    const { rows: [d] } = await db.query(`select dispatch_no from dispatches where id = $1`, [dispatchId]);
    await db.query(
      `insert into order_events (order_id, seller_org_id, buyer_org_id, event, visible_to_buyer, data)
       values ($1, $2, $3, $4, true, $5)`,
      [orderId, sellerOrgId, buyerOrgId, disputed ? 'delivery_disputed' : 'delivery_received', JSON.stringify({ dispatch_no: d.dispatch_no, rolls_reported: issueRollIds.length, note })]);
    await notify(db, {
      orgId: sellerOrgId, requiredPermission: 'dispatch.view', type: disputed ? 'dispatch.disputed' : 'dispatch.received', link: `/app/dispatch/${dispatchId}`,
      title: disputed ? `Buyer reported a problem with ${d.dispatch_no}` : `Buyer confirmed delivery of ${d.dispatch_no}`,
      body: disputed ? `${issueRollIds.length} roll(s) short or damaged${note ? `: ${note}` : ''}` : null,
    });
  });
}

/** Called once by events/listeners/index.js at boot. */
export function registerDispatchReactions() {
  on('dispatch.confirmed', onConfirmed);
  on('dispatch.received', onReceived);
}
