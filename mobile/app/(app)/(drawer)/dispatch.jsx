import React, { useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import Gate from '../../../src/components/Gate';
import { useSession } from '../../../src/context/Session';
import { useGet } from '../../../src/lib/hooks';
import { ActionButton, Chips, Empty, ListRow, QueryState, StatusBadge, useLayout } from '../../../src/components/ui';
import { date, quantity } from '../../../src/utils/format';
import { CONTENT_MAX, palette, space } from '../../../src/theme/theme';

const FILTERS = [undefined, 'packing', 'confirmed', 'in_transit', 'delivered', 'disputed', 'cancelled']
  .map((v) => ({ value: v, label: v ? v.replaceAll('_', ' ').replace(/^./, (c) => c.toUpperCase()) : 'All' }));

export default function Dispatch() {
  return <Gate perms="dispatch.view"><List /></Gate>;
}

function List() {
  const router = useRouter();
  const { can } = useSession();
  const { tablet } = useLayout();
  const [status, setStatus] = useState();
  const list = useGet('/dispatches', { limit: 50, status }, { refetchInterval: 60000 });
  return (
    <View style={styles.root}>
      <FlatList
        data={list.payload || []}
        keyExtractor={(d) => d.id}
        contentContainerStyle={[styles.list, tablet && { maxWidth: CONTENT_MAX, width: '100%', alignSelf: 'center' }]}
        refreshControl={<RefreshControl refreshing={list.isRefetching} onRefresh={list.refetch} colors={[palette.forest]} />}
        ListHeaderComponent={(
          <View>
            {can('dispatch.create') && <ActionButton label="New dispatch" icon="plus" onPress={() => router.push('/(app)/dispatch/new')} style={{ marginBottom: space.md }} />}
            <Chips options={FILTERS} value={status} onChange={setStatus} />
          </View>
        )}
        ListEmptyComponent={list.isError || list.isPending ? <QueryState query={list}><View /></QueryState> : <Empty icon="truck-delivery-outline" text={status ? 'No dispatches with this status.' : 'No dispatches yet.'} hint={can('dispatch.create') ? 'Start one with "New dispatch".' : undefined} />}
        ListHeaderComponentStyle={undefined}
        renderItem={({ item: d }) => (
          <ListRow
            icon="truck-delivery-outline"
            title={d.dispatch_no}
            subtitle={`${d.order_no}${d.to_party ? ` · ${d.to_party}` : ''}`}
            meta={`${d.roll_count} roll${d.roll_count === 1 ? '' : 's'} · ${quantity(d.total_m)} m${d.vehicle_no ? ` · ${d.vehicle_no}` : ''} · ${date(d.created_at)}`}
            right={<StatusBadge value={d.status} />}
            onPress={() => router.push(`/(app)/dispatch/${d.id}`)}
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
