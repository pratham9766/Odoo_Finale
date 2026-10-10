// Breakdowns and maintenance tickets (backend plan §10.7, §11.7). A breakdown opens a ticket; the technician starts it and resolves it.
// Every function takes an optional `{ at }` so the seed can replay history.

import { withTenant } from '../../db/withTenant.js';
import { bus } from '../../events/bus.js';
import { isInScope } from '../../middleware/rbac.js';
import { createCrud } from '../../utils/crud/index.js';
import { AppError } from '../../utils/errors.js';
import { nextNumber } from '../../utils/numbering.js';
import { publishMachine } from '../production/board.service.js';
import { assertUsableMachine } from '../production/machineRules.js';
import { setMachineStatus } from '../production/machineStatus.js';

const crud = createCrud({
  table: 'maintenance_tickets', label: 'Ticket',
  columns: [],
  select: `t.*, m.code as machine_code, s.name as stage, p.full_name as technician,
           (extract(epoch from coalesce(t.resolved_at, now()) - t.opened_at) / 60)::int as downtime_minutes`,
  joins: `join machines m on m.id = t.machine_id
          join stages s on s.id = m.stage_id
          left join memberships mem on mem.id = t.assigned_to
          left join profiles p on p.id = mem.user_id`,
  orderBy: `case t.status when 'open' then 0 when 'in_progress' then 1 else 2 end, t.opened_at desc`,
  scope: (f, ctx) => f.anyOf('m.stage_id', ctx.scope?.stage_ids).anyOf('t.machine_id', ctx.scope?.machine_ids),
  filters: (f, q) => f.eq('t.status', q.status).eq('t.machine_id', q.machine_id),
});
// tickets come from breakdowns and change only through start / resolve
export const tickets = { list: crud.list, get: crud.get };

/** The ticket and its machine, both locked; 403 when the machine is outside the caller's area. */
async function lockTicket(db, ctx, id) {
  const { rows: [ticket] } = await db.query(
    `select t.*, m.stage_id from maintenance_tickets t join machines m on m.id = t.machine_id
      where t.id = $1 and t.org_id = $2 for update of t`, [id, ctx.orgId]);
  if (!ticket) throw new AppError(404, 'NOT_FOUND', 'Ticket not found');
  if (!isInScope(ctx, 'machine', ticket.machine_id) || !isInScope(ctx, 'stage', ticket.stage_id)) {
    throw new AppError(403, 'OUT_OF_SCOPE', `Ticket ${ticket.ticket_no} is outside your assigned area`);
  }
  const { rows: [machine] } = await db.query(`select id, status from machines where id = $1 for update`, [ticket.machine_id]);
  return { ticket, machine };
}

/** Report a machine as broken down: pauses the work order running on it and opens a ticket. */
export async function reportBreakdown(ctx, machineId, { reason, priority = 'high' }, { at = new Date() } = {}) {
  const ticketId = await withTenant(ctx, async (db) => {
    const machine = await assertUsableMachine(db, ctx, machineId, { lock: true });
    if (machine.status === 'breakdown') throw new AppError(409, 'INVALID_STATE_TRANSITION', `Machine ${machine.code} is already broken down`);

    if (machine.current_work_order_id) {
      await db.query(`update work_orders set status = 'paused' where id = $1 and status = 'running'`, [machine.current_work_order_id]);
    }
    const event = await setMachineStatus(db, ctx, machine.id, 'breakdown', { reason, at });
    const { rows: [ticket] } = await db.query(
      `insert into maintenance_tickets (org_id, ticket_no, machine_id, machine_event_id, reason, priority, opened_at, created_by)
       values ($1, $2, $3, $4, $5, $6, $7, $8) returning id`,
      [ctx.orgId, await nextNumber(db, ctx.orgId, 'TKT'), machine.id, event.id, reason, priority, at, ctx.userId]);
    return ticket.id;
  });
  bus.emit('machine.breakdown', { orgId: ctx.orgId, machineId, ticketId });
  await publishMachine(ctx.orgId, machineId);
  return tickets.get(ctx, ticketId);
}

/** The technician takes the ticket: it goes in progress and the machine shows as under maintenance. */
export async function startTicket(ctx, id, { at = new Date() } = {}) {
  const machineId = await withTenant(ctx, async (db) => {
    const { ticket, machine } = await lockTicket(db, ctx, id);
    if (ticket.status !== 'open') throw new AppError(409, 'INVALID_STATE_TRANSITION', `Ticket ${ticket.ticket_no} is ${ticket.status}, not open`);
    await db.query(`update maintenance_tickets set status = 'in_progress', assigned_to = $2 where id = $1`, [id, ctx.membershipId]);
    if (machine.status === 'breakdown') await setMachineStatus(db, ctx, machine.id, 'maintenance', { reason: ticket.reason, at });
    return machine.id;
  });
  await publishMachine(ctx.orgId, machineId);
  return tickets.get(ctx, id);
}

/** Close the ticket and put the machine back to idle (its paused work order can be resumed). */
export async function resolveTicket(ctx, id, { resolution, parts_used }, { at = new Date() } = {}) {
  const machineId = await withTenant(ctx, async (db) => {
    const { ticket, machine } = await lockTicket(db, ctx, id);
    if (ticket.status === 'resolved') throw new AppError(409, 'INVALID_STATE_TRANSITION', `Ticket ${ticket.ticket_no} is already resolved`);
    await db.query(
      `update maintenance_tickets set status = 'resolved', resolution = $2, parts_used = $3, resolved_at = $4,
              assigned_to = coalesce(assigned_to, $5) where id = $1`, [id, resolution, parts_used ?? null, at, ctx.membershipId]);
    if (['breakdown', 'maintenance'].includes(machine.status)) {
      await setMachineStatus(db, ctx, machine.id, 'idle', { reason: 'repaired', at });
    }
    return machine.id;
  });
  bus.emit('ticket.resolved', { orgId: ctx.orgId, ticketId: id });
  await publishMachine(ctx.orgId, machineId);
  return tickets.get(ctx, id);
}
