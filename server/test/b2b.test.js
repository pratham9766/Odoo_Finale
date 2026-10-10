import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { makeUser, makeOrg, as, cleanup, waitFor, sqlAdmin } from './helpers.js';

// mill ⇄ supplier ⇄ transporter ⇄ driver: PO → supplier dispatch → trip → OTP delivery → freight invoice
let U = {}, O = {}, A = {}, ids = {}, otp;

const code = async (u, org) => (await as(u).get(`/me/orgs/${org.id}/context`)).body.data.org.connect_code;
async function connect(fromKey, toKey, relation) {
  const r = await A[fromKey].post('/partners/connect-code', { code: await code(U[toKey], O[toKey]), relation });
  assert.equal(r.status, 201, JSON.stringify(r.body));
  const incoming = (await A[toKey].get('/partners')).body.data.find((p) => p.id === r.body.data.id);
  assert.ok(incoming);
  assert.equal((await A[toKey].post(`/partners/${incoming.id}/accept`)).status, 200);
}

before(async () => {
  for (const k of ['mill', 'sup', 'tr', 'drv']) U[k] = await makeUser(k);
  O.mill = await makeOrg(U.mill, 'B2B Mill');
  O.sup = await makeOrg(U.sup, 'B2B Yarn Supplier', ['supplier']);
  O.tr = await makeOrg(U.tr, 'B2B Logistics', ['transporter']);
  for (const k of ['mill', 'sup', 'tr']) A[k] = as(U[k], O[k].id);
  await connect('mill', 'sup', 'supplier'); // the supplier supplies the mill
  await connect('sup', 'tr', 'transporter'); // the transporter carries for the supplier

  ids.yarn = (await A.mill.post('/items', { kind: 'yarn', name: 'Cone Yarn', uom: 'kg' })).body.data.id;
  // driver logs in as staff of the transporter with the Driver role
  const roles = (await A.tr.get('/roles')).body.data;
  const inv = await A.tr.post('/staff/invites', { email: U.drv.email, role_id: roles.find((r) => r.name === 'Driver').id });
  assert.equal((await as(U.drv).post(`/me/invites/staff/${inv.body.data.link.split('/').pop()}/accept`)).status, 200);
  A.drv = as(U.drv, O.tr.id);
});
after(cleanup);

test('mill raises a PO to the connected supplier; the supplier accepts', async () => {
  const po = await A.mill.post('/purchase-orders', { supplier_org_id: O.sup.id, lines: [{ item_id: ids.yarn, qty: 100, rate: 250 }] });
  assert.equal(po.status, 201, JSON.stringify(po.body));
  ids.po = po.body.data.id;
  assert.equal((await A.mill.post(`/purchase-orders/${ids.po}/send`)).body.data.status, 'sent');
  // the supplier sees it on its incoming side, with the item name snapshot
  const inc = await A.sup.get('/purchase-orders?side=incoming');
  assert.equal(inc.body.data.length, 1);
  const detail = (await A.sup.get(`/purchase-orders/${ids.po}`)).body.data;
  assert.equal(detail.lines[0].description, 'Cone Yarn');
  ids.line = detail.lines[0].id;
  // the mill cannot answer for a connected supplier
  assert.equal((await A.mill.post(`/purchase-orders/${ids.po}/respond`, { action: 'accept' })).status, 403);
  const res = await A.sup.post(`/purchase-orders/${ids.po}/respond`, { action: 'partial', lines: [{ po_line_id: ids.line, accepted_qty: 80 }] });
  assert.equal(res.body.data.status, 'partially_accepted');
});

test('supplier cannot dispatch more than it accepted', async () => {
  const res = await A.sup.post(`/purchase-orders/${ids.po}/dispatch`, { lots: [{ po_line_id: ids.line, lot_no: 'L1', qty: 90 }] });
  assert.equal(res.status, 409);
  assert.equal(res.body.error.code, 'QTY_EXCEEDS_ORDER');
});

test('supplier dispatches through the transporter → trip request', async () => {
  const res = await A.sup.post(`/purchase-orders/${ids.po}/dispatch`, {
    lots: [{ po_line_id: ids.line, lot_no: 'L1', qty: 80, colour: 'Grey' }], transporter_org_id: O.tr.id,
  });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  assert.equal(res.body.data.trip.status, 'requested');
  assert.equal(res.body.data.trip.otp_hash, undefined);
  ids.dispatch = res.body.data.id;
  assert.equal((await A.mill.get(`/purchase-orders/${ids.po}`)).body.data.status, 'dispatched');
  // the mill's receiving team gets the OTP via notification
  otp = await waitFor(async () => {
    const n = (await A.mill.get('/notifications')).body.data.find((x) => x.type === 'supply.dispatched');
    return n?.body?.match(/OTP: (\d{4})/)?.[1];
  });
  // the transporter was told about the request
  await waitFor(async () => (await A.tr.get('/notifications')).body.data.some((x) => x.type === 'trip.requested'));
});

