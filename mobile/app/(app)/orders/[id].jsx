import React from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { Button } from 'react-native-paper';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Gate from '../../../src/components/Gate';
import { useSession } from '../../../src/context/Session';
import { useAction, useGet } from '../../../src/lib/hooks';
import { Empty, Facts, PageTitle, Panel, Pill, Progress, QueryState, Screen, Section } from '../../../src/components/ui';
import { date, dateTime, label, money, quantity } from '../../../src/utils/format';
import { palette, space } from '../../../src/theme/theme';

export default function OrderDetail() {
  return <Gate perms="orders.view"><Body /></Gate>;
}

function Body() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const { can } = useSession();
  const act = useAction();
  const order = useGet(`/orders/${id}`);
  const o = order.payload;

  const confirm = () => act.mutate({ path: `/orders/${id}/confirm`, body: {} });
  const cancel = () => Alert.alert('Cancel this order?', 'This cannot be undone.', [
    { text: 'Keep it', style: 'cancel' },
    { text: 'Cancel order', style: 'destructive', onPress: () => act.mutate({ path: `/orders/${id}/cancel`, body: {} }) },
  ]);

  return (
    <Screen onRefresh={order.refetch} refreshing={order.isRefetching}>
      <QueryState query={order}>
        {o && (
          <>
            <PageTitle eyebrow="ORDER" title={o.order_no} description={o.buyer_name} right={<Pill value={o.status} />} />

            <Panel>
              <Facts items={[
                ['Deadline', date(o.deadline)],
                ['Priority', label(o.priority)],
                o.current_stage && ['Current stage', label(o.current_stage)],
                o.expected_completion && ['Expected completion', date(o.expected_completion)],
                o.risk && ['Risk', label(o.risk)],
              ]} />
              <Progress pct={o.progress_pct} caption={`${Math.round(o.progress_pct || 0)}% complete`} />
            </Panel>

            {(o.status === 'draft' && can('orders.confirm')) || (!['cancelled', 'delivered', 'dispatched'].includes(o.status) && can('orders.cancel')) ? (
              <View style={styles.actions}>
                {o.status === 'draft' && can('orders.confirm') && <Button mode="contained" onPress={confirm} loading={act.isPending} style={{ flex: 1 }}>Confirm order</Button>}
                {!['cancelled', 'delivered', 'dispatched'].includes(o.status) && can('orders.cancel') && <Button mode="outlined" textColor={palette.danger} onPress={cancel} style={{ flex: 1 }}>Cancel</Button>}
              </View>
            ) : null}

            <Section title="Items">
              {o.lines.map(l => (
                <Panel key={l.id}>
                  <Text style={styles.strong}>{l.description}</Text>
                  <Text style={styles.sub}>{quantity(l.qty)} {l.uom}{l.rate != null ? ` · ${money(l.rate)} each` : ''}</Text>
                  {l.rate != null && <Text style={styles.sub}>Line total {money(l.qty * l.rate)}</Text>}
                </Panel>
              ))}
            </Section>

            {o.work_orders?.length > 0 && (
              <Section title="Work orders">
                <Panel><Facts items={o.work_orders.map(w => [label(w.status), w.count])} /></Panel>
              </Section>
            )}

            {o.rolls?.length > 0 && (
              <Section title="Rolls">
                <Panel><Facts items={o.rolls.map(r => [label(r.status), `${r.count} · ${quantity(r.length_m)} m`])} /></Panel>
              </Section>
            )}

            {o.dispatches?.length > 0 && (
              <Section title="Dispatches">
                {o.dispatches.map(d => (
                  <Panel key={d.id} onPress={can('dispatch.view') ? () => router.push(`/(app)/dispatch/${d.id}`) : undefined}>
                    <View style={styles.between}><Text style={styles.strong}>{d.dispatch_no}</Text><Pill value={d.status} /></View>
                    {d.delivered_at ? <Text style={styles.sub}>Delivered {dateTime(d.delivered_at)}</Text> : null}
                  </Panel>
                ))}
              </Section>
            )}

            {o.invoices?.length > 0 && (
              <Section title="Invoices">
                {o.invoices.map(i => (
                  <Panel key={i.id}>
                    <View style={styles.between}><Text style={styles.strong}>{i.invoice_no}</Text><Pill value={i.status} /></View>
                    <Text style={styles.sub}>{money(i.total)} · paid {money(i.paid_amount)} · due {date(i.due_date)}</Text>
                  </Panel>
                ))}
              </Section>
            )}

            <Section title="Timeline">
              {o.events.length === 0 ? <Panel><Empty text="No activity yet." /></Panel> : [...o.events].reverse().map(e => (
                <View key={e.id} style={styles.event}>
                  <View style={styles.dot} />
                  <View style={{ flex: 1 }}>
                    <Text style={styles.strong}>{label(e.event)}</Text>
                    <Text style={styles.sub}>{dateTime(e.created_at)}</Text>
                  </View>
                </View>
              ))}
            </Section>
          </>
        )}
      </QueryState>
    </Screen>
  );
}

const styles = StyleSheet.create({
  strong: { fontSize: 15, fontWeight: '700', color: palette.ink, flexShrink: 1 },
  sub: { fontSize: 13, color: palette.textSecondary, marginTop: 2 },
  between: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space.sm },
  actions: { flexDirection: 'row', gap: space.md, marginBottom: space.lg },
  event: { flexDirection: 'row', gap: space.md, paddingVertical: space.sm },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: palette.gold, marginTop: 5 },
});
