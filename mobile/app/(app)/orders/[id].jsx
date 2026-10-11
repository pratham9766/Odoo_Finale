import React, { useState } from 'react';
import { Share, StyleSheet, View } from 'react-native';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Gate from '../../../src/components/Gate';
import { useSession } from '../../../src/context/Session';
import { useAction, useGet } from '../../../src/lib/hooks';
import { describeError } from '../../../src/services/api/errors';
import { ActionButton, AppText, Banner, ConfirmDialog, Empty, Facts, Field, PageTitle, Panel, Progress, QueryState, Screen, Section, StatusBadge, useToast } from '../../../src/components/ui';
import { date, dateTime, label, money, quantity } from '../../../src/utils/format';
import { palette, space } from '../../../src/theme/theme';

export default function OrderDetail() {
  return <Gate perms="orders.view"><Body /></Gate>;
}

function Body() {
  const { id } = useLocalSearchParams();
  const router = useRouter();
  const { can } = useSession();
  const toast = useToast();
  const act = useAction();
  const order = useGet(`/orders/${id}`);
  const o = order.payload;
  const [dialog, setDialog] = useState(null);       // 'confirm' | 'cancel' | 'share'
  const [reason, setReason] = useState('');
  const [problem, setProblem] = useState(null);

  const fail = (e, what) => {
    const i = describeError(e, { write: true });
    order.refetch();
    setProblem({ title: i.uncertain ? `${what} not confirmed` : `${what} did not go through`, text: i.uncertain ? 'The server did not answer. Pull down to refresh and check the order status before trying again.' : e.message });
  };
  const confirm = () => act.mutate({ path: `/orders/${id}/confirm`, body: {}, quiet: true }, {
    onSuccess: () => { setDialog(null); setProblem(null); toast('Order confirmed. Material has been reserved.'); },
    onError: (e) => { setDialog(null); fail(e, 'Confirmation'); },
  });
  const cancel = () => act.mutate({ path: `/orders/${id}/cancel`, body: reason.trim() ? { reason: reason.trim() } : {}, quiet: true }, {
    onSuccess: () => { setDialog(null); setProblem(null); setReason(''); toast('Order cancelled.'); },
    onError: (e) => { setDialog(null); fail(e, 'Cancelling'); },
  });
  // The same contract the web app uses (POST /orders/:id/tracking-link, orders.view): the token is created once and then reused.
  const share = () => act.mutate({ path: `/orders/${id}/tracking-link`, quiet: true }, {
    onSuccess: async (res) => {
      setDialog(null);
      try { await Share.share({ message: `Track order ${o.order_no}: ${res.data.url}`, url: res.data.url }); } catch { /* the person closed the share sheet */ }
    },
    onError: (e) => { setDialog(null); fail(e, 'Creating the link'); },
  });

  const canConfirm = o?.status === 'draft' && can('orders.confirm');
  const canCancel = o && !['cancelled', 'delivered', 'dispatched', 'closed', 'partially_dispatched'].includes(o.status) && can('orders.cancel');
  const canShare = o && o.status !== 'cancelled' && can('orders.view');

  return (
    <Screen onRefresh={order.refetch} refreshing={order.isRefetching}>
      <QueryState query={order}>
        {o && (
          <>
            <PageTitle eyebrow="ORDER" title={o.order_no} description={o.buyer_name} right={<StatusBadge value={o.status} />} />
            {problem ? <Banner tone="bad" title={problem.title} text={problem.text} secondaryAction={{ label: 'Dismiss', onPress: () => setProblem(null) }} /> : null}

            <Panel>
              <Facts items={[
                ['Deadline', date(o.deadline)],
                ['Priority', label(o.priority)],
                o.current_stage && ['Current stage', label(o.current_stage)],
                o.expected_completion && ['Expected completion', date(o.expected_completion)],
                o.risk && ['Deadline risk', o.risk === 'red' ? 'Late' : o.risk === 'amber' ? 'At risk' : 'On track'],
              ]} />
              <Progress pct={o.progress_pct} caption={`${Math.round(o.progress_pct || 0)}% complete`} />
            </Panel>

            {(canConfirm || canCancel || canShare) ? (
              <Section title="Actions">
                <View style={{ gap: space.md }}>
                  {canConfirm ? <ActionButton label="Confirm order" icon="check-circle-outline" onPress={() => setDialog('confirm')} disabled={act.isPending} /> : null}
                  {canShare ? <ActionButton kind="secondary" label="Share buyer tracking link" icon="share-variant-outline" onPress={() => setDialog('share')} disabled={act.isPending} /> : null}
                  {canCancel ? <ActionButton kind="destructiveOutline" label="Cancel order" icon="close-circle-outline" onPress={() => setDialog('cancel')} disabled={act.isPending} /> : null}
                </View>
              </Section>
            ) : null}

            <Section title="Items">
              {o.lines.map((l) => (
                <Panel key={l.id}>
                  <AppText variant="h3">{l.description}</AppText>
                  <AppText variant="small">{quantity(l.qty)} {l.uom}{l.rate != null ? ` · ${money(l.rate)} each` : ''}</AppText>
                  {l.rate != null && <AppText variant="small">Line total {money(l.qty * l.rate)}</AppText>}
                </Panel>
              ))}
            </Section>

            {o.work_orders?.length > 0 && (
              <Section title="Work orders" note="How many are in each state.">
                <Panel><Facts items={o.work_orders.map((w) => [label(w.status), w.count])} /></Panel>
              </Section>
            )}

            {o.rolls?.length > 0 && (
              <Section title="Rolls" note="Fabric made for this order, by quality result.">
                <Panel><Facts items={o.rolls.map((r) => [label(r.status), `${r.count} · ${quantity(r.length_m)} m`])} /></Panel>
              </Section>
            )}

            {o.dispatches?.length > 0 && (
              <Section title="Dispatches">
                {o.dispatches.map((d) => (
                  <Panel key={d.id} onPress={can('dispatch.view') ? () => router.push(`/(app)/dispatch/${d.id}`) : undefined} accessibilityLabel={`Dispatch ${d.dispatch_no}, ${d.status}`}>
                    <View style={styles.between}><AppText variant="h3">{d.dispatch_no}</AppText><StatusBadge value={d.status} /></View>
                    {d.delivered_at ? <AppText variant="small">Delivered {dateTime(d.delivered_at)}</AppText> : null}
                  </Panel>
                ))}
              </Section>
            )}

            {o.invoices?.length > 0 && (
              <Section title="Invoices">
                {o.invoices.map((i) => (
                  <Panel key={i.id}>
                    <View style={styles.between}><AppText variant="h3">{i.invoice_no}</AppText><StatusBadge value={i.status} /></View>
                    <AppText variant="small">{money(i.total)} · paid {money(i.paid_amount)} · due {date(i.due_date)}</AppText>
                  </Panel>
                ))}
              </Section>
            )}

            <Section title="Timeline">
              {o.events.length === 0 ? <Panel><Empty icon="timeline-clock-outline" text="No activity yet." /></Panel> : [...o.events].reverse().map((e) => (
                <View key={e.id} style={styles.event}>
                  <View style={styles.dot} />
                  <View style={{ flex: 1 }}>
                    <AppText variant="bodyStrong" style={{ fontSize: 15 }}>{label(e.event)}</AppText>
                    <AppText variant="caption">{dateTime(e.created_at)}</AppText>
                  </View>
                </View>
              ))}
            </Section>
          </>
        )}
      </QueryState>

      <ConfirmDialog visible={dialog === 'confirm'} title={`Confirm ${o?.order_no}?`} confirmLabel="Confirm order" loading={act.isPending} onCancel={() => setDialog(null)} onConfirm={confirm}
        message="The order becomes firm and the material it needs is reserved from stock." />
      <ConfirmDialog visible={dialog === 'cancel'} destructive title={`Cancel ${o?.order_no}?`} confirmLabel="Cancel order" loading={act.isPending} onCancel={() => setDialog(null)} onConfirm={cancel}
        message="This cannot be undone. Planned work orders are cancelled and reserved material is released. It is refused if production has already started.">
        <Field label="Reason" optional value={reason} onChangeText={setReason} maxLength={300} />
      </ConfirmDialog>
      <ConfirmDialog visible={dialog === 'share'} title="Share a tracking link?" confirmLabel="Create link and share" loading={act.isPending} onCancel={() => setDialog(null)} onConfirm={share}
        message="Anyone who gets this link can see this order's number, status, progress, deadline, items and quantities. It shows no prices, costs or worker details. The link does not expire and cannot be switched off here, so send it only to the buyer." />
    </Screen>
  );
}

const styles = StyleSheet.create({
  between: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space.sm },
  event: { flexDirection: 'row', gap: space.md, paddingVertical: space.sm, minHeight: 44 },
  dot: { width: 10, height: 10, borderRadius: 5, backgroundColor: palette.forestSoft, marginTop: 7 },
});
