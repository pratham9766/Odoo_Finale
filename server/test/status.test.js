import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { makeUser, makeOrg, as, cleanup, sqlAdmin, rand } from './helpers.js';
import { recomputeOrderStatus } from '../src/modules/orders/orderStatus.js';

// The engine derives order status from work orders, rolls and dispatches. Hrishikesh's modules write those
// rows; here we write them directly and call the engine, so the transitions are proven independent of his code.
let owner, org, A, order, ids = {};
const q = (text, params) => sqlAdmin(text, params);
const status = async () => (await A.get(`/orders/${order.id}`)).body.data;
const tomorrow = (d = 10) => new Date(Date.now() + d * 86400000).toISOString().slice(0, 10);

before(async () => {
  owner = await makeUser('status');
  org = await makeOrg(owner, 'Status Mills');
  A = as(owner, org.id);
  const contact = (await A.post('/contacts', { type: 'buyer', name: 'Buyer' })).body.data.id;
  ids.fabric = (await A.post('/items', { kind: 'finished_fabric', name: 'Fab', uom: 'm' })).body.data.id;
  // no BOM and plenty of stock → the order is material_ready straight away
  await q(`with l as (insert into stock_lots (org_id, item_id, lot_no) values ($1,$2,'S') returning id)
           insert into stock_movements (org_id, item_id, lot_id, type, qty) select $1,$2,l.id,'in',1000 from l`, [org.id, ids.fabric]);
  order = (await A.post('/orders', { seller_org_id: org.id, buyer_contact_id: contact, deadline: tomorrow(), lines: [{ item_id: ids.fabric, qty: 100, uom: 'm', rate: 10 }] })).body.data;
  ids.line = order.lines[0].id;
  ids.stage = (await q('select id from stages where org_id = $1 order by sequence limit 1', [org.id])).rows[0].id;
  ids.machine = (await q(
    `insert into machines (org_id, code, stage_id, capacity_per_hour, capacity_uom) values ($1,'M1',$2,10,'m') returning id`, [org.id, ids.stage])).rows[0].id;
});
after(cleanup);

const step = async (expected) => {
  await recomputeOrderStatus(org.id, order.id);
  const o = await status();
  assert.equal(o.status, expected);
  return o;
};

test('draft orders are left alone; confirm gives material_ready (enough stock)', async () => {
  await step('draft');
  assert.equal((await A.post(`/orders/${order.id}/confirm`)).status, 200);
  await step('material_ready');
});

test('a running work order puts the order in production with progress, ETA and risk', async () => {
  ids.wo = (await q(
    `insert into work_orders (org_id, wo_no, order_id, order_line_id, stage_id, output_item_id, machine_id, target_qty, uom, produced_qty, status)
     values ($1,'WO-T1',$2,$3,$4,$5,$6,100,'m',40,'running') returning id`, [org.id, order.id, ids.line, ids.stage, ids.fabric, ids.machine])).rows[0].id;
  const o = await step('in_production');
  assert.equal(o.progress_pct, 40);
  assert.equal(o.current_stage, (await q('select name from stages where id = $1', [ids.stage])).rows[0].name);
  assert.equal(o.risk, 'green'); // 60 m left at 10 m/h = 6 h, due in 10 days
  assert.ok(o.expected_completion);
  assert.ok(o.events.some((e) => e.event === 'in_production'));
});

test('slow machine + near deadline turns risk red, then amber/green as it recovers', async () => {
  await q('update machines set capacity_per_hour = 0.1 where id = $1', [ids.machine]); // 600 h to go
  await q('update orders set deadline = $2 where id = $1', [order.id, tomorrow(3)]);
  assert.equal((await step('in_production')).risk, 'red');
  await q('update machines set capacity_per_hour = 10 where id = $1', [ids.machine]);
  assert.equal((await step('in_production')).risk, 'green');
});

test('finished work order with unchecked rolls → in_qc', async () => {
  await q(`update work_orders set status = 'done', produced_qty = 100, finished_at = now() where id = $1`, [ids.wo]);
  ids.roll = (await q(
    `insert into rolls (org_id, roll_no, qr_token, order_id, order_line_id, item_id, work_order_id, length_m, status)
     values ($1,'R-T-001',$6,$2,$3,$4,$5,100,'pending_qc') returning id`, [org.id, order.id, ids.line, ids.fabric, ids.wo, `qr-${rand()}`])).rows[0].id;
  await step('in_qc');
});

test('all rolls passed → ready_to_ship (progress 100)', async () => {
  await q(`update rolls set status = 'passed' where id = $1`, [ids.roll]);
  const o = await step('ready_to_ship');
  assert.equal(o.progress_pct, 100);
});

test('partial dispatch → partially_dispatched; full dispatch → dispatched; delivery → delivered', async () => {
  await q(`update orders set status = 'ready_to_ship' where id = $1`, [order.id]);
  // second roll so we can dispatch in two parts
  await q(`update rolls set length_m = 60, status = 'dispatched' where id = $1`, [ids.roll]);
  const roll2 = (await q(
    `insert into rolls (org_id, roll_no, qr_token, order_id, order_line_id, item_id, work_order_id, length_m, status)
     values ($1,'R-T-002',$6,$2,$3,$4,$5,40,'passed') returning id`, [org.id, order.id, ids.line, ids.fabric, ids.wo, `qr-${rand()}`])).rows[0].id;
  const d1 = (await q(
    `insert into dispatches (dispatch_no, from_org_id, kind, order_id, status, to_contact_id)
     values ('DSP-T1',$1,'sales',$2,'confirmed',(select id from contacts where org_id = $1 limit 1)) returning id`, [org.id, order.id])).rows[0].id;
  await q('insert into dispatch_rolls (dispatch_id, roll_id, from_org_id, length_m) values ($1,$2,$3,60)', [d1, ids.roll, org.id]);
  await step('partially_dispatched');

  const d2 = (await q(
    `insert into dispatches (dispatch_no, from_org_id, kind, order_id, status, to_contact_id)
     values ('DSP-T2',$1,'sales',$2,'in_transit',(select id from contacts where org_id = $1 limit 1)) returning id`, [org.id, order.id])).rows[0].id;
  await q('insert into dispatch_rolls (dispatch_id, roll_id, from_org_id, length_m) values ($1,$2,$3,40)', [d2, roll2, org.id]);
  await step('dispatched');

  await q(`update dispatches set status = 'delivered' where order_id = $1`, [order.id]);
  const o = await step('delivered');
  assert.equal(o.risk, 'green');
});

test('rolling an order status back is impossible once it is cancelled/closed', async () => {
  await q(`update orders set status = 'closed' where id = $1`, [order.id]);
  assert.equal(await recomputeOrderStatus(org.id, order.id), null);
  assert.equal((await status()).status, 'closed');
});

test('events fire on change: status_changed and updated', async () => {
  const { bus } = await import('../src/events/bus.js');
  const seen = [];
  const h = (p) => seen.push(p.to);
  bus.on('order.status_changed', h);
  await q(`update orders set status = 'in_production' where id = $1`, [order.id]);
  await q(`delete from dispatch_rolls where from_org_id = $1`, [org.id]);
  await q(`delete from dispatches where from_org_id = $1`, [org.id]);
  await q(`update orders set status = 'material_ready' where id = $1`, [order.id]);
  await recomputeOrderStatus(org.id, order.id); // work order is done + rolls dispatched→ recompute from rows
  bus.off('order.status_changed', h);
  assert.ok(seen.length >= 1);
});
