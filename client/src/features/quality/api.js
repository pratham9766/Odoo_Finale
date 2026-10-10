import { api } from '@/lib/api';

// CONTRACT NOTE: Scan payload shape is {roll_no} (not {code} as in sample service).
// Confirmed: we use roll_no from the QR label. camera and manual entry both send {roll_no}.
// If backend uses a qr_token, the token must resolve to a roll_no server-side.
// See FRONTEND_CONTRACT_NOTES.md issue #1.

export async function fetchQCQueue({ orgId, status, signal }) {
  const params = status && status !== 'all' ? `?status=${status}` : '';
  return api.get(`/qc/queue${params}`, { signal, headers: { 'x-org-id': orgId } });
}

export async function lookupRoll({ rollNo, orgId, signal }) {
  // CONTRACT: GET /rolls/:rollNo — roll_no is URI-encoded
  // If QR label encodes a token, backend must resolve to roll_no before calling this.
  // See FRONTEND_CONTRACT_NOTES.md issue #2.
  return api.get(`/rolls/${encodeURIComponent(rollNo)}`, { signal, headers: { 'x-org-id': orgId } });
}

export async function submitInspection({ orgId, payload }) {
  return api.post('/qc/inspect', payload, { headers: { 'x-org-id': orgId } });
}