test('transporter accepts, assigns a vehicle and the driver', async () => {
  const trips = (await A.tr.get('/transport/trips?status=requested')).body.data;
  assert.equal(trips.length, 1);
  ids.trip = trips[0].id;
  assert.equal((await A.mill.post(`/transport/trips/${ids.trip}/accept`)).status, 403); // mill has no transport.manage
  assert.equal((await A.tr.post(`/transport/trips/${ids.trip}/assign`, {})).status, 422);
  assert.equal((await A.tr.post(`/transport/trips/${ids.trip}/accept`)).body.data.status, 'accepted');
  const v = await A.tr.post('/transport/vehicles', { vehicle_no: 'mh 12 ab 1234', type: 'Truck' });
  assert.equal(v.body.data.vehicle_no, 'MH12AB1234');
  const d = await A.tr.post('/transport/drivers', { name: 'Ramesh', phone: '9999999999', user_email: U.drv.email });
  assert.equal(d.status, 201, JSON.stringify(d.body));
  const asg = await A.tr.post(`/transport/trips/${ids.trip}/assign`, { vehicle_id: v.body.data.id, driver_id: d.body.data.id });
  assert.equal(asg.body.data.status, 'assigned');
  assert.equal(asg.body.data.driver_name, 'Ramesh');
});

test('only the assigned driver sees the trip and statuses only move forward', async () => {
  const mine = (await A.drv.get('/driver/trips')).body.data;
  assert.deepEqual(mine.map((t) => t.id), [ids.trip]);
  assert.equal((await A.drv.post(`/driver/trips/${ids.trip}/status`, { status: 'in_transit' })).status, 200);
  const back = await A.drv.post(`/driver/trips/${ids.trip}/status`, { status: 'picked_up' });
  assert.equal(back.status, 409);
  assert.equal(back.body.error.code, 'INVALID_STATE_TRANSITION');
  // the transporter owner is not a driver: no driver rows, nothing to see
  assert.deepEqual((await A.tr.get('/driver/trips')).body.data, []);
});

test('mill (receiver) and supplier (sender) can follow the trip', async () => {
  const s = await A.sup.get(`/trips/${ids.trip}`);
  assert.equal(s.status, 200, JSON.stringify(s.body));
  assert.ok(s.body.data.events.length >= 3);
  assert.equal((await A.mill.get(`/trips/${ids.trip}`)).status, 200);
  const sold = (await sqlAdmin('select status from dispatches where id = $1', [ids.dispatch])).rows[0];
  assert.equal(sold.status, 'in_transit'); // set when the driver moved the trip on
});

test('wrong OTPs count down, then lock the trip; the right OTP is refused while locked', async () => {
  const wrong = otp === '0000' ? '1111' : '0000';
  const first = await A.drv.post(`/driver/trips/${ids.trip}/deliver`, { otp: wrong, receiver_name: 'Store' });
  assert.equal(first.status, 422);
  assert.equal(first.body.error.code, 'OTP_INVALID');
  assert.equal(first.body.error.details.remaining, 4);
  for (let i = 0; i < 3; i++) await A.drv.post(`/driver/trips/${ids.trip}/deliver`, { otp: wrong, receiver_name: 'Store' });
  const locking = await A.drv.post(`/driver/trips/${ids.trip}/deliver`, { otp: wrong, receiver_name: 'Store' });
  assert.equal(locking.status, 429);
  const stillLocked = await A.drv.post(`/driver/trips/${ids.trip}/deliver`, { otp, receiver_name: 'Store' });
  assert.equal(stillLocked.status, 429);
});

test('after the lock expires the right OTP delivers: dispatch delivered, event fired', async () => {
  await sqlAdmin('update trips set otp_locked_until = now() - interval \'1 minute\' where id = $1', [ids.trip]);
  const ok = await A.drv.post(`/driver/trips/${ids.trip}/deliver`, { otp, receiver_name: 'Gate Keeper' });
  assert.equal(ok.status, 200, JSON.stringify(ok.body));
  const d = (await sqlAdmin('select status, delivered_at from dispatches where id = $1', [ids.dispatch])).rows[0];
  assert.equal(d.status, 'delivered');
  assert.ok(d.delivered_at);
  const again = await A.drv.post(`/driver/trips/${ids.trip}/deliver`, { otp, receiver_name: 'x' });
  assert.equal(again.status, 409);
  await waitFor(async () => (await A.mill.get('/notifications')).body.data.some((x) => x.type === 'trip.status' && /delivered/.test(x.title)));
});

test('transporter raises one freight invoice that lands as a payable for the sender', async () => {
  const inv = await A.tr.post(`/transport/trips/${ids.trip}/freight-invoice`, { amount: 5000 });
  assert.equal(inv.status, 201, JSON.stringify(inv.body));
  assert.match(inv.body.data.invoice_no, /^FRT-\d{4}-0001$/);
  assert.equal(inv.body.data.tax, 250);
  assert.equal(inv.body.data.total, 5250);
  assert.equal(inv.body.data.buyer_org_id, O.sup.id);
  assert.equal((await A.tr.post(`/transport/trips/${ids.trip}/freight-invoice`, { amount: 5000 })).status, 409);
});
