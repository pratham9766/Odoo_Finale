// Workers with QR badges: a few named ones the demo script refers to, the rest generated to fill each stage.

import { FIRST_NAMES, LAST_NAMES, SKILLS } from '../config.js';
import { idsBy, insertRows, need } from '../lib/insert.js';

const SHIFT_WEIGHTS = [0.4, 0.35, 0.25];   // A, B, C: fewer people on nights

/** Pay terms for a wage type: daily/hourly OT is 1.5× the hourly equivalent; piece workers get a flat OT rate. */
function payFor(wageType, rng, given = {}) {
  if (wageType === 'daily') {
    const rate = given.rate ?? rng.stepped(520, 780, 10);
    return { rate, ot_rate: Math.round((rate / 8) * 1.5), piece_rate: 0 };
  }
  if (wageType === 'hourly') {
    const rate = given.rate ?? rng.stepped(65, 95, 5);
    return { rate, ot_rate: Math.round(rate * 1.5), piece_rate: 0 };
  }
  return { rate: 0, ot_rate: 90, piece_rate: given.piece_rate ?? rng.stepped(50, 150, 5) / 100 };
}

/** @returns {{ workerId: Object<string,string> }} name → id */
export async function seedWorkers(db, orgId, profile, { stageId, shiftId }, rng) {
  const plan = profile.workers;
  const shiftNames = profile.shifts.map((s) => s.name);
  const taken = new Set(plan.named.map((w) => w.name));
  const uniqueName = () => {
    for (;;) {
      const name = `${rng.pick(FIRST_NAMES)} ${rng.pick(LAST_NAMES)}`;
      if (!taken.has(name)) { taken.add(name); return name; }
    }
  };

  // named workers fill their stage's quota first, then generated ones top it up
  const slots = [];
  for (const [stage, count] of Object.entries(plan.perStage)) {
    const named = plan.named.filter((w) => w.stage === stage);
    slots.push(...named);
    for (let i = named.length; i < count; i++) {
      slots.push({
        name: uniqueName(), stage,
        shift: rng.weighted(shiftNames.map((n, k) => [n, SHIFT_WEIGHTS[k]])),
        wage_type: rng.weighted(plan.wageMix),
        skill: rng.pick(SKILLS[stage]),
      });
    }
  }

  const rows = slots.map((w, i) => ({
    org_id: orgId,
    emp_code: `EMP-${String(i + 1).padStart(4, '0')}`,
    name: w.name,
    phone: `9${rng.int(100000000, 999999999)}`,
    skill: w.skill,
    stage_id: need(stageId, w.stage, 'stage'),
    default_shift_id: need(shiftId, w.shift, 'shift'),
    employment_type: rng.chance(plan.contractShare) ? 'contract' : 'permanent',
    wage_type: w.wage_type,
    ...payFor(w.wage_type, rng, w),
    qr_token: rng.token(16),
  }));

  return { workerId: idsBy(await insertRows(db, 'workers', rows), 'name') };
}
