import { api } from '@/lib/api';

export async function fetchStock({ orgId, kind, search, signal }) {
  const params = new URLSearchParams();
  if (kind) params.set('kind', kind);
  if (search) params.set('search', search);
  return api.get(`/inventory/stock?${params}`, { signal, headers: { 'x-org-id': orgId } });
}

export async function fetchReceipts({ orgId, signal }) {
  return api.get('/inventory/receipts', { signal, headers: { 'x-org-id': orgId } });
}

export async function postReceipt({ orgId, payload }) {
  return api.post('/inventory/receipts', payload, { headers: { 'x-org-id': orgId } });
}

export async function saveDraftReceipt({ orgId, payload }) {
  return api.post('/inventory/receipts/draft', payload, { headers: { 'x-org-id': orgId } });
}
