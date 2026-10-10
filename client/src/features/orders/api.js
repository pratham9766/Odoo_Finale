import { api } from '@/lib/api';

// ─── List ──────────────────────────────────────────────────────────────────
export async function fetchOrders({ orgId, status, search, page = 1, pageSize = 20, signal }) {
  const params = new URLSearchParams({ page, pageSize });
  if (status && status !== 'all') params.set('status', status);
  if (search) params.set('search', search);
  return api.get(`/orders?${params}`, { signal, headers: { 'x-org-id': orgId } });
}

// ─── Detail ───────────────────────────────────────────────────────────────
export async function fetchOrder({ id, orgId, signal }) {
  return api.get(`/orders/${id}`, { signal, headers: { 'x-org-id': orgId } });
}

// ─── Create ───────────────────────────────────────────────────────────────
export async function createOrder({ orgId, payload }) {
  return api.post('/orders', payload, { headers: { 'x-org-id': orgId } });
}

// ─── Actions ──────────────────────────────────────────────────────────────
export async function confirmOrder({ id, orgId }) {
  return api.post(`/orders/${id}/confirm`, {}, { headers: { 'x-org-id': orgId } });
}

export async function reserveMaterial({ id, orgId }) {
  return api.post(`/orders/${id}/reserve`, {}, { headers: { 'x-org-id': orgId } });
}

export async function cancelOrder({ id, orgId, reason }) {
  return api.post(`/orders/${id}/cancel`, { reason }, { headers: { 'x-org-id': orgId } });
}

// ─── Requirements ─────────────────────────────────────────────────────────
export async function fetchOrderRequirements({ id, orgId, signal }) {
  return api.get(`/orders/${id}/requirements`, { signal, headers: { 'x-org-id': orgId } });
}
