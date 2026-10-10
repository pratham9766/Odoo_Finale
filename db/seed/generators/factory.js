// Factory masters: stages + losses, shifts, defect types, warehouses, machines.

import { idsBy, insertRows, need } from '../lib/insert.js';

/** { prefix: 'W', count: 8, ... } → W-1 … W-8, each with a little capacity jitter so the machines are not clones. */
export function expandMachines(groups, rng) {
  return groups.flatMap((g) => Array.from({ length: g.count }, (_, i) => ({
    code: `${g.prefix}-${i + 1}`,
    name: `${g.label} ${i + 1}`,
    stage: g.stage,
    capacity_per_hour: Math.round(g.capacity * (0.9 + rng.next() * 0.2)),
    capacity_uom: g.uom,
    hourly_overhead: g.overhead,
  })));
}

/** @returns {{ stageId, shiftId, warehouseId, machineId: Object<string,string> }} name/code → id maps */
export async function seedFactory(db, profile, rng) {
  const stages = await insertRows(db, 'stages',
    profile.stages.map(({ name, sequence, output_kind }) => ({ name, sequence, output_kind })));
  const stageId = idsBy(stages, 'name');
  await insertRows(db, 'stage_losses', profile.stages.map((s) => ({
    stage_id: stageId[s.name], weight_loss_pct: s.weight_loss_pct, length_shrink_pct: s.length_shrink_pct,
  })));

  const shiftId = idsBy(await insertRows(db, 'shifts', profile.shifts), 'name');
  await insertRows(db, 'defect_types', profile.defectTypes);
  const warehouseId = idsBy(await insertRows(db, 'warehouses', profile.warehouses), 'name');

  const machines = expandMachines(profile.machines, rng).map(({ stage, ...m }) => ({
    ...m, stage_id: need(stageId, stage, 'stage'),
  }));
  const machineId = idsBy(await insertRows(db, 'machines', machines), 'code');

  return { stageId, shiftId, warehouseId, machineId };
}
