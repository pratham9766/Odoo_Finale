import { api } from '@/lib/api';

// ─── List ──────────────────────────────────────────────────────────────────
export async function fetchOrders({ status, q, search, risk, page = 1, limit = 20, pageSize = 20, signal } = {}) {
  const params = new URLSearchParams();
  params.set('page', page);
  params.set('limit', limit || pageSize);
  if (status && status !== 'all') params.set('status', status);
  if (q || search) params.set('q', q || search);
  if (risk) params.set('risk', risk);
  return api.get(`/orders?${params}`, { signal });
}

// ─── Detail ───────────────────────────────────────────────────────────────
export async function fetchOrder({ id, signal }) {
  return api.get(`/orders/${id}`, { signal });
}

// ─── Create ───────────────────────────────────────────────────────────────
export async function createOrder(payload) {
  return api.post('/orders', payload);
}

// ─── Actions ──────────────────────────────────────────────────────────────
export async function confirmOrder(id) {
  return api.post(`/orders/${id}/confirm`, {});
}

export async function reserveMaterial(id) {
  return api.post(`/orders/${id}/reserve`, {});
}

export async function cancelOrder({ id, reason }) {
  return api.post(`/orders/${id}/cancel`, { reason });
}

export async function createTrackingLink(id) {
  return api.post(`/orders/${id}/tracking-link`, {});
}

export async function planOrder(id) {
  return api.post(`/orders/${id}/plan`, {});
}

// ─── Requirements ─────────────────────────────────────────────────────────
export async function fetchOrderRequirements({ id, signal }) {
  return api.get(`/orders/${id}/requirements`, { signal });
}
