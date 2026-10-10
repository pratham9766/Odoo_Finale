import React, { useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Button } from 'react-native-paper';
import Gate from '../../../src/components/Gate';
import FormDialog from '../../../src/components/FormDialog';
import WorkOrderActions from '../../../src/components/WorkOrderActions';
import { useSession } from '../../../src/context/Session';
import { useAction, useGet } from '../../../src/lib/hooks';
import { Chips, Empty, Kpi, KpiRow, PageTitle, Panel, Pill, Progress, QueryState, Screen } from '../../../src/components/ui';
import { quantity } from '../../../src/utils/format';
import { palette, space } from '../../../src/theme/theme';

export default function MachineBoard() {
  return <Gate perms="production.view"><Body /></Gate>;
}

function Body() {
  const { can } = useSession();
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
        description={mine ? 'The machines you are assigned to this shift. Log your output here.' : "Live status of every machine, and today's output."}
      />
      {can('production.log') && <Chips options={[{ value: true, label: 'My machines' }, { value: false, label: 'All machines' }]} value={mine} onChange={setMine} />}

      <QueryState query={board}>
        {kpis && !mine && (
          <View style={{ marginBottom: space.md }}>
            <KpiRow>
              <Kpi label="Running" value={kpis.running} tone="ok" />
              <Kpi label="Idle" value={kpis.idle} />
              <Kpi label="Breakdown" value={kpis.breakdown} tone={kpis.breakdown ? 'bad' : undefined} />
              <Kpi label="Maintenance" value={kpis.maintenance} />
              <Kpi label="Utilisation" value={`${kpis.utilisation_pct}%`} ratio={kpis.utilisation_pct / 100} />
              {Object.entries(kpis.today || {}).map(([uom, qty]) => <Kpi key={uom} label="Output today" value={`${quantity(qty)} ${uom}`} />)}
            </KpiRow>
          </View>
        )}
        {machines.length === 0
          ? <Panel><Empty icon="factory" text={mine ? 'You have no machine assigned in the current shift.' : 'No machines configured yet.'} /></Panel>
          : machines.map(m => <MachineCard key={m.machine_id} m={m} />)}
      </QueryState>
    </Screen>
  );
}

function MachineCard({ m }) {
  const { can } = useSession();
  const act = useAction();
  const [reporting, setReporting] = useState(false);
  const woStatus = m.status === 'running' ? 'running' : m.status === 'idle' ? 'paused' : undefined;

  return (
    <Panel>
      <View style={styles.head}>
        <View style={{ flex: 1 }}>
          <Text style={styles.code}>{m.code}</Text>
          <Text style={styles.sub}>{m.stage}</Text>
        </View>
        <Pill value={m.status} />
      </View>
      <View style={styles.facts}>
        <Text style={styles.sub}>Order: <Text style={styles.strong}>{m.order_no || 'No work order'}</Text></Text>
        <Text style={styles.sub}>Operator: <Text style={styles.strong}>{m.operator || 'Unassigned'}</Text></Text>
      </View>
      {m.work_order_id ? <Progress pct={m.pct} caption={`${m.wo_no} · ${quantity(m.produced_qty)} / ${quantity(m.target_qty)} ${m.uom || ''}`} /> : null}
      <Text style={styles.today}><Text style={styles.todayNum}>{quantity(m.today_qty)}</Text> {m.uom || ''} recorded today</Text>

      {m.work_order_id ? <WorkOrderActions compact id={m.work_order_id} uom={m.uom} status={woStatus} /> : null}
      {can('breakdown.report') && m.status !== 'breakdown' && (
        <Button icon="alert-octagon-outline" textColor={palette.danger} compact style={{ alignSelf: 'flex-start', marginTop: space.sm }} onPress={() => setReporting(true)}>Report breakdown</Button>
      )}
      <FormDialog visible={reporting} title={`Breakdown on ${m.code}`} submitLabel="Report" loading={act.isPending}
        fields={[{ key: 'reason', label: 'What happened', required: true, multiline: true }]}
        onDismiss={() => setReporting(false)}
        onSubmit={v => act.mutate({ path: `/machines/${m.machine_id}/breakdown`, body: { reason: v.reason } }, { onSuccess: () => setReporting(false) })} />
    </Panel>
  );
}

const styles = StyleSheet.create({
  head: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  code: { fontSize: 22, fontWeight: '700', color: palette.forest },
  sub: { fontSize: 13, color: palette.textSecondary },
  strong: { fontWeight: '700', color: palette.ink },
  facts: { marginTop: space.sm, gap: 2 },
  today: { marginTop: space.sm, fontSize: 13, color: palette.textSecondary },
  todayNum: { fontSize: 18, fontWeight: '700', color: palette.forest },
});
