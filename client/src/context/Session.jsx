// Login session for the whole app: restores the Supabase session, loads the user's role and permissions from /me/access,
// and exposes api(), download(), can() and signOut() through useSession().
import { createContext, useContext, useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { Alert, Button, Card, Spin, message } from 'antd';
import { supabase } from '@/lib/supabase';
import { request, download } from '@/lib/api';
import { QueryState } from '@/components/States';
import Login from '@/features/Login';

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
  return <MillSession key={userId} session={session}>{children}</MillSession>;
}

/**
 * One mill, so there is nothing to pick: the logged-in user's role and permissions come from GET /me/access.
 * A person without a role yet (or a disabled one) sees a short message instead of the app.
 */
function MillSession({ session, children }) {
  const cache = useQueryClient();
  const token = session.access_token;
  const userId = session.user.id;
  const api = (path, options = {}) => request(path, { ...options, token });
  const access = useQuery({ queryKey: [userId, 'access'], queryFn: ({ signal }) => api('/me/access', { signal }), retry: false });
  const signOut = async () => { const { error } = await supabase.auth.signOut(); if (error) throw error; cache.clear(); };
  const data = access.data?.data;

  const gate = (title, text) => (
    <div className="center"><Card title={title} className="setup-card"><p>{text}</p><Button onClick={() => signOut().catch(() => {})}>Sign out</Button></Card></div>
  );
  if (access.isPending || access.isError) return <div className="center"><Card className="setup-card"><QueryState query={access} /><Button onClick={() => signOut().catch(() => {})}>Sign out</Button></Card></div>;
  if (!data.staff) return gate('Waiting for access', 'Your account has no role yet. Ask the mill owner to invite you, then sign in again.');
  if (data.status !== 'active') return gate('Account disabled', 'Your account has been disabled. Contact the mill owner.');

  const permissions = data.permissions || [];
  const value = {
    userId, api, signOut,
    download: async (path, filename) => {
      try {
        await download(path, { token, filename });
        return true;
      } catch (err) {
        message.error(err.message || 'The file could not be downloaded.');
        return false;
      }
    },
    context: { mill: data.mill, role: data.role, user: data.user, permissions, scope: data.scope || {} },
    can: permission => permissions.includes(permission),
    refreshAccess: () => access.refetch(),
  };
  return <SessionContext.Provider value={value}>{children}</SessionContext.Provider>;
}
