import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';

export function useDashboard() {
  return useQuery({
    queryKey: ['dashboard'],
    queryFn: async ({ signal }) => {
      const r = await api.get('/reports/dashboard', { signal });
      return r.data;
    },
    staleTime: 30_000,
    refetchInterval: 30_000, // poll every 30s when socket idle
  });
}
