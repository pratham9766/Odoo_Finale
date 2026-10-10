import { api } from '@/lib/api';

// ─── Machine Board ─────────────────────────────────────────────────────────
export async function fetchMachineBoard({ stageId, mine, signal } = {}) {
  const params = new URLSearchParams();
  if (stageId) params.set('stage_id', stageId);
  if (mine) params.set('mine', 'true');
  return api.get(`/production/board?${params}`, { signal });
}

// ─── Work Orders ───────────────────────────────────────────────────────────
export async function fetchWorkOrders({ status, orderId, machineId, page = 1, limit = 50, signal } = {}) {
  const params = new URLSearchParams({ page, limit });
  if (status && status !== 'all') params.set('status', status);
  if (orderId) params.set('order_id', orderId);
  if (machineId) params.set('machine_id', machineId);
  return api.get(`/work-orders?${params}`, { signal });
}

export async function fetchWorkOrder({ id, signal } = {}) {
  return api.get(`/work-orders/${id}`, { signal });
}

export async function startWorkOrder(id) {
  return api.post(`/work-orders/${id}/start`, {});
}

export async function pauseWorkOrder({ id, reason } = {}) {
  return api.post(`/work-orders/${id}/pause`, { reason });
}

export async function resumeWorkOrder(id) {
  return api.post(`/work-orders/${id}/resume`, {});
}

export async function logProduction({ id, qty, uom, waste_qty } = {}) {
  return api.post(`/work-orders/${id}/logs`, { qty, uom, waste_qty });
}

export async function finishWorkOrder({ id, final_qty, uom } = {}) {
  return api.post(`/work-orders/${id}/finish`, { final_qty, uom });
}

export async function assignMachineToWorkOrder({ id, machineId } = {}) {
  return api.put(`/work-orders/${id}`, { machine_id: machineId });
}

// ─── Machines Master & Breakdown ───────────────────────────────────────────
export async function fetchMachines({ active, stageId, status, signal } = {}) {
  const params = new URLSearchParams();
  if (active !== undefined) params.set('active', active);
  if (stageId) params.set('stage_id', stageId);
  if (status) params.set('status', status);
  return api.get(`/machines?${params}`, { signal });
}

export async function reportMachineBreakdown({ machineId, reason } = {}) {
  return api.post(`/machines/${machineId}/breakdown`, { reason: reason || 'Machine breakdown' });
}

// ─── Assignments ───────────────────────────────────────────────────────────
export async function fetchAssignments({ date, shiftId, signal } = {}) {
  const params = new URLSearchParams();
  if (date) params.set('date', date);
  if (shiftId) params.set('shift_id', shiftId);
  return api.get(`/assignments?${params}`, { signal });
}

export async function saveAssignments(assignments) {
  return api.post('/assignments', { assignments });
}
