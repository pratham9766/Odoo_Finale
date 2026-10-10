import { useQuery } from '@tanstack/react-query';

export function useDashboard(orgId) {
  return useQuery({
    queryKey: ['dashboard', orgId],
    queryFn: async ({ signal }) => {
      const { api } = await import('@/lib/api');
      const r = await api.get('/reports/dashboard', { signal, headers: { 'x-org-id': orgId } });
      return r.data;
    },
    enabled: !!orgId,
    staleTime: 30_000,
    refetchInterval: 30_000, // poll every 30s when socket unavailable
  });
}

export function useAlerts(orgId) {
  return useQuery({
    queryKey: ['dashboard', 'alerts', orgId],
    queryFn: async () => {
      const { api } = await import('@/lib/api');
      const r = await api.get('/reports/alerts', { headers: { 'x-org-id': orgId } });
      return r.data;
    },
    enabled: !!orgId,
    staleTime: 30_000,
  });
}
