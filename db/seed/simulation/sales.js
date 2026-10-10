// After production: QC (with the planted defect patterns), rework, dispatch + invoice, delivery, and the buyer paying (or not).
// Everything runs through the real services with the story's timestamps; anything that would happen after "now" is left undone,
// which is what leaves rolls in the QC queue, orders ready to ship and invoices overdue.

import { inspectRoll } from '../../../server/src/modules/quality/inspections.service.js';
import { onWorkOrderFinished } from '../../../server/src/events/listeners/qualityReactions.js';
import { createDispatch, scanRoll, updateStatus } from '../../../server/src/modules/dispatch/dispatches.service.js';
import { confirmDispatch } from '../../../server/src/modules/dispatch/confirm.service.js';
import { recordPayment } from '../../../server/src/modules/finance/payments.service.js';
import { round2 } from '../../../server/src/utils/money.js';
import { istParts } from '../../../server/src/utils/time.js';
import { BUYERS, PATTERNS, SIM, SUPPLIER_X } from './config.js';
import { runWorkOrder } from './production.js';


// ---- QC ---------------------------------------------------------------------------------------------------------------------------------

/** Which rolls were woven on W-3 and which carry a Supplier X yarn lot (that is where the planted defects come from). */
async function rollCauses(sim, rollIds) {
  const rows = await sim.sql(
    `select r.id,
            (select m.code from roll_history h join machines m on m.id = h.machine_id
              where h.roll_id = r.id and h.event = 'woven' limit 1) as woven_on,
            exists (select 1 from roll_yarn_lots y join stock_lots l on l.id = y.lot_id
                     where y.roll_id = r.id and l.supplier_contact_id = $2) as supplier_x
       from rolls r where r.id = any($1::uuid[])`, [rollIds, sim.contact[SUPPLIER_X].id]);
  return new Map(rows.map((r) => [r.id, r]));
}

/** The defect a roll comes back with, if any: colour mismatch on W-3, holes from Supplier X yarn, a little of everything else. */
function defectFor(sim, cause) {
  if (cause?.woven_on === 'W-3' && sim.rng.chance(PATTERNS.w3ColourMismatch)) return 'COLOUR';
  if (cause?.supplier_x && sim.rng.chance(PATTERNS.supplierXHoles)) return 'HOLE';
  if (sim.rng.chance(PATTERNS.baseDefect)) return sim.rng.pick(['UNEVEN', 'STAIN', 'BROKEN_END', 'HOLE']);
  return null;
}

const inspect = (sim, rollId, result, code, at) => inspectRoll(sim.ctx.qc, {
  roll_id: rollId, result,
  defects: code ? [{ defect_type_id: sim.defectType[code].id, count: sim.rng.int(1, 4), severity: code === 'HOLE' || code === 'COLOUR' ? 3 : 2 }] : [],
  remarks: code ? `${code.toLowerCase().replace('_', ' ')} found` : undefined,
}, { at });

/** A failed roll goes through its rework work order and comes back to QC: passes most of the time, else rejected. */
async function rework(sim, roll, at) {
  const [wo] = await sim.sql(
    `select w.* from work_orders w join roll_history h on h.work_order_id = w.id
      where h.roll_id = $1 and h.event = 'rework_started' and w.status = 'planned' order by w.created_at desc limit 1`, [roll.id]);
  if (!wo) return null;
  const done = await runWorkOrder(sim, { ...wo, target_qty: Number(wo.target_qty) }, sim.after(at, 60), { rework: true });
  if (!done.complete) return null;
  await onWorkOrderFinished({ workOrderId: wo.id });
  const again = sim.after(done.end, sim.rng.int(60, 180));
  if (again > sim.now) return null;
  const pass = sim.rng.chance(PATTERNS.reworkPass);
  await inspect(sim, roll.id, pass ? 'pass' : 'reject', pass ? null : 'UNEVEN', again);
  return pass ? again : null;
}

/**
 * Inspect each roll some hours after it was made. @returns {Promise<{ passed: Array<{ id, roll_no, length_m, passedAt }>, pending: number }>}
 */
