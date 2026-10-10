import React, { createContext, useContext, useEffect, useState } from 'react';
import { useQuery, useQueryClient } from '@tanstack/react-query';
import { View, ActivityIndicator } from 'react-native';
import { Text, Button } from 'react-native-paper';
import { useRouter, useSegments } from 'expo-router';
import { supabase } from '../lib/supabase';
import { request } from '../services/api/client';
import { organizations } from '../utils/contracts';

export const SessionContext = createContext(null);
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
  const cache = useQueryClient();
  const token = session.access_token;
  const userId = session.user.id;
  
  const api = (path, options = {}) => request(path, { ...options, token });
  
  const access = useQuery({ 
    queryKey: [userId, 'access'], 
    queryFn: ({ signal }) => api('/me/access', { signal }),
    retry: false 
  });
  
  const signOut = async () => { 
    const { error } = await supabase.auth.signOut(); 
    if (error) throw error; 
    cache.clear(); 
  };
  
  const data = access.data?.data;

  if (access.isPending || access.isError) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 }}>
        {access.isPending ? (
          <ActivityIndicator size="large" />
        ) : (
          <>
            <Text style={{ marginBottom: 16 }}>Failed to load access info.</Text>
            <Button mode="contained" onPress={() => access.refetch()}>Retry</Button>
            <Button mode="text" onPress={signOut} style={{ marginTop: 8 }}>Sign out</Button>
          </>
        )}
      </View>
    );
  }

  if (!data?.staff) {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 }}>
        <Text variant="titleMedium" style={{ marginBottom: 16 }}>Waiting for access</Text>
        <Text style={{ marginBottom: 24, textAlign: 'center' }}>Your account has no role yet. Ask the mill owner to invite you, then sign in again.</Text>
        <Button mode="contained" onPress={() => access.refetch()}>Refresh</Button>
        <Button mode="text" onPress={signOut} style={{ marginTop: 8 }}>Sign out</Button>
      </View>
    );
  }
  
  if (data.status !== 'active') {
    return (
      <View style={{ flex: 1, justifyContent: 'center', alignItems: 'center', padding: 24 }}>
        <Text variant="titleMedium" style={{ marginBottom: 16 }}>Account disabled</Text>
        <Text style={{ marginBottom: 24, textAlign: 'center' }}>Your account has been disabled. Contact the mill owner.</Text>
        <Button mode="text" onPress={signOut} style={{ marginTop: 8 }}>Sign out</Button>
      </View>
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

  return (
    <SessionContext.Provider value={value}>
      <View style={{ flex: 1 }}>
        {children}
      </View>
    </SessionContext.Provider>
  );
}
