import { on } from '../bus.js';
import { emitTo, emitToOrgs } from '../../realtime/socket.js';

// bus event -> socket room. Payloads carry ids/status only (no prices); clients refetch via the API.
export function registerSocketEmitter() {
  on('order.updated', (p) => {
    const data = { orderId: p.orderId, status: p.to, progress_pct: p.progress_pct, risk: p.risk };
    emitTo(`order:${p.orderId}`, 'order.status_changed', data);
    emitToOrgs([p.sellerOrgId, p.buyerOrgId], 'order.status_changed', data);
  });
  on('workorder.started', (p) => emitTo(`org:${p.orgId}`, 'machine.updated', { machineId: p.machineId }));
  on('workorder.finished', (p) => emitTo(`org:${p.orgId}`, 'machine.updated', { machineId: p.machineId }));
  on('machine.breakdown', (p) => emitTo(`org:${p.orgId}`, 'machine.updated', { machineId: p.machineId }));
  on('production.logged', (p) => emitTo(`org:${p.orgId}`, 'production.logged', { machineId: p.machineId, workOrderId: p.workOrderId }));
  on('roll.created', (p) => emitTo(`org:${p.orgId}`, 'qc.queue_changed', {}));
  on('qc.done', (p) => emitTo(`org:${p.orgId}`, 'qc.queue_changed', {}));
  on('attendance.punched', (p) => emitTo(`org:${p.orgId}`, 'attendance.updated', {}));
  on('attendance.absent', (p) => emitTo(`org:${p.orgId}`, 'attendance.updated', {}));
  on('trip.status_changed', (p) => emitToOrgs([p.transporterOrgId, p.requesterOrgId, p.receiverOrgId], 'trip.status_changed', { tripId: p.tripId, status: p.status }));
}
