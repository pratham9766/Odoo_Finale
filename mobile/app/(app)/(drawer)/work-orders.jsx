import React, { useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, Text, View } from 'react-native';
import { useRouter } from 'expo-router';
import Gate from '../../../src/components/Gate';
import { useGet } from '../../../src/lib/hooks';
import { Chips, Empty, ListRow, Pill, Progress, QueryState } from '../../../src/components/ui';
import { quantity } from '../../../src/utils/format';
import { palette, space } from '../../../src/theme/theme';

const FILTERS = [undefined, 'planned', 'running', 'paused', 'done', 'cancelled'].map(v => ({ value: v, label: v ? v[0].toUpperCase() + v.slice(1) : 'All' }));

export default function WorkOrders() {
  return <Gate perms="production.view"><List /></Gate>;
}

function List() {
  const router = useRouter();
  const [status, setStatus] = useState();
  const list = useGet('/work-orders', { limit: 100, status });
  return (
    <View style={styles.root}>
      <FlatList
        data={list.payload || []}
        keyExtractor={w => w.id}
        contentContainerStyle={styles.list}
        refreshControl={<RefreshControl refreshing={list.isRefetching} onRefresh={list.refetch} colors={[palette.forest]} />}
        ListHeaderComponent={<Chips options={FILTERS} value={status} onChange={setStatus} />}
        ListEmptyComponent={<QueryState query={list}><Empty icon="clipboard-check-outline" text="No work orders yet. Confirm an order and plan it from the web app." /></QueryState>}
        renderItem={({ item: w }) => (
          <ListRow
            title={`${w.wo_no}${w.is_rework ? ' · rework' : ''}`}
            subtitle={`${w.item} · ${w.stage}`}
            meta={`${w.order_no} · ${w.machine_code ? `Machine ${w.machine_code}` : 'No machine yet'}`}
            right={<Pill value={w.status} />}
            onPress={() => router.push(`/(app)/work-order/${w.id}`)}
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
