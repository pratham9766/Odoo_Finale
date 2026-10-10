import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { makeUser, makeOrg, as, cleanup, sqlAdmin, rand, waitFor } from './helpers.js';

// Scan-to-dispatch (plan §11.10): a roll can go on exactly one dispatch, only after QC, only for its own order, never beyond the
// ordered quantity, and confirming bills exactly the metres that were scanned.
let owner, org, A, ids = {};
const tomorrow = () => new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10);

async function makeOrder(qty, rate = 10) {
  const res = await A.post('/orders', { seller_org_id: org.id, buyer_contact_id: ids.buyer, deadline: tomorrow(), lines: [{ item_id: ids.fabric, qty, uom: 'm', rate }] });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  const order = res.body.data;
  await sqlAdmin(`update orders set status = 'ready_to_ship' where id = $1`, [order.id]);   // production/QC are covered elsewhere
  return { id: order.id, lineId: order.lines[0].id };
}

async function makeRolls(order, lengths, status = 'passed') {
  const out = [];
  for (const [i, len] of lengths.entries()) {
    const roll_no = `R-${rand()}-${i}`;
    const r = (await sqlAdmin(
      `insert into rolls (org_id, roll_no, qr_token, order_id, order_line_id, item_id, work_order_id, length_m, status)
       values ($1,$2,$3,$4,$5,$6,$7,$8,$9) returning id`,
      [org.id, roll_no, `qr-${rand()}${rand()}`, order.id, order.lineId, ids.fabric, ids.wo, len, status])).rows[0];
    out.push({ id: r.id, roll_no, length_m: len });
  }
  return out;
}

const newDispatch = async (order) => {
  const res = await A.post('/dispatches', { order_id: order.id, vehicle_no: 'GJ05AB1234', driver_name: 'Raju', driver_phone: '9876543210' });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body.data;
};
const scan = (d, code) => A.post(`/dispatches/${d.id}/scan`, { code });

before(async () => {
  owner = await makeUser('disp');
  org = await makeOrg(owner, 'Dispatch Test Mills');
  A = as(owner, org.id);
  ids.buyer = (await A.post('/contacts', { type: 'buyer', name: 'Dispatch Buyer' })).body.data.id;
  ids.fabric = (await A.post('/items', { kind: 'finished_fabric', name: 'Test Poplin', uom: 'm', std_rate: 100 })).body.data.id;
  // a final-stage work order the rolls hang off
  const seed = (await A.post('/orders', { seller_org_id: org.id, buyer_contact_id: ids.buyer, deadline: tomorrow(), lines: [{ item_id: ids.fabric, qty: 10, uom: 'm', rate: 1 }] })).body.data;
  const stage = (await sqlAdmin(`select id from stages where org_id = $1 order by sequence desc limit 1`, [org.id])).rows[0];
  ids.wo = (await sqlAdmin(
    `insert into work_orders (org_id, wo_no, order_id, order_line_id, stage_id, output_item_id, target_qty, uom, status)
     values ($1,'WO-D-1',$2,$3,$4,$5,1000,'m','done') returning id`, [org.id, seed.id, seed.lines[0].id, stage.id, ids.fabric])).rows[0].id;
});
after(cleanup);

describe('what may not be scanned', () => {
  test('a roll that has not passed QC, a roll of another order, and an unknown code are all refused', async () => {
    const order = await makeOrder(200);
    const other = await makeOrder(200);
    const [pending] = await makeRolls(order, [50], 'pending_qc');
    const [foreign] = await makeRolls(other, [50]);
    const d = await newDispatch(order);

    const notPassed = await scan(d, pending.roll_no);
    assert.equal(notPassed.status, 409);
    assert.equal(notPassed.body.error.code, 'ROLL_NOT_PASSED');
    const wrongOrder = await scan(d, foreign.roll_no);
    assert.equal(wrongOrder.body.error.code, 'ROLL_WRONG_ORDER');
    const unknown = await scan(d, 'NO-SUCH-ROLL');
    assert.equal(unknown.status, 404);
    // nothing was added
    assert.equal((await A.get(`/dispatches/${d.id}`)).body.data.rolls.length, 0);
  });

  test('the ordered quantity (plus 5% tolerance) is a hard limit', async () => {
    const order = await makeOrder(100);                       // limit 105 m
    const rolls = await makeRolls(order, [50, 50, 50]);
    const d = await newDispatch(order);
    assert.equal((await scan(d, rolls[0].roll_no)).status, 201);
    assert.equal((await scan(d, rolls[1].roll_no)).status, 201);
    const over = await scan(d, rolls[2].roll_no);
    assert.equal(over.status, 409);
    assert.equal(over.body.error.code, 'QTY_EXCEEDS_ORDER');
  });

  test('a QR token works as well as a roll number', async () => {
    const order = await makeOrder(100);
    const [roll] = await makeRolls(order, [50]);
    const token = (await sqlAdmin('select qr_token from rolls where id = $1', [roll.id])).rows[0].qr_token;
    const res = await scan(await newDispatch(order), token);
    assert.equal(res.status, 201, JSON.stringify(res.body));
    assert.equal(res.body.data.roll_no, roll.roll_no);
  });
});

