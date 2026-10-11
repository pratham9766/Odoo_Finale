import React, { useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import Gate from '../../../src/components/Gate';
import ScanModal from '../../../src/components/ScanModal';
import { useSession } from '../../../src/context/Session';
import { useGet } from '../../../src/lib/hooks';
import { ActionButton, AppText, Chips, Empty, Kpi, KpiRow, ListRow, QueryState, SearchBar, StatusBadge, useLayout } from '../../../src/components/ui';
import { date, quantity } from '../../../src/utils/format';
import { CONTENT_MAX, palette, space } from '../../../src/theme/theme';

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
  const { tablet } = useLayout();
  const [status, setStatus] = useState('pending_qc');
  const [text, setText] = useState('');
  const [q, setQ] = useState('');
  const [scanning, setScanning] = useState(false);
  const summary = useGet('/qc/summary', {}, { refetchInterval: 60000 });
  const list = useGet('/qc/queue', { status, limit: 100, q: q || undefined }, { refetchInterval: status === 'pending_qc' ? 60000 : undefined });
  const s = summary.payload;
  const canInspect = can('qc.inspect');

  const open = (r) => router.push(`/(app)/qc/inspect?rollNo=${encodeURIComponent(r.roll_no)}`);
  const scanned = (value) => { setScanning(false); router.push(`/(app)/qc/inspect?qr=${encodeURIComponent(value)}`); };
  // typing a number that is not in the list still works: the inspection screen looks the roll up by number
  const openTyped = (value) => { if (value) router.push(`/(app)/qc/inspect?rollNo=${encodeURIComponent(value.toUpperCase())}`); };

  return (
    <View style={styles.root}>
      <FlatList
        data={list.payload || []}
        keyExtractor={(r) => r.id}
        contentContainerStyle={[styles.list, tablet && { maxWidth: CONTENT_MAX, width: '100%', alignSelf: 'center' }]}
        refreshControl={<RefreshControl refreshing={list.isRefetching} onRefresh={() => { list.refetch(); summary.refetch(); }} colors={[palette.forest]} />}
        ListHeaderComponent={(
          <View>
            {s ? (
              <View style={{ marginBottom: space.lg }}>
                <KpiRow>
                  <Kpi label="Waiting for QC" value={s.queue?.pending_qc ?? 0} sub="rolls" tone={s.queue?.pending_qc ? 'risk' : undefined} />
                  <Kpi label="Passed today" value={s.passed_today} sub="rolls" tone="ok" />
                  <Kpi label="Rejection rate" value={s.rejection_pct != null ? `${s.rejection_pct}%` : 'No data'} />
                  <Kpi label="First-pass yield" value={s.first_pass_yield_pct != null ? `${s.first_pass_yield_pct}%` : 'No data'} />
                </KpiRow>
              </View>
            ) : summary.isError ? <AppText variant="small" style={{ marginBottom: space.md }}>The summary could not be loaded. The list below still works.</AppText> : null}
            {canInspect && <ActionButton label="Scan a roll label" icon="qrcode-scan" onPress={() => setScanning(true)} style={{ marginBottom: space.md }} />}
            <SearchBar placeholder="Find a roll or order number" value={text} onChangeText={setText} onSubmit={setQ} autoCapitalize="characters" />
            {canInspect && text.trim() ? <ActionButton kind="secondary" compact icon="arrow-right" label={`Open roll ${text.trim().toUpperCase()}`} onPress={() => openTyped(text.trim())} style={{ marginBottom: space.md }} /> : null}
            <Chips options={TABS} value={status} onChange={setStatus} />
          </View>
        )}
        ListEmptyComponent={list.isError || list.isPending
          ? <QueryState query={list}><View /></QueryState>
          : <Empty icon="check-decagram-outline" text={q ? `No rolls match "${q}" here.` : status === 'pending_qc' ? 'Nothing is waiting for QC.' : 'No rolls with this result.'} hint={q ? 'Try the other tabs, or clear the search.' : undefined} />}
        renderItem={({ item: r }) => (
          <ListRow
            icon="paper-roll-outline"
            title={r.roll_no}
            subtitle={`${r.item}${r.colour ? ` · ${r.colour}` : ''}`}
            meta={`${r.order_no}${r.machine_code ? ` · ${r.machine_code}` : ''} · ${quantity(r.length_m)} m · ${date(r.created_at)}`}
            right={status === 'pending_qc' ? undefined : <StatusBadge value={r.status} />}
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
});