export async function qcRolls(sim, rolls) {
  const causes = await rollCauses(sim, rolls.map((r) => r.id));
  const passed = [];
  let pending = 0;
  for (const roll of rolls) {
    const at = sim.after(roll.createdAt, sim.rng.int(SIM.qcDelayHours.min * 60, SIM.qcDelayHours.max * 60));
    if (at > sim.now) { pending++; continue; }
    const code = defectFor(sim, causes.get(roll.id));
    if (!code) {
      await inspect(sim, roll.id, 'pass', null, at);
      passed.push({ ...roll, passedAt: at });
    } else if (sim.rng.chance(PATTERNS.reworkShare)) {
      await inspect(sim, roll.id, 'rework', code, at);
      const ok = await rework(sim, roll, at);
      if (ok) passed.push({ ...roll, passedAt: ok });
    } else {
      await inspect(sim, roll.id, 'reject', code, at);
    }
  }
  return { passed, pending };
}

// ---- dispatch, delivery, payment --------------------------------------------------------------------------------------------------------

const plate = (sim, prefix) => `${prefix}${sim.rng.int(1000, 9999)}`;

/** One dispatch of `rolls` at `at`: packed, confirmed (invoice), on the road, delivered a day or two later. @returns the invoice id */
async function ship(sim, orderId, rolls, at) {
  const late = sim.rng.chance(0.2);                       // one delivery in five arrives a day late
  const d = await createDispatch(sim.ctx.dispatch, {
    order_id: orderId, vehicle_no: plate(sim, 'GJ05'), driver_name: sim.rng.pick(['Raju', 'Salim', 'Gurpreet', 'Mohan']),
    driver_phone: `98${sim.rng.int(10000000, 99999999)}`,
  }, { at });
  let t = at;
  for (const r of rolls) { t = sim.after(t, 2); await scanRoll(sim.ctx.dispatch, d.id, { code: r.roll_no }, { at: t }); }
  const confirmed = sim.after(t, sim.rng.int(10, 40));
  const { invoice_id: invoiceId } = await confirmDispatch(sim.ctx.dispatch, d.id, { at: confirmed });
  const leaves = sim.after(confirmed, sim.rng.int(30, 120));
  if (leaves > sim.now) return { invoiceId, delivered: false };
  await updateStatus(sim.ctx.dispatch, d.id, 'in_transit', { at: leaves });
  const arrives = sim.after(leaves, (sim.rng.int(18, 40) + (late ? 24 : 0)) * 60);
  if (arrives > sim.now) return { invoiceId, delivered: false };
  await updateStatus(sim.ctx.dispatch, d.id, 'delivered', { at: arrives });
  return { invoiceId, delivered: true };
}

/** The buyer pays the way its profile says: on time, late, partly, or never (the overdue receivables the AI should flag). */
async function pay(sim, buyer, invoiceId) {
  const [inv] = await sim.sql(`select total::float as total, invoice_date, due_date from invoices where id = $1`, [invoiceId]);
  const habit = sim.rng.weighted(BUYERS[buyer]?.pays ?? PATTERNS.paymentMix);
  if (habit === 'never') return;
  const due = new Date(`${inv.due_date}T11:00:00+05:30`);
  const when = habit === 'onTime' ? sim.after(due, -sim.rng.int(1, 10) * 1440) : sim.after(due, sim.rng.int(5, 25) * 1440);
  if (when > sim.now) return;
  const amount = habit === 'partial' ? round2(inv.total * 0.5) : inv.total;
  await recordPayment(sim.ctx.accounts, {
    invoice_id: invoiceId, amount, mode: sim.rng.pick(['bank', 'bank', 'upi', 'cheque']), ref_no: `UTR${sim.rng.int(100000, 999999)}`,
    paid_at: istParts(when).date,
  }, { at: when });
}

/**
 * Ship what passed QC: everything at once, or (sometimes) in two parts a day apart. Each dispatch is invoiced and paid per buyer habit.
 */
export async function shipOrder(sim, { orderId, buyer, passed }) {
  if (!passed.length) return;
  const sorted = [...passed].sort((a, b) => a.passedAt - b.passedAt);
  const ready = sim.after(sorted.at(-1).passedAt, sim.rng.int(4, 20) * 60);
  const parts = sorted.length > 3 && sim.rng.chance(SIM.partialDispatchShare)
    ? [[sorted.slice(0, Math.ceil(sorted.length / 2)), sim.after(sorted[Math.ceil(sorted.length / 2) - 1].passedAt, 180)],
       [sorted.slice(Math.ceil(sorted.length / 2)), ready]]
    : [[sorted, ready]];
  for (const [rolls, at] of parts) {
    if (at > sim.now) continue;                                  // ready to ship, not shipped yet
    const { invoiceId } = await ship(sim, orderId, rolls, at);
    await pay(sim, buyer, invoiceId);
  }
}
