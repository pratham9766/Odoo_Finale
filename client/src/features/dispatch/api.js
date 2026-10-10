import { api, download } from '@/lib/api';

// ─── List ──────────────────────────────────────────────────────────────────
export async function fetchDispatches({ status, page = 1, limit = 50, signal } = {}) {
  const params = new URLSearchParams({ page, limit });
  if (status && status !== 'all') params.set('status', status);
  return api.get(`/dispatches?${params}`, { signal });
}

// ─── Detail ───────────────────────────────────────────────────────────────
export async function fetchDispatch({ id, signal }) {
  return api.get(`/dispatches/${id}`, { signal });
}

// ─── Create ───────────────────────────────────────────────────────────────
export async function createDispatch(payload) {
  return api.post('/dispatches', payload);
}

// ─── Scan Roll onto Truck ─────────────────────────────────────────────────
export async function scanRoll({ id, code, roll_no }) {
  return api.post(`/dispatches/${id}/scan`, { code: code || roll_no, roll_no });
}

// ─── Remove Roll from Packing List ─────────────────────────────────────────
export async function removePackingRow({ id, rollId }) {
  return api.delete(`/dispatches/${id}/rolls/${encodeURIComponent(rollId)}`);
}

// ─── Confirm Dispatch & Auto-generate Invoice ──────────────────────────────
export async function confirmDispatch({ id, payload }) {
  return api.post(`/dispatches/${id}/confirm`, payload || {});
}

// ─── Download Packing List PDF ─────────────────────────────────────────────
export async function downloadPackingListPdf(id, filename) {
  return download(`/dispatches/${id}/packing-list.pdf`, filename || `packing-list-${id}.pdf`);
}
