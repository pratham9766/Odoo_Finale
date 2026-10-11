import React, { useState } from 'react';
import { View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import Gate from '../../../src/components/Gate';
import { useSession } from '../../../src/context/Session';
import { useAction, useGet } from '../../../src/lib/hooks';
import { describeError } from '../../../src/services/api/errors';
import { ActionButton, AppText, Banner, ConfirmDialog, Facts, PageTitle, Panel, QueryState, Screen, Section, StatusBadge, useToast } from '../../../src/components/ui';
import { dateTime, money, quantity } from '../../../src/utils/format';
import { space } from '../../../src/theme/theme';

export default function ReceiptDetail() {
  return <Gate perms={['receipt.view', 'receipt.create', 'stock.view']}><Body /></Gate>;
}

function Body() {
  const { id } = useLocalSearchParams();
  const { can } = useSession();
  const toast = useToast();
  const act = useAction();
  const receipt = useGet(`/receipts/${id}`);
  const g = receipt.payload;
  const [dialog, setDialog] = useState(null);
  const [problem, setProblem] = useState(null);

  const done = (what, message) => ({
    onSuccess: () => { setDialog(null); setProblem(null); toast(message); },
    onError: (e) => {
      setDialog(null);
      const i = describeError(e, { write: true });
      receipt.refetch();                          // find out what really happened: it may have gone through
      setProblem({ title: i.uncertain ? `${what} not confirmed` : `${what} did not go through`, text: i.uncertain ? 'The server did not answer. The status above has been refreshed: check it before trying again.' : e.message });
    },
  });
  const post = () => act.mutate({ path: `/receipts/${id}/post`, quiet: true }, done('Posting', 'Receipt posted. The material is now in stock.'));
  const cancel = () => act.mutate({ path: `/receipts/${id}/cancel`, quiet: true }, done('Cancelling', 'Receipt cancelled.'));

  return (
    <Screen onRefresh={receipt.refetch} refreshing={receipt.isRefetching}>
      <QueryState query={receipt}>
        {g && (
          <>
            <PageTitle eyebrow="GOODS RECEIPT" title={g.grn_no} description={g.supplier_name} right={<StatusBadge value={g.status} />} />
            {problem ? <Banner tone="bad" title={problem.title} text={problem.text} secondaryAction={{ label: 'Dismiss', onPress: () => setProblem(null) }} /> : null}
            <Panel>
              <Facts items={[
                ['Created', dateTime(g.created_at)],
                g.posted_at && ['Posted', dateTime(g.posted_at)],
                g.vehicle_no && ['Vehicle', g.vehicle_no],
              ]} />
            </Panel>

            {g.status === 'draft' && (can('receipt.post') || can('receipt.delete')) && (
              <Section title="Next step" note="This receipt is a draft. Nothing has been added to stock yet.">
                <View style={{ gap: space.md }}>
                  {can('receipt.post') && <ActionButton label="Post to stock" icon="package-down" onPress={() => setDialog('post')} disabled={act.isPending} />}
                  {can('receipt.delete') && <ActionButton kind="destructiveOutline" label="Cancel receipt" icon="close-circle-outline" onPress={() => setDialog('cancel')} disabled={act.isPending} />}
                </View>
              </Section>
            )}

            <Section title="Material received" note="Quantity received against what was expected, with its lot number.">
              {g.lines.map((l) => (
                <Panel key={l.id}>
                  <AppText variant="h3">{l.item_name}</AppText>
                  <AppText variant="small">Received <AppText variant="bodyStrong" style={{ fontSize: 15 }}>{quantity(l.received_qty)} {l.uom}</AppText>{l.expected_qty != null ? ` of ${quantity(l.expected_qty)} ${l.uom} expected` : ''}</AppText>
                  <AppText variant="caption">Lot {l.lot_no}{l.rate != null ? ` · ${money(l.rate)} per ${l.uom}` : ''}</AppText>
                </Panel>
              ))}
            </Section>
          </>
        )}
      </QueryState>

      <ConfirmDialog visible={dialog === 'post'} title={`Post ${g?.grn_no}?`} confirmLabel="Post to stock" loading={act.isPending} onCancel={() => setDialog(null)} onConfirm={post}
        message={g ? `${g.lines.length} line${g.lines.length === 1 ? '' : 's'} of material are added to stock as separate lots. A posted receipt cannot be edited.` : ''} />
      <ConfirmDialog visible={dialog === 'cancel'} destructive title={`Cancel ${g?.grn_no}?`} confirmLabel="Cancel receipt" loading={act.isPending} onCancel={() => setDialog(null)} onConfirm={cancel}
        message="The draft is dropped. Nothing was added to stock, so nothing is removed." />
    </Screen>
  );
}
