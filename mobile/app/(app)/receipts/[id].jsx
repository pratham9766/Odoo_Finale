import React from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { Button } from 'react-native-paper';
import { useLocalSearchParams } from 'expo-router';
import Gate from '../../../src/components/Gate';
import { useSession } from '../../../src/context/Session';
import { useAction, useGet } from '../../../src/lib/hooks';
import { Facts, PageTitle, Panel, Pill, QueryState, Screen, Section } from '../../../src/components/ui';
import { dateTime, money, quantity } from '../../../src/utils/format';
import { palette, space } from '../../../src/theme/theme';

export default function ReceiptDetail() {
  return <Gate perms={['receipt.view', 'receipt.create', 'stock.view']}><Body /></Gate>;
}

function Body() {
  const { id } = useLocalSearchParams();
  const { can } = useSession();
  const act = useAction();
  const receipt = useGet(`/receipts/${id}`);
  const g = receipt.payload;

  const post = () => Alert.alert('Post this receipt?', 'The material is added to stock.', [
    { text: 'Not yet', style: 'cancel' },
    { text: 'Post', onPress: () => act.mutate({ path: `/receipts/${id}/post` }) },
  ]);
  const cancel = () => Alert.alert('Cancel this receipt?', undefined, [
    { text: 'Keep it', style: 'cancel' },
    { text: 'Cancel receipt', style: 'destructive', onPress: () => act.mutate({ path: `/receipts/${id}/cancel` }) },
  ]);

  return (
    <Screen onRefresh={receipt.refetch} refreshing={receipt.isRefetching}>
      <QueryState query={receipt}>
        {g && (
          <>
            <PageTitle eyebrow="GOODS RECEIPT" title={g.grn_no} description={g.supplier_name} right={<Pill value={g.status} />} />
            <Panel>
              <Facts items={[
                ['Created', dateTime(g.created_at)],
                g.posted_at && ['Posted', dateTime(g.posted_at)],
                g.vehicle_no && ['Vehicle', g.vehicle_no],
              ]} />
            </Panel>

            {g.status === 'draft' && (can('receipt.post') || can('receipt.delete')) && (
              <View style={styles.actions}>
                {can('receipt.post') && <Button mode="contained" onPress={post} loading={act.isPending} style={{ flex: 1 }}>Post to stock</Button>}
                {can('receipt.delete') && <Button mode="outlined" textColor={palette.danger} onPress={cancel} style={{ flex: 1 }}>Cancel</Button>}
              </View>
            )}

            <Section title="Material received">
              {g.lines.map(l => (
                <Panel key={l.id}>
                  <Text style={styles.strong}>{l.item_name}</Text>
                  <Text style={styles.sub}>{quantity(l.received_qty)} {l.uom}{l.expected_qty != null ? ` of ${quantity(l.expected_qty)} expected` : ''} · lot {l.lot_no}{l.rate != null ? ` · ${money(l.rate)} each` : ''}</Text>
                </Panel>
              ))}
            </Section>
          </>
        )}
      </QueryState>
    </Screen>
  );
}

const styles = StyleSheet.create({
  strong: { fontSize: 15, fontWeight: '700', color: palette.ink },
  sub: { fontSize: 13, color: palette.textSecondary, marginTop: 2 },
  actions: { flexDirection: 'row', gap: space.md, marginBottom: space.lg },
});
