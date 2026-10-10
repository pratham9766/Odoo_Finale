// Production for the story: machines are scheduled one order at a time (each machine knows when it is next free), work orders are
// run through the real services at the times the schedule gives them, breakdowns happen in the gaps, and anything that would
// happen after "now" simply has not happened yet: that is what leaves running machines, half-made orders and a QC queue at the end.

import { resolveTicket, reportBreakdown, startTicket } from '../../../server/src/modules/maintenance/maintenance.service.js';
import { planOrder } from '../../../server/src/modules/production/planning.service.js';
import { logProduction } from '../../../server/src/modules/production/productionLogs.service.js';
import { finishWorkOrder, startWorkOrder } from '../../../server/src/modules/production/workOrderActions.service.js';
import { workOrders } from '../../../server/src/modules/production/workOrders.service.js';
import { createRoll } from '../../../server/src/modules/quality/rolls.service.js';
import { round2 } from '../../../server/src/utils/money.js';
import { shiftContaining } from '../../../server/src/utils/shifts.js';
import { fabricMetresToKg, round3 } from '../../../server/src/utils/textile.js';
import { PATTERNS, SIM } from './config.js';
import { setOrderStatus } from './adapters.js';

const FOREVER = new Date(8.64e15);                 // a machine that is busy past "now" never frees up in the story
const SCRAP_OF = { yarn: 'SCR-FIBRE', grey_fabric: 'SCR-YARN', finished_fabric: 'SCR-FABRIC' };   // what each stage's waste is booked to
const FAULTS = ['Drive belt snapped', 'Motor overheating', 'Sensor fault', 'Bearing failure', 'Pump pressure loss', 'Needle bar jammed'];

const isNight = (sim, at) => shiftContaining(sim.shifts, at)?.shift.name === 'C';
const ratePerHour = (sim, machine, at) => machine.capacity * SIM.efficiency * (isNight(sim, at) ? PATTERNS.nightOutputFactor : 1);

// ---- breakdowns -------------------------------------------------------------------------------------------------------------------------

/** Every machine breaks down now and then: the first one at a random point in the first weeks, then about every three weeks. */
export function scheduleBreakdowns(sim) {
  for (const m of sim.machines) m.nextBreakdown = sim.after(sim.start, sim.rng.int(3, PATTERNS.breakdownEveryDays + 7) * 1440);
}

const nextBreakdownAfter = (sim, at) => sim.after(at, sim.rng.int(PATTERNS.breakdownEveryDays - 7, PATTERNS.breakdownEveryDays + 7) * 1440);

/** A breakdown with its repair ticket, starting at `down` and ending when the technician resolves it. @returns {Date} when the machine is back */
export async function breakdown(sim, machine, down) {
  const hours = sim.rng.int(PATTERNS.breakdownHours.min, PATTERNS.breakdownHours.max);
  const fault = sim.rng.pick(FAULTS);
  const ticket = await reportBreakdown(sim.ctx.prod, machine.id, { reason: fault, priority: hours > 4 ? 'high' : 'normal' }, { at: down });
  await startTicket(sim.ctx.maint, ticket.id, { at: sim.after(down, sim.rng.int(15, 45)) });
  const back = sim.after(down, hours * 60);
  await resolveTicket(sim.ctx.maint, ticket.id, { resolution: `${fault}: repaired`, parts_used: sim.rng.chance(0.5) ? 'Spare kit' : null }, { at: back });
  return back;
}

/** Breakdowns that fall before `notBefore` happen first (in the gap the machine has anyway). @returns {Promise<Date>} the earliest the machine can start work */
async function repairIfDue(sim, machine, notBefore) {
  let earliest = notBefore;
  while (machine.nextBreakdown && machine.nextBreakdown <= earliest) {
    const down = new Date(Math.max(machine.nextBreakdown, machine.freeAt));
    if (sim.after(down, PATTERNS.breakdownHours.max * 60) > sim.now) break;     // it would not be over yet: leave the machine alone
    const back = await breakdown(sim, machine, down);
    machine.freeAt = back;
    machine.nextBreakdown = nextBreakdownAfter(sim, back);
    earliest = new Date(Math.max(earliest.getTime(), back.getTime()));
  }
  return earliest;
}

// ---- running a work order ---------------------------------------------------------------------------------------------------------------

/** The machine of the stage that can start soonest, and is not about to be the one that is down at "now". */
function pickMachine(sim, stageId, readyAt, minutes) {
  const fits = (m) => !m.downFrom || sim.after(new Date(Math.max(readyAt, m.freeAt)), minutes) <= m.downFrom;
  return sim.machinesOfStage(stageId).filter((m) => m.freeAt < FOREVER && fits(m)).sort((a, b) => a.freeAt - b.freeAt)[0] ?? null;
}

const estimateMinutes = (sim, wo, machine, at) => Math.ceil((wo.target_qty / ratePerHour(sim, machine, at)) * 60 * 1.1);

/** Rolls of the final stage are made while it runs: a full roll as soon as its length has been produced, the short one at the end. */
function rollMaker(sim, wo) {
  const item = sim.itemById[wo.output_item_id];
  const rollLength = item.roll_length_m ?? 50;
  const made = [];
  let metres = 0;
  const make = async (length, at) => {
    const weight = item.width_m && item.gsm ? round2(fabricMetresToKg(length, item.width_m, item.gsm)) : undefined;
    const roll = await createRoll(sim.ctx.prod, { work_order_id: wo.id, length_m: length, weight_kg: weight }, { at });
    made.push({ id: roll.id, roll_no: roll.roll_no, length_m: length, createdAt: at });
    metres += length;
  };
  return {
    made,
    async upTo(produced, at) { while (metres + rollLength <= Math.min(produced, wo.target_qty) + 1e-6) await make(rollLength, at); },
    async rest(at) { const left = round2(wo.target_qty - metres); if (left >= 5) await make(left, at); },
  };
}

