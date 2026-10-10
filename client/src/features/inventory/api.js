import { api } from '@/lib/api';

// ─── Stock ─────────────────────────────────────────────────────────────────
export async function fetchStock({ kind, q, search, signal } = {}) {
  const params = new URLSearchParams();
  if (kind) params.set('kind', kind);
  if (q || search) params.set('q', q || search);
  return api.get(`/stock?${params}`, { signal });
}

export async function fetchFinishedStock({ signal } = {}) {
  return api.get('/stock/finished', { signal });
}

export async function fetchLots({ itemId, signal } = {}) {
  const params = new URLSearchParams();
  if (itemId) params.set('item_id', itemId);
  return api.get(`/stock/lots?${params}`, { signal });
}

// ─── Goods Receipts (GRN) ──────────────────────────────────────────────────
export async function fetchReceipts({ status, q, page = 1, limit = 50, signal } = {}) {
  const params = new URLSearchParams({ page, limit });
  if (status) params.set('status', status);
  if (q) params.set('q', q);
  return api.get(`/receipts?${params}`, { signal });
}

export async function fetchReceipt({ id, signal }) {
  return api.get(`/receipts/${id}`, { signal });
}

export async function createReceipt(payload) {
  return api.post('/receipts', payload);
}

export async function postReceipt(id) {
  return api.post(`/receipts/${id}/post`, {});
}

export async function cancelReceipt(id) {
  return api.post(`/receipts/${id}/cancel`, {});
}
