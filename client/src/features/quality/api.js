import { api } from '@/lib/api';

// ─── Queue ─────────────────────────────────────────────────────────────────
export async function fetchQCQueue({ status = 'pending_qc', q, orderId, page = 1, limit = 50, signal } = {}) {
  const params = new URLSearchParams({ page, limit });
  if (status && status !== 'all') params.set('status', status);
  if (q) params.set('q', q);
  if (orderId) params.set('order_id', orderId);
  return api.get(`/qc/queue?${params}`, { signal });
}

// ─── Roll Lookup ───────────────────────────────────────────────────────────
export async function lookupRoll({ rollNo, signal } = {}) {
  return api.get(`/rolls/${encodeURIComponent(rollNo)}`, { signal });
}

// ─── Roll Trace ────────────────────────────────────────────────────────────
export async function fetchRollTrace({ rollNo, signal } = {}) {
  return api.get(`/rolls/${encodeURIComponent(rollNo)}/trace`, { signal });
}

// ─── Inspect ───────────────────────────────────────────────────────────────
export async function submitInspection(payload) {
  return api.post('/qc/inspections', payload);
}

// ─── Defect Types ─────────────────────────────────────────────────────────
export async function fetchDefectTypes({ signal } = {}) {
  return api.get('/qc/defects', { signal });
}
