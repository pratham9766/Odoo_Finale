import React, { useEffect } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useRouter, useSegments } from 'expo-router';
import { SessionContext } from '../context/Session';
import { palette } from '../theme/theme';

// DEVELOPMENT PREVIEW ONLY. It exists to look at screens without a server or a login. It is switched on only in a development bundle
// with EXPO_PUBLIC_PREVIEW=1 (see src/config.js: PREVIEW_ENABLED is false in every release build), it never calls the network or Supabase,
// and everything it shows or "saves" is made up and thrown away. It signs nobody in: there is no real account behind it.

const FAKE_PERMISSIONS = ['production.view', 'production.log', 'production.plan', 'machines.view', 'qc.view', 'qc.inspect', 'dispatch.view', 'dispatch.create', 'dispatch.confirm',
  'orders.view', 'stock.view', 'receipt.view', 'attendance.view', 'attendance.mark'];
const FAKE_CONTEXT = { mill: { name: 'Preview mill (sample data)' }, role: { name: 'Preview' }, user: { full_name: 'Preview user' }, permissions: FAKE_PERMISSIONS, scope: {} };
const delay = (ms) => new Promise((r) => setTimeout(r, ms));

const WO = { id: 'wo-01', wo_no: 'WO-PREVIEW', status: 'running', stage: 'Weaving', order_no: 'ORD-PREVIEW', item: 'Sample cotton', target_qty: 1000, produced_qty: 150, pct: 15, uom: 'm', machine_id: 'm-01', machine_code: 'M-01' };

const ROUTES = [
  [/\/me\/access/, () => ({ data: { staff: true, status: 'active', ...FAKE_CONTEXT } })],
  [/\/work-orders\/[\w-]+\/logs/, () => ({ data: { log: { id: 'log-1' }, work_order: { produced_qty: 160, target_qty: 1000 } }, meta: { replayed: false } })],
  [/\/work-orders\/[\w-]+$/, () => ({ data: WO })],
  [/\/work-orders/, () => ({ data: [WO] })],
  [/\/production\/board/, () => ({ data: { kpis: { running: 1, idle: 0, breakdown: 0, maintenance: 0, utilisation_pct: 100, today: { m: 150 } }, machines: [{ machine_id: 'm-01', code: 'M-01', stage: 'Weaving', status: 'running', order_no: 'ORD-PREVIEW', operator: 'Sample operator', work_order_id: 'wo-01', wo_no: 'WO-PREVIEW', produced_qty: 150, target_qty: 1000, pct: 15, uom: 'm', today_qty: 150 }] } })],
  [/\/qc\/queue/, () => ({ data: [{ id: 'roll-p1', roll_no: 'R-PREV-01', length_m: 105, item: 'Sample cotton', order_no: 'ORD-PREVIEW', status: 'pending_qc', created_at: new Date().toISOString() }] })],
  [/\/qc\/summary/, () => ({ data: { queue: { pending_qc: 1 }, passed_today: 0, rejection_pct: null, first_pass_yield_pct: null } })],
  [/\/dispatches\/[\w-]+\/(scan|confirm)/, () => ({ data: { success: true } })],
  [/\/dispatches\/[\w-]+$/, () => ({ data: { id: 'disp-01', dispatch_no: 'DSP-PREVIEW', status: 'packing', order_no: 'ORD-PREVIEW', rolls: [], totals: { ordered: 1000, scanned: 0, earlier: 0, remaining: 1000 } } })],
  [/\/dispatches/, () => ({ data: [{ id: 'disp-01', dispatch_no: 'DSP-PREVIEW', status: 'packing', order_no: 'ORD-PREVIEW', roll_count: 0, total_m: 0 }] })],
];

/** The preview "server": sample answers only. A path it does not know answers with an empty result, never an invented success. */
export async function previewApi(path) {
  await delay(250);
  const hit = ROUTES.find(([re]) => re.test(path));
  return hit ? hit[1]() : { data: [] };
}

export function PreviewSessionProvider({ children }) {
  const segments = useSegments();
  const router = useRouter();
  const value = {
    userId: 'preview-user', context: FAKE_CONTEXT, signOut: async () => {},
    can: (permission) => FAKE_PERMISSIONS.includes(permission),
    api: previewApi, preview: true,
  };
  useEffect(() => { if (segments[0] === '(auth)') router.replace('/(app)/(drawer)/dashboard'); }, [segments, router]);

  return (
    <SessionContext.Provider value={value}>
      <View style={{ flex: 1 }}>
        <View style={styles.banner} accessibilityRole="alert">
          <Text style={styles.bannerText}>PREVIEW: sample data only. Nothing is real and nothing is saved.</Text>
        </View>
        {children}
      </View>
    </SessionContext.Provider>
  );
}

const styles = StyleSheet.create({
  banner: { backgroundColor: palette.danger, paddingHorizontal: 12, paddingVertical: 6, paddingTop: 36, alignItems: 'center' },
  bannerText: { color: '#fff', fontWeight: '700', fontSize: 12, textAlign: 'center' },
});
