// One machine status change = close the open machine_events row, open the next, update the machine.
// Start, pause, finish, breakdown and resolve all go through here, so downtime is always measured the same way.

/**
 * @param {string} status  idle | running | breakdown | maintenance
 * @param {{ reason?: string, workOrderId?: string|null, at: Date }} opts  workOrderId = what it is running (null unless 'running')
 * @returns the new machine_events row
 */
export async function setMachineStatus(db, ctx, machineId, status, { reason = null, workOrderId = null, at }) {
  await db.query(`update machine_events set ended_at = $2 where machine_id = $1 and ended_at is null`, [machineId, at]);
  const { rows: [event] } = await db.query(
    `insert into machine_events (machine_id, status, reason, started_at, created_by)
     values ($1, $2, $3, $4, $5) returning *`, [machineId, status, reason, at, ctx.userId]);
  await db.query(
    `update machines set status = $2, status_since = $3, current_work_order_id = $4 where id = $1`,
    [machineId, status, at, workOrderId]);
  return event;
}
