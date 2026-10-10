import React, { useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { Searchbar } from 'react-native-paper';
import { useRouter } from 'expo-router';
import Gate from '../../../src/components/Gate';
import { useGet } from '../../../src/lib/hooks';
import { Chips, Empty, ListRow, Pill, QueryState } from '../../../src/components/ui';
import { label, quantity, relativeDay } from '../../../src/utils/format';
import { palette, space } from '../../../src/theme/theme';

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
  const [status, setStatus] = useState();
  const [text, setText] = useState('');
  const [q, setQ] = useState('');
  const list = useGet('/orders', { limit: 50, status, q: q || undefined });
  const rows = list.payload || [];

  return (
    <View style={styles.root}>
      <FlatList
        data={rows}
        keyExtractor={o => o.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={list.isRefetching} onRefresh={list.refetch} colors={[palette.forest]} />}
        ListHeaderComponent={(
          <View>
            <Searchbar placeholder="Search order or buyer" value={text} onChangeText={setText} onSubmitEditing={() => setQ(text.trim())}
              onClearIconPress={() => setQ('')} style={styles.search} inputStyle={{ fontSize: 15 }} elevation={0} />
            <Chips options={FILTERS} value={status} onChange={setStatus} />
          </View>
        )}
        ListEmptyComponent={<QueryState query={list}><Empty icon="clipboard-text-outline" text="No orders match." /></QueryState>}
        renderItem={({ item: o }) => (
          <ListRow
            title={o.order_no}
            subtitle={o.buyer_name || o.buyer || undefined}
            meta={`${quantity(o.total_qty)} ${o.uom || ''} · Due ${relativeDay(o.deadline)}${o.current_stage ? ` · ${label(o.current_stage)}` : ''}`}
            right={<><Pill value={o.status} />{o.risk ? <View style={{ height: 4 }} /> : null}{o.risk && o.risk !== 'green' ? <Pill value={o.risk} text={o.risk === 'red' ? 'Late' : 'At risk'} /> : null}</>}
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
  search: { backgroundColor: '#fff', borderWidth: 1, borderColor: palette.linen, marginBottom: space.md, borderRadius: 12 },
});
