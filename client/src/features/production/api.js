import { api } from '@/lib/api';

export async function fetchMachineBoard({ orgId, stageId, signal }) {
  const params = stageId ? `?stage_id=${stageId}` : '';
  return api.get(`/production/board${params}`, { signal, headers: { 'x-org-id': orgId } });
}

export async function fetchWorkOrders({ orgId, status, signal }) {
  const params = status ? `?status=${status}` : '';
  return api.get(`/production/work-orders${params}`, { signal, headers: { 'x-org-id': orgId } });
}
