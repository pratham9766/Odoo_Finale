import React, { useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { Button, Searchbar } from 'react-native-paper';
import { useRouter } from 'expo-router';
import Gate from '../../../src/components/Gate';
import ScanModal from '../../../src/components/ScanModal';
import { useSession } from '../../../src/context/Session';
import { useGet } from '../../../src/lib/hooks';
import { Chips, Empty, Kpi, KpiRow, ListRow, Pill, QueryState } from '../../../src/components/ui';
import { date, quantity } from '../../../src/utils/format';
import { palette, space } from '../../../src/theme/theme';

const TABS = [
  { value: 'pending_qc', label: 'Waiting for QC' },
  { value: 'passed', label: 'Passed' },
  { value: 'rework', label: 'Rework' },
  { value: 'rejected', label: 'Rejected' },
];

export default function QcQueue() {
  return <Gate perms="qc.view"><Body /></Gate>;
}

function Body() {
  const router = useRouter();
  const { can } = useSession();
  const [status, setStatus] = useState('pending_qc');
  const [text, setText] = useState('');
  const [q, setQ] = useState('');
  const [scanning, setScanning] = useState(false);
  const summary = useGet('/qc/summary', {}, { refetchInterval: 60000 });
  const list = useGet('/qc/queue', { status, limit: 100, q: q || undefined }, { refetchInterval: status === 'pending_qc' ? 60000 : undefined });
  const s = summary.payload;
  const canInspect = can('qc.inspect');

  const open = r => router.push(`/(app)/qc/inspect?rollNo=${encodeURIComponent(r.roll_no)}`);
  const scanned = value => { setScanning(false); router.push(`/(app)/qc/inspect?qr=${encodeURIComponent(value)}`); };

  return (
    <View style={styles.root}>
      <FlatList
        data={list.payload || []}
        keyExtractor={r => r.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={list.isRefetching} onRefresh={() => { list.refetch(); summary.refetch(); }} colors={[palette.forest]} />}
        ListHeaderComponent={(
          <View>
            {s && (
              <View style={{ marginBottom: space.md }}>
                <KpiRow>
                  <Kpi label="Waiting for QC" value={s.queue?.pending_qc ?? 0} tone={s.queue?.pending_qc ? 'risk' : undefined} />
                  <Kpi label="Passed today" value={s.passed_today} tone="ok" />
                  <Kpi label="Rejection rate" value={s.rejection_pct != null ? `${s.rejection_pct}%` : '–'} />
                  <Kpi label="First-pass yield" value={s.first_pass_yield_pct != null ? `${s.first_pass_yield_pct}%` : '–'} />
                </KpiRow>
              </View>
            )}
            {canInspect && <Button mode="contained" icon="qrcode-scan" onPress={() => setScanning(true)} style={{ marginBottom: space.md }} contentStyle={{ height: 46 }}>Scan a roll to inspect</Button>}
            <Searchbar placeholder="Roll or order number" value={text} onChangeText={setText} onSubmitEditing={() => setQ(text.trim())}
              onClearIconPress={() => setQ('')} style={styles.search} inputStyle={{ fontSize: 15 }} elevation={0} />
            <Chips options={TABS} value={status} onChange={setStatus} />
          </View>
        )}
        ListEmptyComponent={<QueryState query={list}><Empty icon="check-decagram-outline" text="No rolls here." /></QueryState>}
        renderItem={({ item: r }) => (
          <ListRow
            icon="roll-of-paper"
            title={r.roll_no}
            subtitle={`${r.item}${r.colour ? ` · ${r.colour}` : ''}`}
            meta={`${r.order_no}${r.machine_code ? ` · ${r.machine_code}` : ''} · ${quantity(r.length_m)} m · ${date(r.created_at)}`}
            right={status === 'pending_qc' ? undefined : <Pill value={r.status} />}
            onPress={status === 'pending_qc' && canInspect ? () => open(r) : undefined}
          />
        )}
      />
      <ScanModal visible={scanning} onScan={scanned} onClose={() => setScanning(false)} />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.bg },
  list: { padding: space.lg, paddingBottom: 40 },
  search: { backgroundColor: '#fff', borderWidth: 1, borderColor: palette.linen, marginBottom: space.md, borderRadius: 12 },
});
