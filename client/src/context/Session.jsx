import { createContext, useContext, useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Card, Select, Spin } from 'antd';
import { supabase } from '@/lib/supabase';
import { request } from '@/lib/api';
import { organizations } from '@/lib/contracts';
import { QueryState } from '@/components/States';
import Login from '@/features/Login';
import CreateWorkspace from '@/features/CreateWorkspace';

const SessionContext = createContext(null);
export const useSession = () => useContext(SessionContext);
export function SessionProvider({ children }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const cache = useQueryClient();
  useEffect(() => {
    if (!supabase) { setLoading(false); return; }
    let alive = true;
    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => { if (alive) { setSession(next); setLoading(false); } });
    supabase.auth.getSession().then(({ data, error: err }) => { if (alive) { setSession(data.session); setError(err?.message); setLoading(false); } }).catch(err => { if (alive) { setError(err.message); setLoading(false); } });
    return () => { alive = false; listener.subscription.unsubscribe(); };
  }, []);
  const userId = session?.user.id;
  useEffect(() => { cache.clear(); }, [userId, cache]);
  if (loading) return <div className="center"><Spin tip="Restoring your session"><div className="loading-space" /></Spin></div>;
  if (!supabase) return <div className="center"><Card title="Connect your Sameta workspace" className="setup-card"><p>The frontend is installed. Configure Supabase authentication to sign in to your mill.</p><p>Copy <code>client/.env.example</code> to <code>client/.env.local</code>, set the public Supabase URL and anon key, then restart Vite.</p><Alert type="info" showIcon message="Use only the public anon key here. The service role key belongs on the backend." /></Card></div>;
  if (!session) return <Login initialError={error} />;
  return <TenantSession key={userId} session={session}>{children}</TenantSession>;
}

function TenantSession({ session, children }) {
  const [orgId, setOrgId] = useState(null);
  const cache = useQueryClient();
  const token = session.access_token;
  const userId = session.user.id;
  const api = (path, options = {}) => request(path, { baseUrl: import.meta.env.VITE_API_URL || 'http://localhost:4000', ...options, token, orgId });
  const orgs = useQuery({ queryKey: [userId, 'orgs'], queryFn: ({ signal }) => api('/me/orgs', { signal }) });
  const list = organizations(orgs.data?.data || []);
  const selected = list.find(org => org.id === orgId)?.id || list[0]?.id;
  const context = useQuery({ queryKey: [userId, selected, 'context'], queryFn: ({ signal }) => api(`/me/orgs/${selected}/context`, { signal }), enabled: !!selected });
  const signOut = async () => { const { error } = await supabase.auth.signOut(); if (error) throw error; cache.clear(); };
  const value = { userId, orgId: selected, orgs: list, context: context.data?.data, signOut,
    can: permission => (context.data?.data?.permissions || []).includes(permission),
    switchOrg: id => { setOrgId(id); cache.clear(); },
  };
  // Bind the selected tenant explicitly, including the initial automatic selection.
  value.api = (path, options = {}) => request(path, { baseUrl: import.meta.env.VITE_API_URL || 'http://localhost:4000', ...options, token, orgId: selected });
  if (orgs.isPending || orgs.isError) return <div className="center"><Card className="setup-card"><QueryState query={orgs} /><Button onClick={() => signOut().catch(() => {})}>Sign out</Button></Card></div>;
  if (!list.length) return <CreateWorkspace api={api} onCreated={() => orgs.refetch()} onSignOut={signOut} />;
  if (context.isPending || context.isError) return <div className="center"><Card className="setup-card"><Select aria-label="Organization" value={selected} options={list.map(o => ({ value: o.id, label: o.name }))} onChange={value.switchOrg} /><QueryState query={context} /></Card></div>;
  return <SessionContext.Provider value={value}><div key={selected}>{children}</div></SessionContext.Provider>;
}
