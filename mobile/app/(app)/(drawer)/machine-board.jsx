import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import Gate from '../../../src/components/Gate';
import { useSession } from '../../../src/context/Session';
import { useAction, useGet } from '../../../src/lib/hooks';
import { describeError } from '../../../src/services/api/errors';
import { ActionButton, AppText, Banner, Chips, ConfirmDialog, Empty, Field, Kpi, KpiRow, PageTitle, Panel, Progress, QueryState, Screen, StatusBadge, useLayout, useToast } from '../../../src/components/ui';
import { quantity } from '../../../src/utils/format';
import { palette, radius, space } from '../../../src/theme/theme';

export default function MachineBoard() {
  return <Gate perms="production.view"><Body /></Gate>;
}

// Each state has its own icon, word and colour: never colour alone, and "running" cannot be mistaken for "idle" or "breakdown".
const STATE = {
  running: { icon: 'play-circle', label: 'Running', color: palette.ok, bg: palette.okBg },
  idle: { icon: 'pause-circle-outline', label: 'Idle', color: palette.muted, bg: palette.mutedBg },
  breakdown: { icon: 'alert-octagon', label: 'Breakdown', color: palette.danger, bg: palette.dangerBg },
  maintenance: { icon: 'wrench', label: 'Maintenance', color: palette.risk, bg: palette.riskBg },
};

function Body() {
  const { can } = useSession();
  const { tablet } = useLayout();
  const operator = can('production.log') && !can('production.plan');
  const [mine, setMine] = useState(operator);
  const board = useGet('/production/board', { mine: mine ? 'true' : undefined }, { refetchInterval: 60000 });
  const machines = board.payload?.machines || [];
  const kpis = board.payload?.kpis;

  return (
    <Screen onRefresh={board.refetch} refreshing={board.isRefetching}>
      <PageTitle
        eyebrow={mine ? 'MY SHIFT' : 'PRODUCTION'}
        title={mine ? 'My machines' : 'Machine board'}
        description={mine ? 'The machines assigned to you in the current shift. Open a work order to log output.' : "Live status of every machine you can see, and today's output."}
      />
      {can('production.log') && <Chips options={[{ value: true, label: 'Assigned to me' }, { value: false, label: 'All machines' }]} value={mine} onChange={setMine} />}

      <QueryState query={board}>
        {kpis && !mine && (
          <View style={{ marginBottom: space.lg }}>
            <KpiRow>
              <Kpi label="Running" value={kpis.running} sub="machines" tone="ok" />
              <Kpi label="Idle" value={kpis.idle} sub="machines" />
              <Kpi label="Breakdown" value={kpis.breakdown} sub="machines" tone={kpis.breakdown ? 'bad' : undefined} />
              <Kpi label="Maintenance" value={kpis.maintenance} sub="machines" tone={kpis.maintenance ? 'risk' : undefined} />
              <Kpi label="Utilisation" value={`${kpis.utilisation_pct}%`} sub="of machines running" ratio={kpis.utilisation_pct / 100} />
              {Object.entries(kpis.today || {}).map(([uom, qty]) => <Kpi key={uom} label="Recorded today" value={`${quantity(qty)} ${uom}`} />)}
            </KpiRow>
          </View>
        )}
        {machines.length === 0
          ? <Panel><Empty icon="factory" text={mine ? 'No machine is assigned to you in the current shift.' : 'No machines to show.'} hint={mine ? 'Choose "All machines" to see the whole floor, or ask your supervisor for an assignment.' : 'Machines are set up in Settings on the web app.'} /></Panel>
          : <View style={tablet ? styles.grid : undefined}>{machines.map((m) => <View key={m.machine_id} style={tablet && styles.cell}><MachineCard m={m} /></View>)}</View>}
      </QueryState>
    </Screen>
  );
}

