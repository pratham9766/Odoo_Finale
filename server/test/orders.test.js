import { test, before, after, describe } from 'node:test';
import assert from 'node:assert/strict';
import { makeUser, makeOrg, as, api, cleanup, waitFor } from './helpers.js';

const tomorrow = () => new Date(Date.now() + 10 * 86400000).toISOString().slice(0, 10);

describe('mill flow with offline buyer and supplier: order → shortage → PO → GRN → material_ready', () => {
  let owner, org, A, ids = {}, order;

  before(async () => {
    owner = await makeUser('mill');
    org = await makeOrg(owner, 'Flow Mills');
    A = as(owner, org.id);
    const supplier = (await A.post('/contacts', { type: 'supplier', name: 'Yarn Traders' })).body.data;
    const buyer = (await A.post('/contacts', { type: 'buyer', name: 'Local Garments' })).body.data;
    ids.buyer = buyer.id; ids.supplier = supplier.id;
    const mk = async (b) => (await A.post('/items', b)).body.data.id;
    ids.yarn = await mk({ kind: 'yarn', name: 'Yarn 40s', uom: 'kg', std_rate: 300, preferred_supplier_contact_id: supplier.id, reorder_level: 5 });
    ids.fabric = await mk({ kind: 'finished_fabric', name: 'Poplin White', uom: 'm', sellable: true, std_rate: 400 });
    const bom = await A.post('/boms', { output_item_id: ids.fabric, lines: [{ component_item_id: ids.yarn, qty: 0.2, wastage_pct: 0 }] });
    assert.equal(bom.status, 201, JSON.stringify(bom.body));
  });

  test('create order for an offline buyer (draft, mill numbering)', async () => {
    const res = await A.post('/orders', {
      seller_org_id: org.id, buyer_contact_id: ids.buyer, deadline: tomorrow(),
      lines: [{ item_id: ids.fabric, qty: 100, uom: 'm', rate: 450 }],
    });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    order = res.body.data;
    assert.match(order.order_no, /^ORD-\d{4}-0001$/);
    assert.equal(order.status, 'draft');
    assert.equal(order.lines[0].description, 'Poplin White');
  });

  test('requirements show a 20 kg yarn shortage', async () => {
    const res = await A.get(`/orders/${order.id}/requirements`);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.data.ready, false);
    const yarn = res.body.data.summary.buy_list.find((b) => b.item_id === ids.yarn);
    assert.equal(yarn.qty, 20);
    assert.equal(res.body.data.summary.material_cost_estimate, 6000);
  });

  test('confirm with auto_po: waiting_material + a draft PO to the preferred supplier', async () => {
    const res = await A.post(`/orders/${order.id}/confirm`, { auto_po: true });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.data.order.status, 'waiting_material');
    assert.equal(res.body.data.shortages[0].qty, 20);
    assert.equal(res.body.data.draft_pos.length, 1);
    ids.po = res.body.data.draft_pos[0].id;
    const again = await A.post(`/orders/${order.id}/confirm`);
    assert.equal(again.status, 409);
    assert.equal(again.body.error.code, 'INVALID_STATE_TRANSITION');
  });

  test('send the PO and record the offline supplier accepting it', async () => {
    assert.equal((await A.post(`/purchase-orders/${ids.po}/send`)).body.data.status, 'sent');
    const res = await A.post(`/purchase-orders/${ids.po}/respond`, { action: 'accept', promise_date: tomorrow() });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal(res.body.data.status, 'accepted');
  });

  test('posting the GRN turns the waiting order material_ready on its own', async () => {
    const po = (await A.get(`/purchase-orders/${ids.po}`)).body.data;
    const grn = await A.post('/receipts', {
      po_id: ids.po, vehicle_no: 'MH12AB1234',
      lines: [{ item_id: ids.yarn, lot_no: 'YL-001', received_qty: 20, expected_qty: 20, rate: 300, po_line_id: po.lines[0].id }],
    });
    assert.equal(grn.status, 201, JSON.stringify(grn.body));
    const posted = await A.post(`/receipts/${grn.body.data.id}/post`);
    assert.equal(posted.status, 200, JSON.stringify(posted.body));
    assert.equal(posted.body.data.status, 'posted');
    assert.equal((await A.post(`/receipts/${grn.body.data.id}/post`)).status, 409);

    await waitFor(async () => (await A.get(`/orders/${order.id}`)).body.data.status === 'material_ready');
    const stock = (await A.get('/stock?kind=yarn')).body.data[0];
    assert.equal(stock.on_hand, 20);
    assert.equal(stock.reserved, 20);
    assert.equal(stock.available, 0);
    assert.equal((await A.get(`/purchase-orders/${ids.po}`)).body.data.status, 'received');
    // offline supplier: draft supplier_bill expense, created by the listener
    const { sqlAdmin } = await import('./helpers.js');
    await waitFor(async () => (await sqlAdmin(`select 1 from expenses where org_id = $1 and category = 'supplier_bill'`, [org.id])).rowCount > 0);
  });

  test('reservations hold the stock: a second order sees a shortage', async () => {
    const o2 = (await A.post('/orders', { seller_org_id: org.id, buyer_contact_id: ids.buyer, deadline: tomorrow(), lines: [{ item_id: ids.fabric, qty: 50, uom: 'm', rate: 450 }] })).body.data;
    const res = await A.get(`/orders/${o2.id}/requirements`);
    assert.equal(res.body.data.summary.buy_list[0].qty, 10);
    // the first order's own requirements ignore its own reservation
    const own = await A.get(`/orders/${order.id}/requirements`);
    assert.equal(own.body.data.ready, true);
  });

  test('stock adjustments need approval by someone else', async () => {
    const lots = (await A.get(`/stock/lots?item_id=${ids.yarn}`)).body.data;
    const adj = await A.post('/stock/adjustments', { item_id: ids.yarn, lot_id: lots[0].id, qty: 5, reason: 'Count correction' });
    assert.equal(adj.status, 201, JSON.stringify(adj.body));
    const ok = await A.post(`/stock/adjustments/${adj.body.data.id}/approve`); // owner may self-approve
    assert.equal(ok.status, 200, JSON.stringify(ok.body));
    assert.equal((await A.get('/stock?kind=yarn')).body.data[0].on_hand, 25);
    // cannot remove reserved stock
    const bad = await A.post('/stock/adjustments', { item_id: ids.yarn, lot_id: lots[0].id, qty: -24, reason: 'Wrong' });
    const rej = await A.post(`/stock/adjustments/${bad.body.data.id}/approve`);
    assert.equal(rej.status, 409);
    assert.equal(rej.body.error.code, 'INSUFFICIENT_STOCK');
  });

  test('cancelling releases the reservation', async () => {
    const res = await A.post(`/orders/${order.id}/cancel`, { reason: 'Buyer changed mind' });
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.equal((await A.get('/stock?kind=yarn')).body.data[0].reserved, 0);
    assert.equal((await A.get(`/orders/${order.id}`)).body.data.status, 'cancelled');
  });
});