/** How much of the material a stage lost: its planned loss give or take, except W-3, which wastes far more yarn. */
function wastePercent(sim, wo, machine) {
  if (machine.code === 'W-3' && sim.stageById[wo.stage_id].output_kind === 'grey_fabric') {
    return PATTERNS.w3WastePct.min + sim.rng.next() * (PATTERNS.w3WastePct.max - PATTERNS.w3WastePct.min);
  }
  return Math.max(0.5, sim.plannedLoss[wo.stage_id] + (sim.rng.next() * 2 - 1) * PATTERNS.wasteSpread);
}

async function finish(sim, wo, machine, at) {
  const [{ input }] = await sim.sql(`select coalesce(sum(qty), 0)::float as input from material_issues where work_order_id = $1`, [wo.id]);
  const waste = (input * wastePercent(sim, wo, machine)) / 100;
  await finishWorkOrder(sim.ctx.prod, wo.id, {
    good_qty: round3(wo.target_qty * (1 + SIM.overrunPct / 100)), good_weight_kg: round3(input - waste), waste_qty: round3(waste),
    waste_item_id: sim.item[SCRAP_OF[sim.stageById[wo.stage_id].output_kind]]?.id, waste_type: 'process loss',
  }, { at });
}

/**
 * Run one work order from `readyAt`: pick a machine, start it, log output every couple of hours, finish. Stops wherever "now" is.
 * `rework` work orders have no material and no output logs: the roll goes back through the stage and comes out the same length.
 * @returns {Promise<{ complete: boolean, end: Date|null }>}
 */
export async function runWorkOrder(sim, wo, readyAt, { rework = false, rolls = null } = {}) {
  const minutes = rework ? 150 : estimateMinutes(sim, wo, sim.machinesOfStage(wo.stage_id)[0], readyAt);
  const machine = pickMachine(sim, wo.stage_id, readyAt, minutes);
  if (!machine) return { complete: false, end: null };
  const start = await repairIfDue(sim, machine, new Date(Math.max(readyAt, machine.freeAt)));
  await workOrders.update(sim.ctx.prod, wo.id, { machine_id: machine.id });
  if (start > sim.now) { machine.freeAt = FOREVER; return { complete: false, end: null }; }

  await startWorkOrder(sim.ctx.prod, wo.id, { at: start });
  if (rework) {
    const end = sim.after(start, sim.rng.int(90, 240));
    if (end > sim.now) { machine.freeAt = FOREVER; return { complete: false, end: null }; }
    await finishWorkOrder(sim.ctx.prod, wo.id, { good_qty: wo.target_qty, waste_qty: 0 }, { at: end });
    machine.freeAt = end;
    return { complete: true, end };
  }

  let produced = 0, cursor = start;
  while (produced < wo.target_qty - 1e-6) {
    const rate = ratePerHour(sim, machine, sim.after(cursor, SIM.logEveryMinutes / 2));
    const remaining = wo.target_qty - produced;
    const step = Math.min(SIM.logEveryMinutes, Math.max(1, Math.ceil((remaining / rate) * 60)));
    const at = sim.after(cursor, step);
    if (at > sim.now) { machine.freeAt = FOREVER; return { complete: false, end: null }; }
    const qty = round3(Math.min(remaining, (rate * step) / 60));
    await logProduction(sim.ctx.prod, wo.id, { qty, worker_id: sim.operatorOn(machine, at)?.id }, { at });
    produced += qty;
    cursor = at;
    await rolls?.upTo(produced, at);
  }
  await rolls?.rest(cursor);
  await finish(sim, wo, machine, cursor);
  machine.freeAt = cursor;
  return { complete: true, end: cursor };
}

// ---- an order through the stages --------------------------------------------------------------------------------------------------------

/**
 * Plan the order and run its work orders stage by stage (the work orders of one stage in parallel, on different machines).
 * @returns {Promise<{ complete: boolean, rolls: Array<{ id, roll_no, length_m, createdAt }> }>} rolls so far; complete = every stage finished
 */
export async function produceOrder(sim, orderId, readyAt) {
  const planAt = sim.after(readyAt, -60);
  if (planAt > sim.now) { await setOrderStatus(sim, orderId, 'waiting_material'); return { complete: false, rolls: [] }; }

  const planned = await planOrder(sim.ctx.prod, orderId, { at: planAt });
  await setOrderStatus(sim, orderId, 'in_production');
  const sequenceOf = (wo) => sim.stageById[wo.stage_id].sequence;
  const last = Math.max(...planned.map(sequenceOf), 0);
  const bySequence = Map.groupBy(planned, sequenceOf);

  const rolls = [];
  let ready = readyAt;
  for (const sequence of [...bySequence.keys()].sort((a, b) => a - b)) {
    let stageEnd = ready;
    for (const wo of bySequence.get(sequence)) {
      const maker = sequence === last ? rollMaker(sim, wo) : null;
      const result = await runWorkOrder(sim, wo, ready, { rolls: maker });
      if (maker) rolls.push(...maker.made);
      if (!result.complete) return { complete: false, rolls };
      stageEnd = new Date(Math.max(stageEnd.getTime(), result.end.getTime()));
    }
    ready = sim.after(stageEnd, sim.rng.int(SIM.handoffMinutes.min, SIM.handoffMinutes.max));
  }
  return { complete: true, rolls };
}
