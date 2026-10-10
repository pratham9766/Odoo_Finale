import { on } from '../bus.js';
import { withSystem } from '../../db/withTenant.js';
import { notify } from '../../modules/notifications/notify.js';
import email from '../../utils/email.js';

// Notifications fan out per event (event catalog §12). Each handler writes into the
// RECEIVING org's tenant via withSystem(), never into the emitter's.

const orgName = async (db, id) => (await db.query('select name from organizations where id = $1', [id])).rows[0]?.name;

// owners/managers of an org who hold a permission, for e-mail
async function emailsWithPermission(db, orgId, perm) {
  const { rows } = await db.query(
    `select distinct p.email from memberships m
       join role_permissions rp on rp.role_id = m.role_id and rp.permission_key = $2
       join profiles p on p.id = m.user_id
      where m.org_id = $1 and m.status = 'active' and p.email is not null`,
    [orgId, perm]);
  return rows.map((r) => r.email);
}

export function registerNotifier() {
  on('org.created', ({ orgId }) =>
    withSystem(orgId, (db) => notify(db, { orgId, type: 'welcome', title: 'Welcome to TexLink', body: 'Your organization is ready. Start by inviting your team and adding items.', link: '/settings' })));

  on('partner.requested', async ({ requesterOrgId, targetOrgId }) => {
    const name = await withSystem(requesterOrgId, (db) => orgName(db, requesterOrgId));
    await withSystem(targetOrgId, (db) => notify(db, { orgId: targetOrgId, requiredPermission: 'partners.approve', type: 'partner.requested', title: `${name ?? 'An organization'} wants to connect`, link: '/partners' }));
  });

  on('partner.accepted', async ({ requesterOrgId, targetOrgId }) => {
    const name = await withSystem(targetOrgId, (db) => orgName(db, targetOrgId));
    await withSystem(requesterOrgId, (db) => notify(db, { orgId: requesterOrgId, requiredPermission: 'partners.view', type: 'partner.accepted', title: `${name ?? 'Partner'} accepted your connection`, link: '/partners' }));
  });

  // buyer-placed order -> tell the seller's sales team
  on('order.created', async ({ orderId, sellerOrgId, buyerOrgId, byOrgId }) => {
    if (!buyerOrgId || byOrgId === sellerOrgId) return;
    const name = await withSystem(buyerOrgId, (db) => orgName(db, buyerOrgId));
    await withSystem(sellerOrgId, (db) => notify(db, { orgId: sellerOrgId, requiredPermission: 'orders.confirm', type: 'order.created', title: `New order request from ${name}`, link: `/orders/${orderId}`, data: { orderId } }));
  });

  // key statuses -> buyer notification + e-mail
  const KEY_STATUS = new Set(['confirmed', 'material_ready', 'in_production', 'ready_to_ship', 'partially_dispatched', 'dispatched', 'delivered']);
  const MAIL_STATUS = new Set(['ready_to_ship', 'dispatched']);
  on('order.status_changed', async ({ orderId, sellerOrgId, buyerOrgId, orderNo, to }) => {
    if (!buyerOrgId || !KEY_STATUS.has(to)) return;
    const mill = await withSystem(sellerOrgId, (db) => orgName(db, sellerOrgId));
    const pretty = to.replace(/_/g, ' ');
    const mails = await withSystem(buyerOrgId, async (db) => {
      await notify(db, { orgId: buyerOrgId, requiredPermission: 'orders.view', type: 'order.status', title: `Order ${orderNo} is ${pretty}`, body: `Supplier: ${mill}`, link: `/orders/${orderId}` });
      return MAIL_STATUS.has(to) ? emailsWithPermission(db, buyerOrgId, 'orders.view') : [];
    });
    if (mails.length) {
      await email.send({ to: mails, template: 'order_status', data: { order_no: orderNo, mill_name: mill, status: to } });
    }
  });

  on('po.sent', async ({ poId, poNo, buyerOrgId, supplierOrgId }) => {
    if (!supplierOrgId) return;
    const name = await withSystem(buyerOrgId, (db) => orgName(db, buyerOrgId));
    await withSystem(supplierOrgId, (db) => notify(db, { orgId: supplierOrgId, requiredPermission: 'po.respond', type: 'po.sent', title: `Purchase order ${poNo} from ${name}`, link: `/purchase-orders/${poId}` }));
  });

  on('po.responded', async ({ poId, poNo, buyerOrgId, status }) => {
    await withSystem(buyerOrgId, (db) => notify(db, { orgId: buyerOrgId, requiredPermission: 'po.view', type: 'po.responded', title: `PO ${poNo} ${status.replace(/_/g, ' ')}`, link: `/purchase-orders/${poId}` }));
  });

  // trips: the transporter hears about new requests; sender and receiver follow the key milestones
  const TRIP_MILESTONES = new Set(['accepted', 'rejected', 'assigned', 'picked_up', 'reached', 'delivered']);
  on('trip.status_changed', async ({ tripId, tripNo, status, transporterOrgId, requesterOrgId, receiverOrgId }) => {
    if (status === 'requested') {
      return withSystem(transporterOrgId, (db) => notify(db, { orgId: transporterOrgId, requiredPermission: 'transport.manage', type: 'trip.requested', title: `New trip request ${tripNo}`, link: `/transport/trips/${tripId}` }));
    }
    if (!TRIP_MILESTONES.has(status)) return;
    for (const orgId of new Set([requesterOrgId, receiverOrgId].filter(Boolean))) {
      await withSystem(orgId, (db) => notify(db, { orgId, requiredPermission: 'dispatch.view', type: 'trip.status', title: `Trip ${tripNo} ${status.replace(/_/g, ' ')}`, link: `/trips/${tripId}` }));
    }
  });

  // supplier shipped a PO: the mill's receiving team gets the delivery OTP (shown to the driver on arrival)
  on('supply.dispatched', async ({ dispatchId, dispatchNo, poNo, supplierOrgId, buyerOrgId, otp }) => {
    const name = await withSystem(supplierOrgId, (db) => orgName(db, supplierOrgId));
    await withSystem(buyerOrgId, (db) => notify(db, {
      orgId: buyerOrgId, requiredPermission: 'receipt.create', type: 'supply.dispatched',
      title: `${name} dispatched ${poNo} (${dispatchNo})`, body: otp ? `Delivery OTP: ${otp}` : null, link: `/gate/expected`, data: { dispatchId },
    }));
  });

  on('stock.low', ({ orgId, itemId, itemName, available, reorderLevel }) =>
    withSystem(orgId, (db) => notify(db, { orgId, requiredPermission: 'stock.view', type: 'stock.low', title: `Low stock: ${itemName}`, body: `Available ${available}, reorder level ${reorderLevel}`, link: `/stock?item=${itemId}` })));
}
