// The connected side of the demo (overall plan §11.12, §20): a buyer, a yarn supplier and a transporter that have their own TexLink
// logins and are partnered with Everest, plus one pending request and the platform admin. The flows run through the real services
// at real time, so the portals open on live data: a buyer order, a supplier PO with goods on the road, a driver mid-trip.

import { createOrg } from '../../server/src/modules/auth/me.service.js';
import { loadContext } from '../../server/src/middleware/tenant.js';
import { acceptPartner, connectByCode } from '../../server/src/modules/partners/partners.service.js';
import { createOrder, confirmOrder } from '../../server/src/modules/orders/orders.service.js';
import { createPo, dispatchPo, respondPo, sendPo } from '../../server/src/modules/procurement/procurement.service.js';
import { acceptTrip, assignTrip, createDriver, createVehicle, driverStatus } from '../../server/src/modules/transport/transport.service.js';
import { createDefaultRoles } from '../../server/src/modules/staff/defaultRoles.js';
import { PROFILES } from './config.js';

export const B2B = {
  buyer: { email: 'buyer@metrofashion.demo', name: 'Neha Kapoor', org: { name: 'Metro Fashion Retail', types: ['buyer'], city: 'Mumbai', gstin: '27AAACM1122B1Z5' } },
  supplier: { email: 'sales@coimbatoreyarns.demo', name: 'Senthil Kumar', org: { name: 'Coimbatore Yarns Pvt Ltd', types: ['supplier'], city: 'Coimbatore', gstin: '33AAACC3344Y1Z1' } },
  transporter: { email: 'fleet@speedfreight.demo', name: 'Harpreet Gill', org: { name: 'SpeedFreight Carriers', types: ['transporter'], city: 'Surat', gstin: '24AAACS5566F1Z8' } },
  pending: { email: 'buy@delhidenim.demo', name: 'Aman Verma', org: { name: 'Delhi Denim House', types: ['buyer'], city: 'Delhi', gstin: '07AAACD7788D1Z2' } },
  driver: { email: 'driver@speedfreight.demo', name: 'Ramesh Yadav' },
  platformAdmin: { email: 'admin@texlink.demo', name: 'Platform Admin' },
};

const code = async (admin, orgId) => (await admin.query(`select connect_code from organizations where id = $1`, [orgId])).rows[0].connect_code;

/** requester asks target to connect; target accepts (unless `pending`). */
async function connect(admin, requesterCtx, targetCtx, relation, { pending = false } = {}) {
  const p = await connectByCode(requesterCtx, { code: await code(admin, targetCtx.orgId), relation });
  if (!pending) await acceptPartner(targetCtx, p.id);
}

/**
 * @param {{ query: Function }} admin  migration-role connection
 * @param {{ createUser: Function, log?: Function }} deps
 */
