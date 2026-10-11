import React, { useState } from 'react';
import { FlatList, RefreshControl, StyleSheet, View } from 'react-native';
import { useRouter } from 'expo-router';
import Gate from '../../../src/components/Gate';
import { useGet } from '../../../src/lib/hooks';
import { AppText, Chips, Empty, ListRow, QueryState, StatusBadge, useLayout } from '../../../src/components/ui';
import { date } from '../../../src/utils/format';
import { CONTENT_MAX, palette, space } from '../../../src/theme/theme';

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
  const { tablet } = useLayout();
  const [status, setStatus] = useState();
  const list = useGet('/receipts', { limit: 50, status });
  return (
    <View style={styles.root}>
      <FlatList
        data={list.payload || []}
        keyExtractor={(g) => g.id}
        contentContainerStyle={[styles.list, tablet && { maxWidth: CONTENT_MAX, width: '100%', alignSelf: 'center' }]}
        refreshControl={<RefreshControl refreshing={list.isRefetching} onRefresh={list.refetch} colors={[palette.forest]} />}
        ListHeaderComponent={(
          <View>
            <AppText variant="small" style={{ marginBottom: space.md }}>Yarn and other material arriving at the gate. A draft receipt adds nothing to stock until it is posted. New receipts are entered on the web app.</AppText>
            <Chips options={FILTERS} value={status} onChange={setStatus} />
          </View>
        )}
        ListEmptyComponent={list.isError || list.isPending
          ? <QueryState query={list}><View /></QueryState>
          : <Empty icon="receipt-text-outline" text={status ? `No ${status} receipts.` : 'No goods receipts yet.'} />}
        renderItem={({ item: g }) => (
          <ListRow
            icon="receipt-text-outline"
            title={g.grn_no}
            subtitle={g.supplier_name || 'No supplier'}
            meta={`${g.line_count} line${g.line_count === 1 ? '' : 's'} · ${date(g.posted_at || g.created_at)}${g.vehicle_no ? ` · ${g.vehicle_no}` : ''}`}
            right={<StatusBadge value={g.status} />}
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
