import { on } from '../bus.js';
import { emitTo, emitToMill } from '../../realtime/socket.js';

// bus event -> socket room. Payloads carry ids/status only (no prices); clients refetch via the API.
export function registerSocketEmitter() {
  on('order.updated', (p) => {
    const data = { orderId: p.orderId, status: p.to, progress_pct: p.progress_pct, risk: p.risk };
    emitTo(`order:${p.orderId}`, 'order.status_changed', data);
    emitToMill('order.status_changed', data);
  });
  on('workorder.started', (p) => emitToMill('machine.updated', { machineId: p.machineId }));
  on('workorder.finished', (p) => emitToMill('machine.updated', { machineId: p.machineId }));
  on('machine.breakdown', (p) => emitToMill('machine.updated', { machineId: p.machineId }));
  on('production.logged', (p) => emitToMill('production.logged', { machineId: p.machineId, workOrderId: p.workOrderId }));
  on('roll.created', () => emitToMill('qc.queue_changed', {}));
  on('qc.done', () => emitToMill('qc.queue_changed', {}));
}
