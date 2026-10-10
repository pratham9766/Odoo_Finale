import { test, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { makeUser, makeOrg, as, cleanup, sqlAdmin } from './helpers.js';

// §12.2 worked example: 1 shirt ≈ 387 g fibre
//   shirt(pcs) ← finished(m) 1.6 m, cutting 10% ← grey(m) shrink 4% ← yarn(kg) 0.17838 kg/m, weaving 3% ← fibre(kg) spinning 12%
let owner, org, api, id;

const item = async (kind, name, uom, extra = {}) => {
  const res = await api.post('/items', { kind, name, uom, ...extra });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body.data.id;
};
const bom = async (out, lines, extra = {}) => {
  const res = await api.post('/boms', { output_item_id: out, lines, ...extra });
  assert.equal(res.status, 201, JSON.stringify(res.body));
  return res.body.data;
};
const addStock = (itemId, qty) =>
  sqlAdmin(
    `with l as (insert into stock_lots (org_id, item_id, lot_no, unit_cost) values ($1,$2,'T-'||substr(gen_random_uuid()::text,1,6), 100) returning id)
     insert into stock_movements (org_id, item_id, lot_id, type, qty) select $1,$2,l.id,'in',$3 from l`,
    [org.id, itemId, qty]);

before(async () => {
  owner = await makeUser('bom');
  org = await makeOrg(owner, 'BOM Test Mills');
  api = as(owner, org.id);
  id = {
    shirt: await item('garment', 'Shirt', 'pcs'),
    finished: await item('finished_fabric', 'Finished', 'm', { std_rate: 200 }),
    grey: await item('grey_fabric', 'Grey', 'm'),
    yarn: await item('yarn', 'Yarn 40s', 'kg', { yarn_count_ne: 40, std_rate: 300 }),
    fibre: await item('fibre', 'Cotton', 'kg', { std_rate: 120 }),
  };
  await bom(id.yarn, [{ component_item_id: id.fibre, qty: 1, wastage_pct: 12 }]);
  await bom(id.grey, [
    { component_item_id: id.yarn, qty: 0.17838 * 0.55, wastage_pct: 3, share_label: 'warp' },
    { component_item_id: id.yarn, qty: 0.17838 * 0.45, wastage_pct: 3, share_label: 'weft' },
  ]);
  await bom(id.finished, [{ component_item_id: id.grey, qty: 1, wastage_pct: 4 }]);
  await bom(id.shirt, [{ component_item_id: id.finished, qty: 1.6, wastage_pct: 10 }]);
});
after(cleanup);

const find = (node, itemId) => {
  if (node.item.id === itemId) return node;
  for (const c of node.children) { const f = find(c, itemId); if (f) return f; }
  return null;
};

const sumItem = (node, itemId) => (node.item.id === itemId ? node.required : 0) + node.children.reduce((t, c) => t + sumItem(c, itemId), 0);

test('1 shirt needs ≈387 g fibre, 340 g yarn, 1.85 m grey, 1.78 m finished (±1 g)', async () => {
  const res = await api.get(`/bom/explode?item_id=${id.shirt}&qty=1&net_stock=false`);
  assert.equal(res.status, 200, JSON.stringify(res.body));
  const { tree } = res.body.data;
  const fibre = sumItem(tree, id.fibre);
  assert.ok(Math.abs(fibre - 0.387) <= 0.001, `fibre ${fibre} kg`);
  const finished = find(tree, id.finished).required;
  const grey = find(tree, id.grey).required;
  assert.ok(Math.abs(finished - 1.778) < 0.001, `finished ${finished}`);
  assert.ok(Math.abs(grey - 1.852) < 0.001, `grey ${grey}`);
  // yarn appears under warp and weft; together ≈ 340 g
  const yarnTotal = find(tree, id.grey).children.reduce((s, c) => s + c.required, 0);
  assert.ok(Math.abs(yarnTotal - 0.3406) <= 0.001, `yarn ${yarnTotal}`);
});

test('1000 shirts: stock is used first and only the shortage is exploded', async () => {
  await addStock(id.finished, 200); // 200 m finished fabric on hand
  const res = await api.get(`/bom/explode?item_id=${id.shirt}&qty=1000`);
  const { tree, summary } = res.body.data;
  const fin = find(tree, id.finished);
  assert.equal(fin.required, 1777.778);
  assert.equal(fin.from_stock, 200);
  assert.equal(fin.to_make, 1577.778);
  // grey demand is computed from the 1577.8 m shortage, not the gross 1777.8 m
  assert.ok(Math.abs(find(tree, id.grey).required - 1577.778 / 0.96) < 0.01);
  assert.ok(summary.buy_list.some((b) => b.item_id === id.fibre));
  assert.ok(summary.material_cost_estimate > 0);
});

test('shared yarn used for warp and weft is not double-netted', async () => {
  await addStock(id.yarn, 100); // 100 kg yarn: less than the ~300 kg needed
  const res = await api.get(`/bom/explode?item_id=${id.grey}&qty=1000`);
  const grey = res.body.data.tree;
  const fromStock = grey.children.reduce((s, c) => s + c.from_stock, 0);
  assert.ok(fromStock <= 100.0001, `yarn netted ${fromStock} kg against 100 kg on hand`);
  assert.ok(Math.abs(fromStock - 100) < 0.01);
});

test('a BOM loop is rejected with BOM_CYCLE', async () => {
  const res = await api.post('/boms', { output_item_id: id.fibre, lines: [{ component_item_id: id.yarn, qty: 1 }] });
  assert.equal(res.status, 422);
  assert.equal(res.body.error.code, 'BOM_CYCLE');
  const self = await api.post('/boms', { output_item_id: id.shirt, lines: [{ component_item_id: id.shirt, qty: 1 }] });
  assert.equal(self.body.error.code, 'BOM_CYCLE');
});

test('creating a new default BOM demotes the previous default', async () => {
  const b = await bom(id.finished, [{ component_item_id: id.grey, qty: 1, wastage_pct: 5 }]);
  const list = (await api.get(`/boms?item_id=${id.finished}`)).body.data;
  assert.equal(list.filter((x) => x.is_default).length, 1);
  assert.equal(list.find((x) => x.is_default).id, b.id);
  assert.equal(b.version, 2);
});

test('textile conversions', async () => {
  const kg = await api.post('/bom/convert', { op: 'fabric_m_to_kg', m: 1000, width_m: 1.47, gsm: 120 });
  assert.equal(kg.body.data.kg, 176.4);
  const m = await api.post('/bom/convert', { op: 'fabric_kg_to_m', kg: 176.4, width_m: 1.47, gsm: 120 });
  assert.ok(Math.abs(m.body.data.m - 1000) < 0.01);
  const gross = await api.post('/bom/convert', { op: 'gross_up', output: 100, wastage_pct: 10 });
  assert.equal(gross.body.data.input, 111.111);
  const bad = await api.post('/bom/convert', { op: 'nonsense' });
  assert.equal(bad.status, 422);
});

test('cost fields are hidden from roles without price access', async () => {
  const keeper = await makeUser('keeper');
  const roles = (await api.get('/roles')).body.data;
  const inv = await api.post('/staff/invites', { email: keeper.email, role_id: roles.find((r) => r.name === 'Store Keeper').id });
  await as(keeper).post(`/me/invites/staff/${inv.body.data.link.split('/').pop()}/accept`);
  const list = await as(keeper, org.id).get('/items?limit=5');
  assert.equal(list.status, 200);
  assert.ok(list.body.data.length > 0);
  assert.ok(list.body.data.every((i) => !('std_rate' in i)));
  const explode = await as(keeper, org.id).get(`/bom/explode?item_id=${id.shirt}&qty=1`);
  assert.equal('material_cost_estimate' in explode.body.data.summary, false);
});
