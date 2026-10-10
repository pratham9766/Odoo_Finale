import React, { createContext, useContext, useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { View, ActivityIndicator } from 'react-native';
import { Text, Button } from 'react-native-paper';
import { useRouter, useSegments } from 'expo-router';
import { supabase } from '../lib/supabase';
import { request } from '../services/api/client';
import { organizations } from '../utils/contracts';

const SessionContext = createContext(null);
export const useSession = () => useContext(SessionContext);

export function SessionProvider({ children }) {
  const [session, setSession] = useState(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const cache = useQueryClient();
  const segments = useSegments();
  const router = useRouter();

  useEffect(() => {
    if (!supabase) { setLoading(false); return; }
    let alive = true;
    const { data: listener } = supabase.auth.onAuthStateChange((_event, next) => {
      if (alive) {
        setSession(next);
        setLoading(false);
      }
    });
    
    supabase.auth.getSession().then(({ data, error: err }) => {
      if (alive) {
        setSession(data.session);
        setError(err?.message);
        setLoading(false);
      }
    }).catch(err => {
      if (alive) {
        setError(err.message);
        setLoading(false);
      }
    });
    
    return () => { 
      alive = false; 
      listener?.subscription?.unsubscribe(); 
    };
  }, []);

  const userId = session?.user?.id;

  useEffect(() => {
    cache.clear();
  }, [userId, cache]);

  // Auth routing logic
  useEffect(() => {
    if (loading) return;

    const inAuthGroup = segments[0] === '(auth)';
    
    if (!session && !inAuthGroup) {
      // Redirect to the login page.
      router.replace('/(auth)/login');
    } else if (session && inAuthGroup) {
      // Redirect away from the login page.
      router.replace('/(app)/(drawer)/dashboard');
    }
  }, [session, loading, segments, router]);

  if (loading) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center' }}>
        <ActivityIndicator size="large" />
      </View>
    );
  }

  if (!session) {
    // Returning children here will render the (auth) group
    return children;
  }

  return <TenantSession key={userId} session={session} children={children} />;
}

function TenantSession({ session, children }) {
  const [orgId, setOrgId] = useState(null);
  const cache = useQueryClient();
  const token = session.access_token;
  const userId = session.user.id;
  
  // Create an api helper inside the context, similar to web
  const api = (path, options = {}) => request(path, { ...options, token, orgId });
  
  const orgs = useQuery({ 
    queryKey: [userId, 'orgs'], 
    queryFn: ({ signal }) => api('/me/orgs', { signal }) 
  });
  
  const list = organizations(orgs.data?.data || []);
  const selected = list.find(org => org.id === orgId)?.id || list[0]?.id;
  
  const context = useQuery({ 
    queryKey: [userId, selected, 'context'], 
    queryFn: ({ signal }) => api(`/me/orgs/${selected}/context`, { signal }), 
    enabled: !!selected 
  });
  
  const signOut = async () => { 
    const { error } = await supabase.auth.signOut(); 
    if (error) throw error; 
    cache.clear(); 
  };
  
  const value = { 
    userId, 
    orgId: selected, 
    orgs: list, 
    context: context.data?.data, 
    signOut,
    can: permission => (context.data?.data?.permissions || []).includes(permission),
    switchOrg: id => { setOrgId(id); cache.clear(); },
  };

  // Bind the selected tenant explicitly
  value.api = (path, options = {}) => request(path, { ...options, token, orgId: selected });

  if (orgs.isPending || orgs.isError) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 }}>
        {orgs.isPending ? (
          <ActivityIndicator size="large" />
        ) : (
          <>
            <Text style={{ marginBottom: 16 }}>Failed to load organizations.</Text>
            <Button mode="contained" onPress={() => orgs.refetch()}>Retry</Button>
            <Button mode="text" onPress={signOut} style={{ marginTop: 8 }}>Sign out</Button>
          </>
        )}
      </View>
    );
  }

  if (!list.length) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 }}>
        <Text variant="titleMedium" style={{ marginBottom: 16 }}>No Workspace Found</Text>
        <Text style={{ marginBottom: 24, textAlign: 'center' }}>Your account is not connected to any SAMETA workspace. Please accept an invite or create a workspace on the web platform.</Text>
        <Button mode="contained" onPress={() => orgs.refetch()}>Refresh</Button>
        <Button mode="text" onPress={signOut} style={{ marginTop: 8 }}>Sign out</Button>
      </View>
    );
  }

  if (context.isPending || context.isError) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 }}>
        {context.isPending ? (
          <ActivityIndicator size="large" />
        ) : (
          <>
            <Text style={{ marginBottom: 16 }}>Failed to load workspace context.</Text>
            <Button mode="contained" onPress={() => context.refetch()}>Retry</Button>
            <Button mode="text" onPress={signOut} style={{ marginTop: 8 }}>Sign out</Button>
          </>
        )}
      </View>
    );
  }

  return (
    <SessionContext.Provider value={value}>
      <View style={{ flex: 1 }} key={selected}>
        {children}
      </View>
    </SessionContext.Provider>
  );
}