export async function seedB2B(admin, { createUser, log = () => {} }) {
  const user = async ({ email, name }) => ({ id: await createUser({ email, fullName: name }), email });
  const everestId = (await admin.query(`select id from organizations where name = $1`, [PROFILES.everest.org.name])).rows[0]?.id;
  if (!everestId) throw new Error('Run seed v1 first (Everest is missing)');
  const ownerId = (await admin.query(`select id from auth.users where email = 'owner@everest.demo'`)).rows[0].id;
  const purchaseId = (await admin.query(`select id from auth.users where email = 'purchase@everest.demo'`)).rows[0].id;
  const mill = await loadContext(everestId, ownerId);
  const millPurchase = await loadContext(everestId, purchaseId);

  // organizations (onboarding exactly as POST /me/orgs does it)
  const ctx = {};
  for (const key of ['buyer', 'supplier', 'transporter', 'pending']) {
    const u = await user(B2B[key]);
    await admin.query(`insert into profiles (id, email, full_name) values ($1, $2, $3) on conflict (id) do update set email = excluded.email, full_name = excluded.full_name`, [u.id, u.email, B2B[key].name]);
    const org = await createOrg(u, { ...B2B[key].org, email: u.email });
    ctx[key] = await loadContext(org.id, u.id);
  }
  // the driver is staff of the transporter with the Driver role
  const driver = await user(B2B.driver);
  await admin.query(`insert into profiles (id, email, full_name) values ($1, $2, $3) on conflict (id) do update set email = excluded.email`, [driver.id, driver.email, B2B.driver.name]);
  const { rows: [driverRole] } = await admin.query(`select id from roles where org_id = $1 and name = 'Driver'`, [ctx.transporter.orgId]);
  await admin.query(`insert into memberships (org_id, user_id, role_id) values ($1, $2, $3)`, [ctx.transporter.orgId, driver.id, driverRole.id]);
  const driverCtx = await loadContext(ctx.transporter.orgId, driver.id);

  // platform admin (no org)
  const pa = await user(B2B.platformAdmin);
  await admin.query(`insert into profiles (id, email, full_name, is_platform_admin) values ($1, $2, $3, true)
                     on conflict (id) do update set is_platform_admin = true`, [pa.id, pa.email, B2B.platformAdmin.name]);

  // partnerships: buyer → mill (mill supplies), mill → supplier, mill → transporter, supplier → transporter, one pending request
  await connect(admin, ctx.buyer, mill, 'supplier');
  await connect(admin, mill, ctx.supplier, 'supplier');
  await connect(admin, mill, ctx.transporter, 'transporter');
  await connect(admin, ctx.supplier, ctx.transporter, 'transporter');
  await connect(admin, ctx.pending, mill, 'supplier', { pending: true });

  // the buyer orders from the mill's sellable catalog; the mill confirms
  await admin.query(`update items set sellable = true where org_id = $1 and kind = 'finished_fabric'`, [everestId]);
  const fabrics = (await admin.query(
    `select id, uom, std_rate::float as rate from items where org_id = $1 and kind = 'finished_fabric' order by sku limit 2`, [everestId])).rows;
  const deadline = new Date(Date.now() + 18 * 86_400_000).toISOString().slice(0, 10);
  const order = await createOrder(ctx.buyer, {
    seller_org_id: everestId, deadline, buyer_ref: 'MFR/PO/2291', priority: 'high',
    lines: fabrics.map((f, i) => ({ item_id: f.id, qty: i ? 300 : 450, uom: f.uom, rate: Math.round(f.rate * 1.18) })),
  });
  await confirmOrder(mill, order.id);

  // the mill buys yarn from the connected supplier; the supplier ships two lots through SpeedFreight
  const yarns = (await admin.query(
    `select id, std_rate::float as rate from items where org_id = $1 and kind = 'yarn' order by sku limit 2`, [everestId])).rows;
  const fleet = [await createVehicle(ctx.transporter, { vehicle_no: 'GJ05AX4821', type: '14 ft truck', capacity_kg: 7000 }),
    await createVehicle(ctx.transporter, { vehicle_no: 'GJ05BT9134', type: '19 ft truck', capacity_kg: 9000 })];
  const driverRow = await createDriver(ctx.transporter, { name: B2B.driver.name, phone: '9825012345', licence_no: 'GJ05 20190012345', user_email: driver.email });
  const otherDriver = await createDriver(ctx.transporter, { name: 'Kuldeep Singh', phone: '9824098765', licence_no: 'GJ05 20170067890' });

  for (const [i, y] of yarns.entries()) {
    const po = await createPo(millPurchase, { supplier_org_id: ctx.supplier.orgId, lines: [{ item_id: y.id, qty: 400 + 100 * i, rate: Math.round(y.rate * 0.98) }] });
    await sendPo(millPurchase, po.id);
    await respondPo(ctx.supplier, po.id, { action: 'accept', promise_date: deadline });
    const full = (await admin.query(`select id, qty::float as qty from po_lines where po_id = $1`, [po.id])).rows[0];
    const shipped = await dispatchPo(ctx.supplier, po.id, {
      lots: [{ po_line_id: full.id, lot_no: `CY-${24051 + i}`, qty: full.qty }], transporter_org_id: ctx.transporter.orgId,
    });
    const trip = shipped.trip;
    await acceptTrip(ctx.transporter, trip.id);
    await assignTrip(ctx.transporter, trip.id, { vehicle_id: fleet[i].id, driver_id: (i ? otherDriver : driverRow).id,
      eta: new Date(Date.now() + (6 + 10 * i) * 3_600_000).toISOString() });
    if (i === 0) await driverStatus(driverCtx, trip.id, { status: 'in_transit' });      // the demo driver is on the road
    else {
      await admin.query(`update trips set status = 'in_transit' where id = $1`, [trip.id]);
      await admin.query(`update dispatches set status = 'in_transit' where id = $1`, [shipped.id]);
    }
  }
  log(`B2B: ${Object.values(B2B).filter((b) => b.org).length} partner orgs, 1 buyer order, 2 supplier trips in transit, platform admin ${B2B.platformAdmin.email}`);
  return { orgs: Object.fromEntries(Object.entries(ctx).map(([k, c]) => [k, c.orgId])) };
}

export { createDefaultRoles };
