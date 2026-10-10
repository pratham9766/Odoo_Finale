// What the simulation knows about Everest: ids by name, the people to act as, the machines with their schedules.
// Loaded once from the seeded database; every generator receives the same `sim` object.

import { withTx } from '../../../server/src/db/tx.js';
import { loadContext } from '../../../server/src/middleware/staff.js';
import { loadShifts } from '../../../server/src/modules/mill/mill.service.js';
import { shiftContaining } from '../../../server/src/utils/shifts.js';
import { createRng } from '../lib/rng.js';
import { ACTORS, FIXED_OPERATORS } from './config.js';

const byKey = (rows, key) => Object.fromEntries(rows.map((r) => [r[key], r]));

/** @param {{ query: Function }} admin  a connection that bypasses RLS (the migration role) */
export async function loadWorld(admin, { now, days, seed, log = () => {} }) {
  const { rows: [mill] } = await admin.query(`select name from mill`);
  if (!mill) throw new Error('The mill is not in the database: run the seed first');
  const rows = async (sql, params = []) => (await admin.query(sql, params)).rows;

  const people = byKey(await rows(`select email, id from profiles where role_id is not null`), 'email');
  const ctx = {};
  for (const [role, email] of Object.entries(ACTORS)) {
    if (!people[email]) throw new Error(`${email} is not staff of ${mill.name}`);
    ctx[role] = await loadContext(people[email].id);
  }

  const stages = await rows(`select id, name, sequence, output_kind from stages order by sequence`);
  const machines = (await rows(
    `select id, code, stage_id, capacity_per_hour::float as capacity, capacity_uom as uom from machines where active order by stage_id, length(code), code`))
    .map((m) => ({ ...m, freeAt: new Date(now.getTime() - days * 86_400_000), brokenUntil: null, nextBreakdown: null }));
  const items = (await rows(
    `select id, sku, kind, name, uom, width_m::float as width_m, gsm::float as gsm, roll_length_m::float as roll_length_m,
            reorder_level::float as reorder_level, std_rate::float as std_rate from items`));
  const workers = await rows(`select id, name, emp_code, stage_id, default_shift_id, wage_type from workers where active order by emp_code`);
  const shifts = await withTx((db) => loadShifts(db));

  const world = {
    admin, millName: mill.name, now, days, start: new Date(now.getTime() - days * 86_400_000), rng: createRng(seed), log,
    ctx, shifts, stages, machines,
    machinesOfStage: (stageId) => machines.filter((m) => m.stage_id === stageId),
    stageById: byKey(stages, 'id'),
    item: byKey(items, 'sku'), itemById: byKey(items, 'id'),
    contact: byKey(await rows(`select id, name, type, email from contacts`), 'name'),
    defectType: byKey(await rows(`select id, code from defect_types`), 'code'),
    workers, roster: new Map(),
    /** One query against the database, bypassing RLS: [rows]. */
    sql: async (text, params = []) => (await admin.query(text, params)).rows,
  };
  for (const w of workers) {
    const key = `${w.stage_id}|${w.default_shift_id}`;
    world.roster.set(key, [...(world.roster.get(key) ?? []), w]);
  }

  /** The operator on `machine` at `at`: the same worker every shift (by the machine's position), unless the story fixes one. */
  world.operatorOn = (machine, at) => {
    const running = shiftContaining(shifts, at);
    if (!running) return null;
    const pool = world.roster.get(`${machine.stage_id}|${running.shift.id}`) ?? [];
    const fixed = FIXED_OPERATORS[`${machine.code}|${running.shift.name}`];
    const index = world.machinesOfStage(machine.stage_id).indexOf(machine);
    return pool.find((w) => w.name === fixed) ?? pool[index % Math.max(pool.length, 1)] ?? null;
  };
  /** An "x hours after" helper that keeps the arithmetic out of the generators. */
  world.after = (date, minutes) => new Date(date.getTime() + minutes * 60_000);
  world.within = (min, max) => world.rng.int(min, max);
  return world;
}
