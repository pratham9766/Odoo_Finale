import { api } from '@/lib/api';

// CONTRACT NOTE: Scan payload is {roll_no} — see FRONTEND_CONTRACT_NOTES.md #1
// Camera and manual entry both use the same mutation to avoid divergent shapes.

export async function fetchDispatches({ orgId, signal }) {
  return api.get('/dispatch', { signal, headers: { 'x-org-id': orgId } });
}

export async function fetchDispatch({ id, orgId, signal }) {
  return api.get(`/dispatch/${id}`, { signal, headers: { 'x-org-id': orgId } });
}

export async function createDispatch({ orgId, payload }) {
  return api.post('/dispatch', payload, { headers: { 'x-org-id': orgId } });
}

// Unified scan mutation — same payload from camera AND manual entry
export async function scanRoll({ id, orgId, roll_no }) {
  return api.post(`/dispatch/${id}/scan`, { roll_no }, { headers: { 'x-org-id': orgId } });
}

export async function removePackingRow({ id, orgId, roll_no }) {
  return api.delete(`/dispatch/${id}/scan/${encodeURIComponent(roll_no)}`, { headers: { 'x-org-id': orgId } });
}

export async function confirmDispatch({ id, orgId, payload }) {
  // Server must revalidate before confirming
  return api.post(`/dispatch/${id}/confirm`, payload, { headers: { 'x-org-id': orgId } });
}
