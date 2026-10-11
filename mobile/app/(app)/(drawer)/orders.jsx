import React, { useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import Gate from '../../../src/components/Gate';
import { useGet } from '../../../src/lib/hooks';
import { Chips, Empty, ListRow, QueryState, SearchBar, StatusBadge, useLayout } from '../../../src/components/ui';
import { label, quantity, relativeDay } from '../../../src/utils/format';
import { CONTENT_MAX, palette, space } from '../../../src/theme/theme';

const FILTERS = [
  { value: undefined, label: 'All' },
  { value: 'draft', label: 'Draft' },
  { value: 'confirmed,waiting_material,material_ready', label: 'Open' },
  { value: 'in_production,in_qc', label: 'In production' },
  { value: 'ready_to_ship,partially_dispatched', label: 'To dispatch' },
  { value: 'dispatched,delivered', label: 'Dispatched' },
];

export default function Orders() {
  return <Gate perms="orders.view"><List /></Gate>;
}

function List() {
  const router = useRouter();
  const { tablet } = useLayout();
  const [status, setStatus] = useState();
  const [text, setText] = useState('');
  const [q, setQ] = useState('');
  const list = useGet('/orders', { limit: 50, status, q: q || undefined });
  const rows = list.payload || [];

  return (
    <View style={styles.root}>
      <FlatList
        data={rows}
        keyExtractor={(o) => o.id}
        contentContainerStyle={[styles.list, tablet && { maxWidth: CONTENT_MAX, width: '100%', alignSelf: 'center' }]}
        refreshControl={<RefreshControl refreshing={list.isRefetching} onRefresh={list.refetch} colors={[palette.forest]} />}
        ListHeaderComponent={(
          <View>
            <SearchBar placeholder="Search order or buyer" value={text} onChangeText={setText} onSubmit={setQ} autoCapitalize="characters" />
            <Chips options={FILTERS} value={status} onChange={setStatus} />
          </View>
        )}
        ListEmptyComponent={list.isError || list.isPending
          ? <QueryState query={list}><View /></QueryState>
          : <Empty icon="clipboard-text-outline" text={q ? `No order matches "${q}".` : status ? 'No orders in this group.' : 'No orders yet.'} hint={q || status ? 'Clear the search or choose "All".' : 'Orders are created on the web app.'} />}
        renderItem={({ item: o }) => (
          <ListRow
            title={o.order_no}
            subtitle={o.buyer_name || o.buyer || undefined}
            meta={`${quantity(o.total_qty)} ${o.uom || ''} · Due ${relativeDay(o.deadline)}${o.current_stage ? ` · ${label(o.current_stage)}` : ''}`}
            right={(
              <View style={{ gap: 4, alignItems: 'flex-end' }}>
                <StatusBadge value={o.status} />
                {o.risk && o.risk !== 'green' ? <StatusBadge value={o.risk} text={o.risk === 'red' ? 'Late' : 'At risk'} /> : null}
              </View>
            )}
            onPress={() => router.push(`/(app)/orders/${o.id}`)}
          />
        )}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  root: { flex: 1, backgroundColor: palette.bg },
  list: { padding: space.lg, paddingBottom: 40 },
});
