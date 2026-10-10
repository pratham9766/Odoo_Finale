import { test } from 'node:test';
import assert from 'node:assert/strict';
import { PROFILES } from '../../db/seed/config.js';
import { expandMachines } from '../../db/seed/generators/factory.js';
import { createRng } from '../../db/seed/lib/rng.js';
import { buildCatalog } from '../../db/seed/recipes.js';

const near = (actual, expected, tol, msg) =>
  assert.ok(Math.abs(actual - expected) <= tol, `${msg ?? ''} expected ${expected} ± ${tol}, got ${actual}`);

const lossesOf = (profile) => Object.fromEntries(profile.stages.map((s) => [s.name, s]));
const everest = PROFILES.everest;
const catalog = buildCatalog(everest.catalog, lossesOf(everest));

/** The doc's explode() (backend plan §11.4) without stock netting: what a quantity of `sku` needs at every level. */
function explode(boms, sku, qty, trace = [], share_label) {
  trace.push({ sku, qty, share_label });
  const bom = boms.find((b) => b.output === sku);
  for (const line of bom?.lines ?? []) {
    explode(boms, line.component, (qty * line.qty) / bom.output_qty / (1 - line.wastage_pct / 100), trace, line.share_label);
  }
  return trace;
}
const total = (trace, sku) => trace.filter((t) => t.sku === sku).reduce((s, t) => s + t.qty, 0);

test('seeded BOMs: 1 shirt needs ≈ 387 g fibre (overall plan §12.2)', () => {
  const trace = explode(catalog.boms, 'GAR-SHIRT', 1);
  near(total(trace, 'FIN-POP'), 1.778, 0.002, 'finished fabric m');
  near(total(trace, 'GRY-POP'), 1.852, 0.002, 'grey fabric m');
  near(total(trace, 'YRN-40S-K') * 1000, 340, 0.6, 'yarn g');
  near(total(trace, 'FIB-COT') * 1000, 387, 0.6, 'fibre g');

  const warp = trace.find((t) => t.sku === 'YRN-40S-K' && t.share_label === 'warp');
  const weft = trace.find((t) => t.sku === 'YRN-40S-K' && t.share_label === 'weft');
  near(warp.qty * 1000, 187, 0.6, 'warp g');
  near(weft.qty * 1000, 153, 0.6, 'weft g');
});

test('seeded BOMs: dye follows the grey weight that goes into the bath', () => {
  const trace = explode(catalog.boms, 'GAR-SHIRT', 1000);
  near(total(trace, 'DYE-NAVY'), 6.6, 0.1, 'kg of navy dye per 1,000 shirts (2% of ~330 kg grey)');
});

test('seeded BOMs: poly-cotton yarn pulls both fibres, losses come from the stage config', () => {
  const trace = explode(catalog.boms, 'YRN-40S-PC', 1);
  near(total(trace, 'FIB-COT'), 0.65 / 0.88, 1e-4);
  near(total(trace, 'FIB-PES'), 0.35 / 0.88, 1e-4);
});

test('catalog structure: one default BOM per output, every reference resolves', () => {
  for (const [key, profile] of Object.entries(PROFILES)) {
    const { items, boms } = buildCatalog(profile.catalog, lossesOf(profile));
    const skus = items.map((i) => i.sku);
    assert.equal(new Set(skus).size, skus.length, `${key}: duplicate SKU`);
    const outputs = boms.map((b) => b.output);
    assert.equal(new Set(outputs).size, outputs.length, `${key}: two BOMs for one item`);
    for (const b of boms) {
      assert.ok(skus.includes(b.output), `${key}: BOM output ${b.output} is not an item`);
      assert.ok(b.lines.length > 0, `${key}: BOM ${b.output} has no lines`);
      for (const l of b.lines) {
        assert.ok(skus.includes(l.component), `${key}: ${b.output} uses unknown ${l.component}`);
        assert.ok(l.qty > 0, `${key}: ${b.output} line ${l.component} has qty ${l.qty} (bom_lines.qty must be > 0)`);
        assert.ok(l.wastage_pct >= 0 && l.wastage_pct < 100);
        assert.ok(b.stage === null || profile.stages.some((s) => s.name === b.stage), `${key}: unknown stage ${b.stage}`);
      }
    }
  }
});

