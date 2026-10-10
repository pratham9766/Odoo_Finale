import React, { createContext, useContext, useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { ActivityIndicator, StyleSheet, View } from 'react-native';
import { Button, Text } from 'react-native-paper';
import { useRouter, useSegments } from 'expo-router';
import { supabase } from '../lib/supabase';
import { request } from '../services/api/client';
import { palette, serif } from '../theme/theme';

export const SessionContext = createContext(null);
export const useSession = () => useContext(SessionContext);

export function SessionProvider({ children }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const cache = useQueryClient();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (!supabase) { setLoading(false); return; }
    let alive = true;
    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => {
      if (alive) { setSession(next); setLoading(false); }
    });
    supabase.auth.getSession()
      .then(({ data }) => { if (alive) { setSession(data.session); setLoading(false); } })
      .catch(() => { if (alive) setLoading(false); });
    return () => { alive = false; listener?.subscription?.unsubscribe(); };
  }, []);

  const userId = session?.user?.id;

  // another login must never see the previous person's cached data
  useEffect(() => { cache.clear(); }, [userId, cache]);

  useEffect(() => {
    if (loading) return;
    const inAuthGroup = segments[0] === '(auth)';
    if (!session && !inAuthGroup) router.replace('/(auth)/login');
    else if (session && inAuthGroup) router.replace('/(app)/(drawer)');   // the drawer's index picks the home screen by role
  }, [session, loading, segments, router]);

  if (loading) return <Center><ActivityIndicator size="large" color={palette.forest} /></Center>;
  if (!session) return children;                                            // renders the (auth) group
  return <StaffSession key={userId} session={session}>{children}</StaffSession>;
}

/** One mill: the logged-in person must be active staff. Loads role, permissions and scope from /me/access. */
function StaffSession({ session, children }) {
  const cache = useQueryClient();
  const token = session.access_token;
  const userId = session.user.id;

  const api = (path, options = {}) => request(path, { ...options, token });
  const access = useQuery({ queryKey: [userId, 'access'], queryFn: ({ signal }) => api('/me/access', { signal }), retry: false });

  const signOut = async () => {
    const { error } = await supabase.auth.signOut();
    if (error) throw error;
    cache.clear();
  };

  const data = access.data?.data;

  if (access.isPending) return <Center><ActivityIndicator size="large" color={palette.forest} /></Center>;
  if (access.isError) {
    return (
      <Message title="Could not load your access" body={access.error?.message}>
        <Button mode="contained" onPress={() => access.refetch()}>Retry</Button>
        <Button mode="text" onPress={signOut}>Sign out</Button>
      </Message>
    );
  }
  if (!data?.staff) {
    return (
      <Message title="Waiting for access" body="Your account has not been given access to the mill yet. Ask the owner to invite you, then check again.">
        <Button mode="contained" onPress={() => access.refetch()}>Check again</Button>
        <Button mode="text" onPress={signOut}>Sign out</Button>
      </Message>
    );
  }
  if (data.status !== 'active') {
    return (
      <Message title="Account disabled" body="Your account has been disabled. Contact the mill owner.">
        <Button mode="text" onPress={signOut}>Sign out</Button>
      </Message>
    );
  }

  const permissions = data.permissions || [];
  const value = {
    userId,
    api,
    signOut,
    context: { mill: data.mill, role: data.role, user: data.user, permissions, scope: data.scope || {} },
    can: permission => permissions.includes(permission),
    refreshAccess: () => access.refetch(),
  };

  return <SessionContext.Provider value={value}><View style={{ flex: 1 }}>{children}</View></SessionContext.Provider>;
}

const Center = ({ children }) => <View style={styles.center}>{children}</View>;

function Message({ title, body, children }) {
  return (
    <Center>
      <Text style={styles.title}>{title}</Text>
      {body ? <Text style={styles.body}>{body}</Text> : null}
      <View style={{ marginTop: 20, gap: 8, alignSelf: 'stretch' }}>{children}</View>
    </Center>
  );
}

const styles = StyleSheet.create({
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 28, backgroundColor: palette.bg },
  title: { fontSize: 24, fontFamily: serif, fontWeight: '700', color: palette.forest, textAlign: 'center' },
  body: { marginTop: 8, color: palette.textSecondary, textAlign: 'center', lineHeight: 21 },
});