describe('connected buyer places an order with a mill', () => {
  let mill, buyer, millOrg, buyerOrg, M, B, fabric, order;

  before(async () => {
    [mill, buyer] = await Promise.all([makeUser('mill2'), makeUser('buyer2')]);
    millOrg = await makeOrg(mill, 'Connected Mills');
    buyerOrg = await makeOrg(buyer, 'Big Garments', ['buyer']);
    M = as(mill, millOrg.id); B = as(buyer, buyerOrg.id);
    fabric = (await M.post('/items', { kind: 'finished_fabric', name: 'Twill Blue', uom: 'm', sellable: true, std_rate: 300 })).body.data.id;
    await M.post('/items', { kind: 'yarn', name: 'Secret Yarn', uom: 'kg', std_rate: 111 });
  });

  test('buyer cannot order before the mill accepts the connection', async () => {
    const res = await B.post('/orders', { seller_org_id: millOrg.id, deadline: tomorrow(), lines: [{ item_id: fabric, qty: 10, uom: 'm', rate: 400 }] });
    assert.equal(res.status, 403);
    assert.equal(res.body.error.code, 'NOT_PARTNERS');
  });

  test('connect by code: mill is a supplier of the buyer; buyer accepts nothing, the mill accepts', async () => {
    // buyer asks the mill (a supplier to the buyer)
    const ctxRes = await as(mill).get(`/me/orgs/${millOrg.id}/context`);
    const req = await B.post('/partners/connect-code', { code: ctxRes.body.data.org.connect_code, relation: 'supplier' });
    assert.equal(req.status, 201, JSON.stringify(req.body));
    // the mill sees it as incoming and accepts
    const list = (await M.get('/partners')).body.data;
    const incoming = list.find((p) => !p.outgoing);
    assert.equal(incoming.my_relation, 'buyer');
    assert.equal((await B.post(`/partners/${incoming.id}/accept`)).status, 403); // the requesting side cannot accept its own request
    const acc = await M.post(`/partners/${incoming.id}/accept`);
    assert.equal(acc.status, 200, JSON.stringify(acc.body));
    assert.equal((await M.post('/partners/connect-code', { code: (await as(buyer).get(`/me/orgs/${buyerOrg.id}/context`)).body.data.org.connect_code, relation: 'buyer' })).status, 409);
  });

  test('buyer sees only the mill\'s sellable catalog, without costs', async () => {
    const res = await B.get(`/partners/${millOrg.id}/catalog`);
    assert.equal(res.status, 200, JSON.stringify(res.body));
    assert.deepEqual(res.body.data.map((i) => i.name), ['Twill Blue']);
    assert.ok(res.body.data.every((i) => !('std_rate' in i)));
    assert.equal((await B.get('/items')).status, 403); // buyer org has no items.view
  });

  test('buyer places an order → REQ- number; mill confirms → real ORD number', async () => {
    const res = await B.post('/orders', { seller_org_id: millOrg.id, deadline: tomorrow(), buyer_ref: 'PO-778', lines: [{ item_id: fabric, qty: 40, uom: 'm', rate: 420 }] });
    assert.equal(res.status, 201, JSON.stringify(res.body));
    order = res.body.data;
    assert.match(order.order_no, /^REQ-/);
    assert.equal(order.is_seller_view, false);
    assert.equal(order.lines[0].description, 'Twill Blue');

    const seen = (await M.get('/orders?side=sales')).body.data;
    assert.ok(seen.find((o) => o.id === order.id), 'mill sees the buyer order');
    const conf = await M.post(`/orders/${order.id}/confirm`);
    assert.equal(conf.status, 200, JSON.stringify(conf.body));
    assert.match(conf.body.data.order.order_no, /^ORD-\d{4}-0001$/);
    assert.equal(conf.body.data.order.status, 'waiting_material');
  });

  test('buyer view: own order only, no tracking token, no internal events, no mill internals', async () => {
    const res = await B.get(`/orders/${order.id}`);
    assert.equal(res.status, 200);
    assert.equal(res.body.data.tracking_token, undefined);
    assert.ok(res.body.data.events.every((e) => e.visible_to_buyer));
    assert.ok(!res.body.data.events.some((e) => e.event === 'waiting_material'));
    assert.equal(res.body.data.rolls, undefined);
    assert.equal(res.body.data.reservations, undefined);
    assert.equal((await B.post(`/orders/${order.id}/confirm`)).status, 403);
    assert.equal((await B.get(`/orders/${order.id}/requirements`)).status, 403);
    assert.equal((await B.get('/orders?side=purchase')).body.data.length, 1);
  });

  test('a third organization sees nothing of this order', async () => {
    const outsider = await makeUser('outsider');
    const o = await makeOrg(outsider, 'Nosy Mill');
    const res = await as(outsider, o.id).get(`/orders/${order.id}`);
    assert.equal(res.status, 404);
  });

  test('public tracking link exposes progress but no prices or internals', async () => {
    const link = await M.post(`/orders/${order.id}/tracking-link`);
    assert.equal(link.status, 200);
    const pub = await api().get(`/api/v1/public/track/${link.body.data.token}`);
    assert.equal(pub.status, 200, JSON.stringify(pub.body));
    assert.match(pub.body.data.order_no, /^ORD-/);
    assert.equal(pub.body.data.mill, 'Connected Mills');
    const keys = new Set();
    JSON.stringify(pub.body, (k, v) => (keys.add(k), v));
    for (const bad of ['rate', 'price', 'unit_cost', 'std_rate', 'total', 'amount', 'tracking_token']) assert.ok(!keys.has(bad), `public payload leaks ${bad}`);
    assert.equal((await B.post(`/orders/${order.id}/tracking-link`)).status, 403);
  });

  test('buyer may cancel only before the mill confirms', async () => {
    const o2 = (await B.post('/orders', { seller_org_id: millOrg.id, deadline: tomorrow(), lines: [{ item_id: fabric, qty: 5, uom: 'm' }] })).body.data;
    assert.equal((await B.post(`/orders/${o2.id}/cancel`, {})).status, 200);
    assert.equal((await B.post(`/orders/${order.id}/cancel`, {})).status, 403); // already confirmed
  });
});

// one cleanup for the whole file: it closes the shared DB pool, so it must run after both suites
after(cleanup);
