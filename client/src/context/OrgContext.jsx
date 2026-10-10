import { createContext, useCallback, useEffect, useMemo, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { api, setApiOrg } from '@/lib/api';
import { useAuth } from '@/hooks/useAuth';

export const OrgContext = createContext(null);

const KEY = 'texlink.orgId';
const readSaved = () => { try { return localStorage.getItem(KEY); } catch { return null; } };
const save = (id) => { try { if (id) localStorage.setItem(KEY, id); else localStorage.removeItem(KEY); } catch { /* ignore */ } };

export function OrgProvider({ children }) {
  const { user } = useAuth();
  const qc = useQueryClient();
  const [orgId, setOrgIdState] = useState(readSaved);
  const [switching, setSwitching] = useState(false);

  // ── Live mode: fetch orgs list ─────────────────────────────────────────
  const orgsQ = useQuery({
    queryKey: ['me', 'orgs'],
    queryFn: () => api.get('/me/orgs').then(r => r.data),
    enabled: !!user,
  });

  // Auto-select default org
  useEffect(() => {
    const list = orgsQ.data ?? [];
    if (list.length && !list.some(o => o.id === orgId)) {
      setOrgIdState(list[0].id);
    }
  }, [orgsQ.data, orgId]);

  useEffect(() => {
    setApiOrg(orgId);
    save(orgId);
  }, [orgId]);

  // ── Live mode: fetch org context (role, permissions) ───────────────────
  const ctxQ = useQuery({
    queryKey: ['me', 'context', orgId],
    queryFn: () => api.get(`/me/orgs/${orgId}/context`).then(r => r.data),
    enabled: !!user && !!orgId,
  });

  const switchOrg = useCallback(async (id) => {
    setSwitching(true);
    // Block mutations during switch, clear cache, update org
    setOrgIdState(id);
    qc.clear();
    setSwitching(false);
  }, [qc]);

  const value = useMemo(() => {
    const rawPerms = ctxQ.data?.permissions ?? [];
    return {
      orgs: orgsQ.data ?? [],
      loading: orgsQ.isLoading || (!!orgId && ctxQ.isLoading),
      orgId,
      org: ctxQ.data?.org ?? null,
      role: ctxQ.data?.role ?? null,
      permissions: new Set(rawPerms),
      scope: ctxQ.data?.scope ?? {},
      switching,
      switchOrg,
    };
  }, [orgsQ.data, orgsQ.isLoading, ctxQ.data, ctxQ.isLoading, orgId, switching, switchOrg]);

  return <OrgContext.Provider value={value}>{children}</OrgContext.Provider>;
}