describe('no double dispatch', () => {
  test('scanning the same roll twice, or onto a second dispatch, is refused', async () => {
    const order = await makeOrder(200);
    const [roll] = await makeRolls(order, [50, 50]);
    const d1 = await newDispatch(order), d2 = await newDispatch(order);
    assert.equal((await scan(d1, roll.roll_no)).status, 201);
    const again = await scan(d1, roll.roll_no);
    assert.equal(again.body.error.code, 'ROLL_ALREADY_DISPATCHED');
    const other = await scan(d2, roll.roll_no);
    assert.equal(other.status, 409);
    assert.equal(other.body.error.code, 'ROLL_ALREADY_DISPATCHED');
  });

  test('two scanners racing for the same rolls: exactly one wins each', async () => {
    const order = await makeOrder(2000);
    const rolls = await makeRolls(order, Array(6).fill(50));
    const d1 = await newDispatch(order), d2 = await newDispatch(order);
    const results = await Promise.all(rolls.flatMap((r) => [scan(d1, r.roll_no), scan(d2, r.roll_no)]));
    for (let i = 0; i < rolls.length; i++) {
      const pair = [results[2 * i].status, results[2 * i + 1].status].sort();
      assert.deepEqual(pair, [201, 409], `roll ${i}: ${pair}`);
    }
    const loser = results.find((r) => r.status === 409);
    assert.equal(loser.body.error.code, 'ROLL_ALREADY_DISPATCHED');
    // the database agrees: each roll is on exactly one dispatch
    const { rows } = await sqlAdmin(`select roll_id, count(*)::int n from dispatch_rolls where roll_id = any($1) group by 1`, [rolls.map((r) => r.id)]);
    assert.equal(rows.length, 6);
    assert.ok(rows.every((r) => r.n === 1));
  });

  test('taking a roll off a packing dispatch frees it for another one', async () => {
    const order = await makeOrder(200);
    const [roll] = await makeRolls(order, [50]);
    const d1 = await newDispatch(order), d2 = await newDispatch(order);
    await scan(d1, roll.roll_no);
    assert.equal((await A.delete(`/dispatches/${d1.id}/rolls/${roll.id}`)).status, 200);
    assert.equal((await sqlAdmin('select status from rolls where id = $1', [roll.id])).rows[0].status, 'passed');
    assert.equal((await scan(d2, roll.roll_no)).status, 201);
  });
});

describe('confirm', () => {
  test('confirming bills exactly the scanned metres and locks the dispatch', async () => {
    const order = await makeOrder(200, 12.5);
    const rolls = await makeRolls(order, [50, 60, 45, 45]);                 // 200 m in odd lengths
    const d = await newDispatch(order);
    for (const r of rolls) { const s = await scan(d, r.roll_no); assert.equal(s.status, 201, JSON.stringify(s.body)); }

    const empty = await newDispatch(order);
    const none = await A.post(`/dispatches/${empty.id}/confirm`);
    assert.equal(none.status, 422, 'an empty dispatch cannot be confirmed');

    const res = await A.post(`/dispatches/${d.id}/confirm`);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    const inv = (await sqlAdmin(
      `select i.id, i.kind, i.subtotal::float, i.tax::float, i.total::float, i.status,
              (select sum(qty)::float from invoice_lines where invoice_id = i.id) as qty
         from invoices i where i.dispatch_id = $1`, [d.id])).rows;
    assert.equal(inv.length, 1);
    assert.equal(inv[0].kind, 'sales');
    assert.equal(inv[0].qty, 200, 'invoice quantity = sum of the roll lengths');
    assert.equal(inv[0].subtotal, 2500);
    assert.equal(inv[0].total, Math.round((inv[0].subtotal + inv[0].tax) * 100) / 100);

    const states = (await sqlAdmin('select distinct status from rolls where id = any($1)', [rolls.map((r) => r.id)])).rows.map((r) => r.status);
    assert.deepEqual(states, ['dispatched']);

    // locked: no more scans, no second confirm, no re-billing
    const late = await makeRolls(order, [10]);
    assert.equal((await scan(d, late[0].roll_no)).body.error.code, 'INVALID_STATE_TRANSITION');
    assert.equal((await A.post(`/dispatches/${d.id}/confirm`)).status, 409);
    assert.equal((await sqlAdmin('select count(*)::int n from invoices where dispatch_id = $1', [d.id])).rows[0].n, 1);
    // everything is shipped, so the order accepts no further dispatch at all
    const again = await A.post('/dispatches', { order_id: order.id });
    assert.equal(again.status, 409);
  });

  test('the order moves to dispatched by itself once everything is sent', async () => {
    const order = await makeOrder(100);
    const rolls = await makeRolls(order, [50, 50]);
    const d = await newDispatch(order);
    for (const r of rolls) await scan(d, r.roll_no);
    await A.post(`/dispatches/${d.id}/confirm`);
    await waitFor(async () => (await A.get(`/orders/${order.id}`)).body.data.status === 'dispatched');
    // the buyer's invoice is visible on the order
    const detail = (await A.get(`/orders/${order.id}`)).body.data;
    assert.equal(detail.invoices.length, 1);
    assert.equal(detail.dispatches[0].status, 'confirmed');
  });

  test('a partial shipment leaves the order partially_dispatched', async () => {
    const order = await makeOrder(200);
    const rolls = await makeRolls(order, [50, 50, 50, 50]);
    const d = await newDispatch(order);
    for (const r of rolls.slice(0, 2)) await scan(d, r.roll_no);
    await A.post(`/dispatches/${d.id}/confirm`);
    await waitFor(async () => (await A.get(`/orders/${order.id}`)).body.data.status === 'partially_dispatched');
  });

  test('another organization can neither see nor scan onto this dispatch', async () => {
    const order = await makeOrder(100);
    const [roll] = await makeRolls(order, [50]);
    const d = await newDispatch(order);
    const stranger = await makeUser('disp-x');
    const o2 = await makeOrg(stranger, 'Other Mill');
    const S = as(stranger, o2.id);
    assert.equal((await S.get(`/dispatches/${d.id}`)).status, 404);
    assert.equal((await S.post(`/dispatches/${d.id}/scan`, { code: roll.roll_no })).status, 404);
  });
});
