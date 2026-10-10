import { createContext, useMemo } from 'react';
import { useQuery } from '@tanstack/react-query';
import { api } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';

export const MillContext = createContext(null);

export function MillProvider({ children }) {
  const { user } = useAuth();

  const accessQ = useQuery({
    queryKey: ['me', 'access'],
    queryFn: () => api.get('/me/access').then((r) => r.data),
    enabled: !!user,
    staleTime: 60_000,
  });

  const value = useMemo(() => {
    const data = accessQ.data ?? null;
    const rawPerms = data?.permissions ?? [];
    return {
      loading: accessQ.isLoading,
      isError: accessQ.isError,
      refetch: accessQ.refetch,
      staff: data?.staff ?? false,
      status: data?.status ?? null,
      mill: data?.mill ?? null,
      user: data?.user ?? null,
      role: data?.role ?? null,
      permissions: new Set(rawPerms),
      scope: data?.scope ?? {},
    };
  }, [accessQ.data, accessQ.isLoading, accessQ.isError, accessQ.refetch]);

  return <MillContext.Provider value={value}>{children}</MillContext.Provider>;
}
