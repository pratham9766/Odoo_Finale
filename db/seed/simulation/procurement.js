// Material for the story: the opening stock, the yarn that is bought in every fortnight, and the check each order makes
// (what stock does not cover is bought, delivered two to four days later, and holds the order back until it arrives).

import { logEntry } from '../../../server/src/modules/gate/gate.service.js';
import { atIST, istParts } from '../../../server/src/utils/time.js';
import { round2 } from '../../../server/src/utils/money.js';
import { SUPPLIERS } from './config.js';
import { materialPlan, receiveGoods } from './adapters.js';

const LOT_STEP = { fibre: 500, yarn: 100, dye: 25 };         // suppliers deliver in whole lots
const RESTOCK_EVERY_DAYS = 14;

const roundUp = (qty, step) => Math.ceil(qty / step) * step;
const plate = (rng) => `GJ ${String(rng.int(1, 40)).padStart(2, '0')} ${rng.token(2, 'ABCDEFGHJKLMNPRSTUVWXYZ')} ${rng.int(1000, 9999)}`;

/** A delivery of the supplier's lots: received into stock, with the truck logged at the gate (in, and out an hour or two later). */
async function deliver(sim, supplier, lines, at, forOrderId = null) {
  await receiveGoods(sim, { supplier, lines, at, forOrderId });
  const truck = { vehicle_no: plate(sim.rng), driver_name: `${sim.rng.pick(['Ramesh', 'Salim', 'Dinesh', 'Karan'])} ${sim.rng.pick(['Yadav', 'Khan', 'Patel'])}`, purpose: 'supply' };
  await logEntry(sim.ctx.gate, { ...truck, direction: 'in' }, { at: sim.after(at, -20) });
  await logEntry(sim.ctx.gate, { ...truck, direction: 'out' }, { at: sim.after(at, sim.rng.int(60, 150)) });
}

const rateFor = (sim, sku) => round2(sim.item[sku].std_rate * (0.97 + sim.rng.next() * 0.06));

/** Several items to one supplier become one delivery per supplier: [{ sku, qty }] → delivered at `at`. */
async function buy(sim, kind, wanted, at, forOrderId = null) {
  const bySupplier = new Map();
  for (const { sku, qty } of wanted) {
    const supplier = sim.rng.weighted(SUPPLIERS[kind]);
    bySupplier.set(supplier, [...(bySupplier.get(supplier) ?? []), { sku, qty: roundUp(qty, LOT_STEP[kind]), rate: rateFor(sim, sku) }]);
  }
  for (const [supplier, lines] of bySupplier) await deliver(sim, supplier, lines, at, forOrderId);
}

/** A weekday-office-hours moment `days` after `from`. */
const deliveryTime = (sim, from, days) => atIST(istParts(sim.after(from, days * 1440)).date, sim.rng.int(9 * 60, 17 * 60));

/** Fibre for spinning, a few weeks of every dye, and the yarns the qualities weave, on the day the history starts. */
export async function openingStock(sim) {
  const at = atIST(istParts(sim.start).date, 9 * 60);
  const skus = (kind) => Object.values(sim.item).filter((i) => i.kind === kind).map((i) => i.sku);
  await buy(sim, 'fibre', skus('fibre').map((sku) => ({ sku, qty: sku === 'FIB-COT' ? 4000 : 1500 })), at);
  await buy(sim, 'dye', skus('dye').map((sku) => ({ sku, qty: 75 })), at);
  await restockYarn(sim, at);
}

/** Yarn bought in rather than spun: lots of the yarns the qualities use, mostly from Supplier X. */
export async function restockYarn(sim, at) {
  const yarns = Object.values(sim.item).filter((i) => i.kind === 'yarn');
  const wanted = sim.rng.shuffle(yarns).slice(0, 5).map((y) => ({ sku: y.sku, qty: sim.rng.stepped(200, 600, 100) }));
  await buy(sim, 'yarn', wanted, at);
}

/** Called at the start of each simulated day: the fortnightly yarn delivery. */
export async function dailyProcurement(sim, dayIndex, at) {
  if (dayIndex > 0 && dayIndex % RESTOCK_EVERY_DAYS === 0) await restockYarn(sim, atIST(istParts(at).date, 10 * 60));
}

/**
 * The material check of a new order: buy what stock does not cover (arrives in 2–4 days) and say when the order can start.
 * @returns {Promise<Date>} the earliest moment production can begin
 */
export async function provisionOrder(sim, orderId, lines, arrival) {
  const { buy: shortages, touched } = await materialPlan(sim, lines);
  const wanted = { fibre: [], dye: [], yarn: [] };
  for (const [itemId, qty] of shortages) {
    const item = sim.itemById[itemId];
    if (wanted[item.kind]) wanted[item.kind].push({ sku: item.sku, qty: qty * 1.25 });
  }
  const arrives = deliveryTime(sim, arrival, sim.rng.int(2, 4));
  for (const kind of Object.keys(wanted)) {
    if (!wanted[kind].length) continue;
    await buy(sim, kind, wanted[kind], arrives, orderId);
    for (const { sku } of wanted[kind]) sim.stockReadyAt.set(sim.item[sku].id, arrives);
  }
  const prepared = sim.after(arrival, sim.rng.int(2, 6) * 60);
  const latest = [...touched].reduce((t, id) => Math.max(t, sim.stockReadyAt.get(id)?.getTime() ?? 0), prepared.getTime());
  return new Date(latest);
}
