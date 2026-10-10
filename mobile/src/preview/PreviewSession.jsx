import React, { useState, useEffect } from 'react';
import { View } from 'react-native';
import { Text, useTheme } from 'react-native-paper';
import { useQueryClient } from '@tanstack/react-query';
import { useRouter, useSegments } from 'expo-router';
import { SessionContext } from '../context/Session';

const FAKE_USER = { id: 'preview-user-123' };
const FAKE_ORG = { id: 'preview-org-123', name: 'UI Preview Factory' };
const FAKE_CONTEXT = { permissions: ['qc.view', 'qc.inspect', 'production.view', 'production.log', 'dispatch.view', 'dispatch.pack'] };

const delay = (ms) => new Promise(r => setTimeout(r, ms));

const FAKE_API_ROUTER = async (path, options) => {
  await delay(400); // Simulate network
  
  if (path.includes('/me/orgs')) {
    if (path.includes('/context')) return { data: FAKE_CONTEXT };
    return { data: [FAKE_ORG] };
  }
  
  if (path.includes('/work-orders')) {
    if (path.includes('/logs')) {
      return { data: { success: true } };
    }
    if (path.match(/\/work-orders\/[a-z0-9-]+$/)) {
      return { data: { id: 'wo-01', wo_no: 'WO-PREVIEW', status: 'in_progress', stage: 'Weaving', order_no: 'ORD-PREV', target_qty: 1000, produced_qty: 150, item: 'Sample Cotton' } };
    }
    return { data: [
      { id: 'wo-01', wo_no: 'WO-PREVIEW', status: 'in_progress', stage: 'Weaving', order_no: 'ORD-PREV', target_qty: 1000, produced_qty: 150, pct: 15 }
    ] };
  }
  
  if (path.includes('/qc/queue')) {
    return { data: [
      { id: 'roll-p1', roll_no: 'R-PREV-01', length_m: 105, item: 'Sample Cotton', status: 'pending_qc' }
    ] };
  }
  
  if (path.includes('/rolls')) {
    if (options && options.method === 'POST') return { data: { id: 'roll-new', roll_no: 'R-NEW', status: 'pending_qc', length_m: 100 } };
    return { data: { id: 'roll-p1', roll_no: 'R-PREV-01', status: 'pending_qc', length_m: 105, item_name: 'Sample Cotton', order_no: 'ORD-PREV' } };
  }

  if (path.includes('/qc/inspections')) {
    return { data: { success: true } };
  }

  if (path.includes('/dispatches')) {
    if (path.includes('/scan') || path.includes('/confirm')) return { data: { success: true } };
    if (path.includes('/rolls')) return { data: [{ id: 'roll-1', roll_no: 'R-PACKED-01', weight_kg: 50, length_m: 100 }] };
    if (path.match(/\/dispatches\/[a-z0-9-]+$/)) {
      return { data: { id: 'disp-01', dispatch_no: 'DSP-PREV', status: 'packing', order_no: 'ORD-PREV' } };
    }
    return { data: [
      { id: 'disp-01', dispatch_no: 'DSP-PREV', status: 'packing', order_no: 'ORD-PREV' }
    ] };
  }
  
  return { data: {} };
};

export function PreviewSessionProvider({ children }) {
  const [orgId, setOrgId] = useState(FAKE_ORG.id);
  const cache = useQueryClient();
  const segments = useSegments();
  const router = useRouter();
  const theme = useTheme();

  const value = { 
    userId: FAKE_USER.id, 
    orgId, 
    orgs: [FAKE_ORG], 
    context: FAKE_CONTEXT, 
    signOut: () => {}, 
    can: permission => FAKE_CONTEXT.permissions.includes(permission),
    switchOrg: id => { setOrgId(id); cache.clear(); },
    api: FAKE_API_ROUTER,
  };

  useEffect(() => {
    const inAuthGroup = segments[0] === '(auth)';
    if (inAuthGroup) {
      router.replace('/(app)/(drawer)/dashboard');
    }
  }, [segments]);

  return (
    <SessionContext.Provider value={value}>
      <View style={{ flex: 1 }}>
        <View style={{ backgroundColor: theme.colors.error, padding: 4, paddingTop: 40, alignItems: 'center' }}>
          <Text style={{ color: 'white', fontWeight: 'bold', fontSize: 12 }}>UI Preview — Sample Data</Text>
        </View>
        {children}
      </View>
    </SessionContext.Provider>
  );
}