function MachineCard({ m }) {
  const { can } = useSession();
  const router = useRouter();
  const toast = useToast();
  const act = useAction();
  const [reporting, setReporting] = useState(false);
  const [reason, setReason] = useState('');
  const [error, setError] = useState(null);
  const st = STATE[m.status] || STATE.idle;

  const report = () => {
    if (reason.trim().length < 3) { setError({ title: 'Say what happened', text: 'A few words help the maintenance team.' }); return; }
    act.mutate({ path: `/machines/${m.machine_id}/breakdown`, body: { reason: reason.trim() }, quiet: true }, {
      onSuccess: () => { setReporting(false); setReason(''); setError(null); toast(`Breakdown reported on ${m.code}.`); },
      onError: (e) => { const i = describeError(e, { write: true }); setError({ title: i.uncertain ? 'Not confirmed' : i.title, text: i.uncertain ? 'The server did not answer. Refresh the board to see whether the breakdown was recorded before reporting again.' : e.message }); },
    });
  };

  return (
    <Panel style={{ borderLeftWidth: 6, borderLeftColor: st.color }}>
      <View style={styles.head}>
        <View style={{ flex: 1 }}>
          <AppText variant="h1" numberOfLines={2} style={{ fontSize: 24, lineHeight: 30 }}>{m.code}</AppText>
          <AppText variant="small">{m.stage}</AppText>
        </View>
        <View style={[styles.state, { backgroundColor: st.bg }]} accessible accessibilityLabel={`Machine ${m.code} is ${st.label}`}>
          <MaterialCommunityIcons name={st.icon} size={20} color={st.color} />
          <AppText variant="label" style={{ color: st.color }}>{st.label}</AppText>
        </View>
      </View>

      <View style={styles.facts}>
        <AppText variant="small">Work order: <AppText variant="bodyStrong" style={{ fontSize: 15 }}>{m.wo_no || 'None running'}</AppText></AppText>
        <AppText variant="small">Order: <AppText variant="bodyStrong" style={{ fontSize: 15 }}>{m.order_no || '–'}</AppText></AppText>
        <AppText variant="small">Operator this shift: <AppText variant="bodyStrong" style={{ fontSize: 15 }}>{m.operator || 'Unassigned'}</AppText></AppText>
      </View>
      {m.work_order_id ? <Progress pct={m.pct} caption={`${quantity(m.produced_qty)} of ${quantity(m.target_qty)} ${m.uom || ''} (${Math.round(Number(m.pct) || 0)}%)`} /> : null}
      <AppText variant="small" style={{ marginTop: space.sm }}>Recorded today: <AppText variant="bodyStrong" style={{ fontSize: 15 }}>{quantity(m.today_qty)} {m.uom || ''}</AppText></AppText>

      <View style={styles.actions}>
        {m.work_order_id ? <ActionButton label={can('production.log') ? 'Open work order · log output' : 'Open work order'} icon="clipboard-text-outline" onPress={() => router.push(`/(app)/work-order/${m.work_order_id}`)} /> : null}
        {can('breakdown.report') && m.status !== 'breakdown' ? <ActionButton kind="destructiveOutline" label="Report breakdown" icon="alert-octagon-outline" onPress={() => { setError(null); setReporting(true); }} /> : null}
      </View>

      <ConfirmDialog visible={reporting} destructive title={`Breakdown on ${m.code}`} confirmLabel="Report breakdown" loading={act.isPending} onCancel={() => setReporting(false)} onConfirm={report}
        message="The machine is marked as broken down and the maintenance team is told.">
        <Field label="What happened" multiline value={reason} onChangeText={(t) => { setReason(t); setError(null); }} maxLength={300} />
        {error ? <Banner tone="bad" title={error.title} text={error.text} /> : null}
      </ConfirmDialog>
    </Panel>
  );
}

const styles = StyleSheet.create({
  grid: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  cell: { flexBasis: '48%', flexGrow: 1 },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
  state: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 12, paddingVertical: 8, borderRadius: radius.pill },
  facts: { marginTop: space.md, gap: 4 },
  actions: { marginTop: space.lg, gap: space.sm },
});
