import React, { useMemo, useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import Gate from '../../../src/components/Gate';
import { useGet } from '../../../src/lib/hooks';
import { AppText, Chips, Empty, Panel, Progress, QueryState, SearchBar, StatusBadge, useLayout } from '../../../src/components/ui';
import { quantity } from '../../../src/utils/format';
import { CONTENT_MAX, palette, space } from '../../../src/theme/theme';

const FILTERS = [undefined, 'planned', 'running', 'paused', 'done', 'cancelled'].map((v) => ({ value: v, label: v ? v[0].toUpperCase() + v.slice(1) : 'All' }));

export default function WorkOrders() {
  return <Gate perms="production.view"><List /></Gate>;
}

/**
 * All work orders of the mill (the list API is not filtered to the person). The ones for the machines assigned to YOU this shift
 * are on "Machine board" under "My machines".
 */
function List() {
  const router = useRouter();
  const { tablet, columns } = useLayout();
  const [status, setStatus] = useState();
  const [text, setText] = useState('');
  const list = useGet('/work-orders', { limit: 100, status });
  // search is done on the loaded page (work order, order, item, machine); the server list is capped at 100
  const rows = useMemo(() => {
    const q = text.trim().toLowerCase();
    return (list.payload || []).filter((w) => !q || [w.wo_no, w.order_no, w.item, w.stage, w.machine_code].some((v) => String(v ?? '').toLowerCase().includes(q)));
  }, [list.payload, text]);

  return (
    <View style={styles.root}>
      <FlatList
        key={columns}
        numColumns={columns}
        data={rows}
        keyExtractor={(w) => w.id}
        columnWrapperStyle={columns > 1 ? { gap: space.md } : undefined}
        contentContainerStyle={[styles.list, tablet && { maxWidth: CONTENT_MAX + 120, width: '100%', alignSelf: 'center' }]}
        refreshControl={<RefreshControl refreshing={list.isRefetching} onRefresh={list.refetch} colors={[palette.forest]} />}
        ListHeaderComponent={(
          <View>
            <AppText variant="small" style={{ marginBottom: space.md }}>Every work order in the mill. Your own machines are under Machine board → My machines.</AppText>
            <SearchBar placeholder="Search work order, order, item or machine" value={text} onChangeText={setText} autoCapitalize="characters" />
            <Chips options={FILTERS} value={status} onChange={setStatus} />
          </View>
        )}
        ListEmptyComponent={list.isError || list.isPending
          ? <QueryState query={list}><View /></QueryState>
          : <Empty icon="clipboard-check-outline" text={text ? `No work order matches "${text}".` : status ? `No ${status} work orders.` : 'No work orders yet.'} hint={text || status ? 'Clear the search or choose "All".' : 'Confirm an order and plan it on the web app; its work orders appear here.'} />}
        renderItem={({ item: w }) => (
          <View style={columns > 1 && { flex: 1 }}>
            <Panel onPress={() => router.push(`/(app)/work-order/${w.id}`)} accessibilityLabel={`${w.wo_no}, ${w.status}, ${w.item}, ${w.stage}, ${Math.round(Number(w.pct) || 0)} percent of target`}>
              <View style={styles.head}>
                <View style={{ flex: 1 }}>
                  <AppText variant="h3">{w.wo_no}{w.is_rework ? ' · rework' : ''}</AppText>
                  <AppText variant="small">{w.item}</AppText>
                </View>
                <StatusBadge value={w.status} />
              </View>
              <AppText variant="small" style={{ marginTop: space.sm }}>{w.stage} · {w.machine_code ? `Machine ${w.machine_code}` : 'No machine yet'} · {w.order_no}</AppText>
              <Progress pct={w.pct} caption={`${quantity(w.produced_qty)} of ${quantity(w.target_qty)} ${w.uom || ''}`} />
            </Panel>
          </View>
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.bg },
  list: { padding: space.lg, paddingBottom: 40 },
  head: { flexDirection: 'row', alignItems: 'flex-start', gap: space.md },
});