test('Everest catalog size matches the plan (≈12 yarns, 8 grey + 8 finished fabrics)', () => {
  const kinds = (k) => catalog.items.filter((i) => i.kind === k).length;
  assert.equal(kinds('yarn'), 12);
  assert.equal(kinds('grey_fabric'), 8);
  assert.equal(kinds('finished_fabric'), 8);
  assert.equal(kinds('garment'), 1);
  assert.equal(catalog.boms.length, 12 + 8 * 2 + 1);   // spinning ×12, weaving + dyeing ×8, shirt
});

test('profiles: names used in machines, workers and logins all exist', () => {
  const emails = new Set();
  for (const [key, p] of Object.entries(PROFILES)) {
    const stages = new Set(p.stages.map((s) => s.name));
    const shifts = new Set(p.shifts.map((s) => s.name));
    const warehouses = new Set(p.warehouses.map((w) => w.name));
    const machines = new Set(expandMachines(p.machines, createRng(1)).map((m) => m.code));
    assert.equal(machines.size, p.machines.reduce((n, g) => n + g.count, 0), `${key}: duplicate machine code`);

    for (const g of p.machines) assert.ok(stages.has(g.stage), `${key}: machine group on unknown stage ${g.stage}`);
    for (const stage of Object.keys(p.workers.perStage)) assert.ok(stages.has(stage), `${key}: workers on unknown stage ${stage}`);
    for (const w of p.workers.named) {
      assert.ok(stages.has(w.stage) && shifts.has(w.shift), `${key}: named worker ${w.name} has an unknown stage or shift`);
      assert.ok((p.workers.perStage[w.stage] ?? 0) >= p.workers.named.filter((n) => n.stage === w.stage).length, `${key}: more named than quota in ${w.stage}`);
    }
    for (const u of p.users) {
      assert.ok(!emails.has(u.email), `duplicate login ${u.email}`);
      emails.add(u.email);
      for (const s of u.scope?.stages ?? []) assert.ok(stages.has(s), `${u.email}: unknown stage ${s}`);
      for (const s of u.scope?.shifts ?? []) assert.ok(shifts.has(s), `${u.email}: unknown shift ${s}`);
      for (const s of u.scope?.machines ?? []) assert.ok(machines.has(s), `${u.email}: unknown machine ${s}`);
      for (const s of u.scope?.warehouses ?? []) assert.ok(warehouses.has(s), `${u.email}: unknown warehouse ${s}`);
      if (u.worker) assert.ok(p.workers.named.some((w) => w.name === u.worker), `${u.email}: worker ${u.worker} is not a named worker`);
    }
    for (const g of p.catalog.qualities) {
      assert.ok(g.warp_pct > 0 && g.warp_pct < 100);
    }
  }
});

test('Everest matches the plan: 20 machines, 60 workers, 15 role logins', () => {
  assert.deepEqual(expandMachines(everest.machines, createRng(1)).map((m) => m.code),
    [...'123456'].map((n) => `S-${n}`).concat([...'12345678'].map((n) => `W-${n}`), [...'123456'].map((n) => `D-${n}`)));
  assert.equal(Object.values(everest.workers.perStage).reduce((a, b) => a + b, 0), 60);
  assert.equal(everest.users.length, 15);
});

// ---- rng -------------------------------------------------------------------------------------

test('rng: same seed → same sequence, different seed → different', () => {
  const run = (seed) => { const r = createRng(seed); return [r.next(), r.int(1, 100), r.token(8), r.pick(['a', 'b', 'c'])]; };
  assert.deepEqual(run(42), run(42));
  assert.notDeepEqual(run(42), run(43));
});

test('rng: helpers stay in range', () => {
  const r = createRng(7);
  for (let i = 0; i < 500; i++) {
    const x = r.next(); assert.ok(x >= 0 && x < 1);
    const n = r.int(3, 5); assert.ok(Number.isInteger(n) && n >= 3 && n <= 5);
    const s = r.stepped(520, 780, 10); assert.ok(s >= 520 && s <= 780 && s % 10 === 0, s);
  }
  assert.match(r.token(16), /^[A-Za-z0-9_-]{16}$/);
  const counts = { a: 0, b: 0 };
  for (let i = 0; i < 4000; i++) counts[r.weighted([['a', 0.75], ['b', 0.25]])]++;
  near(counts.a / 4000, 0.75, 0.04, 'weighted share');
  assert.deepEqual([...r.shuffle([1, 2, 3, 4, 5])].sort(), [1, 2, 3, 4, 5]);
});
