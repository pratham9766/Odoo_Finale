import React, { useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import Gate from '../../../src/components/Gate';
import { useGet } from '../../../src/lib/hooks';
import { Chips, Empty, ListRow, Pill, QueryState } from '../../../src/components/ui';
import { date } from '../../../src/utils/format';
import { palette, space } from '../../../src/theme/theme';

const FILTERS = [
  { value: undefined, label: 'All' },
  { value: 'draft', label: 'Draft' },
  { value: 'posted', label: 'Posted' },
  { value: 'cancelled', label: 'Cancelled' },
];

export default function Receipts() {
  return <Gate perms={['receipt.view', 'receipt.create', 'stock.view']}><List /></Gate>;
}

function List() {
  const router = useRouter();
  const [status, setStatus] = useState();
  const list = useGet('/receipts', { limit: 50, status });
  return (
    <View style={styles.root}>
      <FlatList
        data={list.payload || []}
        keyExtractor={g => g.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={list.isRefetching} onRefresh={list.refetch} colors={[palette.forest]} />}
        ListHeaderComponent={<Chips options={FILTERS} value={status} onChange={setStatus} />}
        ListEmptyComponent={<QueryState query={list}><Empty icon="receipt-text-outline" text="No goods receipts yet." /></QueryState>}
        renderItem={({ item: g }) => (
          <ListRow
            title={g.grn_no}
            subtitle={g.supplier_name || 'No supplier'}
            meta={`${g.line_count} line${g.line_count === 1 ? '' : 's'} · ${date(g.posted_at || g.created_at)}${g.vehicle_no ? ` · ${g.vehicle_no}` : ''}`}
            right={<Pill value={g.status} />}
            onPress={() => router.push(`/(app)/receipts/${g.id}`)}
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
