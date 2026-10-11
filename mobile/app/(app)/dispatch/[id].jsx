import React, { useState } from 'react';
import { StyleSheet, View } from 'react-native';
import { useLocalSearchParams } from 'expo-router';
import Gate from '../../../src/components/Gate';
import ScanModal from '../../../src/components/ScanModal';
import { useSession } from '../../../src/context/Session';
import { useAction, useGet } from '../../../src/lib/hooks';
import { describeError } from '../../../src/services/api/errors';
import { ActionButton, AppText, Banner, ConfirmDialog, Empty, Facts, Field, Kpi, KpiRow, PageTitle, Panel, QueryState, Screen, Section, StatusBadge, useToast } from '../../../src/components/ui';
import { dateTime, quantity } from '../../../src/utils/format';
import { space } from '../../../src/theme/theme';

export default function DispatchDetail() {
  return <Gate perms="dispatch.view"><Body /></Gate>;
}

// What a refused scan means on the floor, and what to do about it. The server's own message is shown with it.
const SCAN_HELP = {
  ROLL_WRONG_ORDER: 'This roll belongs to a different order. Put it aside; do not load it on this truck.',
  ROLL_NOT_PASSED: 'This roll has not passed quality control. Send it to QC; it cannot be dispatched yet.',
  ROLL_ALREADY_DISPATCHED: 'This roll is already on a dispatch. Check which truck it went on before doing anything.',
  QTY_EXCEEDS_ORDER: 'Adding this roll would send more than the buyer ordered. Leave it in stock.',
  NOT_FOUND: 'No roll matches this code. Check the label, or type the roll number.',
};

function Body() {
  const { id } = useLocalSearchParams();
  const { can } = useSession();
  const toast = useToast();
  const act = useAction();
  const [code, setCode] = useState('');
  const [scanning, setScanning] = useState(false);
  const [last, setLast] = useState(null);                 // result of the latest scan: { kind: ok | repeat | error | unconfirmed, text }
  const [confirming, setConfirming] = useState(false);
  const [removing, setRemoving] = useState(null);
  const [problem, setProblem] = useState(null);           // a banner about confirm / status / remove that did not go through
  const q = useGet(`/dispatches/${id}`, {}, { refetchInterval: 30000 });
  const d = q.payload;
  const packing = d?.status === 'packing';
  const canPack = packing && can('dispatch.create');
  const canConfirm = can('dispatch.confirm');
  const meters = (n) => `${quantity(n)} m`;

  const scan = (value) => {
    const v = String(value || '').trim();
    if (!v || act.isPending) return;
    act.mutate({ path: `/dispatches/${id}/scan`, body: { code: v }, quiet: true }, {
      onSuccess: (res) => {
        setCode('');
        const r = res.data;
        setLast(r.already_scanned
          ? { kind: 'repeat', ok: true, text: `${r.roll_no} is already on this dispatch. Nothing was added twice.` }
          : { kind: 'ok', ok: true, text: `Added ${r.roll_no} (${meters(r.length_m)}). ${meters(r.remaining)} still to send.` });
      },
      onError: (e) => {
        const info = describeError(e, { write: true });
        if (info.uncertain) {
          setLast({ kind: 'unconfirmed', ok: false, text: 'Not confirmed. The server did not answer, so the roll may or may not be on the list. Check the list below, then scan again if it is missing. Scanning twice is safe.' });
          q.refetch();
        } else setLast({ kind: 'error', ok: false, text: `${SCAN_HELP[e.code] ?? info.message}${SCAN_HELP[e.code] ? ` (${e.message})` : ''}` });
      },
    });
  };

  /** A lost answer: reload the dispatch and say plainly that we do not know yet, instead of showing success or an old state. */
  const handleFailure = (e, what) => {
    const info = describeError(e, { write: true });
    q.refetch();
    if (info.uncertain) setProblem({ title: `${what} not confirmed`, text: 'The server did not answer. Pull down to refresh and check the status before trying again.' });
    else if (e.status === 409) setProblem({ title: `${what} was not done`, text: `${e.message} The screen has been refreshed.` });
    else setProblem({ title: `${what} did not go through`, text: info.message });
  };

  const confirm = () => act.mutate({ path: `/dispatches/${id}/confirm`, quiet: true }, {
    onSuccess: () => { setConfirming(false); setProblem(null); toast('Dispatch confirmed. The invoice was created.'); },
    onError: (e) => { setConfirming(false); handleFailure(e, 'Confirmation'); },
  });
  const move = (status) => act.mutate({ path: `/dispatches/${id}/status`, body: { status }, quiet: true }, {
    onSuccess: () => { setProblem(null); toast(status === 'delivered' ? 'Marked as delivered.' : 'Marked as in transit.'); },
    onError: (e) => handleFailure(e, 'Status change'),
  });
  const remove = () => act.mutate({ method: 'DELETE', path: `/dispatches/${id}/rolls/${removing.roll_id}`, quiet: true }, {
    onSuccess: () => { setRemoving(null); toast(`${removing.roll_no} removed from this dispatch.`); },
    onError: (e) => { setRemoving(null); handleFailure(e, 'Removing the roll'); },
  });

  return (
    <Screen onRefresh={q.refetch} refreshing={q.isRefetching}>
      <QueryState query={q}>
        {d && (
          <>
            {/* 1. overview */}
            <PageTitle eyebrow="DISPATCH" title={d.dispatch_no} description={`${d.order_no}${d.to_party ? ` · ${d.to_party}` : ''}`} right={<StatusBadge value={d.status} />} />
            <KpiRow>
              <Kpi label="Ordered" value={meters(d.totals.ordered)} sub="whole order" />
              <Kpi label="On this truck" value={meters(d.totals.scanned)} sub={`${d.rolls.length} roll${d.rolls.length === 1 ? '' : 's'}`} tone={d.rolls.length ? 'ok' : undefined} />
              <Kpi label="Sent earlier" value={meters(d.totals.earlier)} />
              <Kpi label="Still to send" value={meters(d.totals.remaining)} tone={d.totals.remaining < 0 ? 'bad' : undefined} />
            </KpiRow>
            <View style={{ height: space.lg }} />
            <Panel>
              <Facts items={[
                ['Vehicle', d.vehicle_no || '–'],
                ['Driver', [d.driver_name, d.driver_phone].filter(Boolean).join(' · ') || '–'],
                d.confirmed_at && ['Confirmed', dateTime(d.confirmed_at)],
                d.delivered_at && ['Delivered', dateTime(d.delivered_at)],
              ]} />
            </Panel>
            {problem ? <Banner tone="bad" title={problem.title} text={problem.text} secondaryAction={{ label: 'Dismiss', onPress: () => setProblem(null) }} /> : null}

            {/* 2. packing */}
            {canPack && (
              <Section title="Add rolls" note="Scan the QR label, or type the roll number. A roll that does not belong here is refused, with the reason.">
                <ActionButton label="Scan a roll" icon="qrcode-scan" onPress={() => setScanning(true)} />
                <View style={{ height: space.md }} />
                <Field label="Or type the roll number" value={code} onChangeText={setCode} autoCapitalize="characters" returnKeyType="done" onSubmitEditing={() => scan(code)} editable={!act.isPending} />
                <ActionButton label="Add roll" kind="secondary" onPress={() => scan(code)} loading={act.isPending} disabled={!code.trim()} />
                {last ? (
                  <Banner style={{ marginTop: space.md }} tone={last.kind === 'ok' ? 'ok' : last.kind === 'repeat' ? 'info' : last.kind === 'unconfirmed' ? 'risk' : 'bad'}
                    title={{ ok: 'Added', repeat: 'Already on this dispatch', unconfirmed: 'Not confirmed', error: 'Roll refused' }[last.kind]} text={last.text} />
                ) : null}
              </Section>
            )}

            {/* 3. packed rolls */}
            <Section title={`Rolls on this dispatch (${d.rolls.length})`} note={packing ? 'These are held for this truck until the dispatch is confirmed.' : undefined}>
              {d.rolls.length === 0 ? <Panel><Empty icon="paper-roll-outline" text="No rolls scanned yet." hint={canPack ? 'Scan the first roll above.' : 'Rolls are added while the dispatch is being packed.'} /></Panel> : d.rolls.map((r) => (
                <Panel key={r.roll_id} style={styles.roll}>
                  <View style={{ flex: 1 }}>
                    <AppText variant="h3">{r.roll_no}</AppText>
                    <AppText variant="small">{r.item}{r.colour ? ` · ${r.colour}` : ''}</AppText>
                    <AppText variant="small">{meters(r.length_m)}{r.weight_kg ? ` · ${quantity(r.weight_kg)} kg` : ''}</AppText>
                  </View>
                  {canPack ? <ActionButton compact kind="destructiveOutline" label="Remove" onPress={() => setRemoving(r)} /> : null}
                </Panel>
              ))}
            </Section>

            {/* 4. confirmation and what comes after */}
            {(canConfirm && (packing || d.status === 'confirmed' || d.status === 'in_transit')) && (
              <Section title={packing ? 'Confirm dispatch' : 'After loading'} note={packing ? 'Confirming locks these rolls to this dispatch and creates the invoice. It cannot be undone here.' : undefined}>
                {packing ? (
                  <ActionButton label={`Confirm ${d.rolls.length} roll${d.rolls.length === 1 ? '' : 's'} and create invoice`} icon="check-decagram-outline" onPress={() => setConfirming(true)} disabled={d.rolls.length === 0 || act.isPending} />
                ) : (
                  <View style={{ gap: space.md }}>
                    {d.status === 'confirmed' ? <ActionButton kind="secondary" label="Mark in transit" icon="truck-fast-outline" onPress={() => move('in_transit')} loading={act.isPending} /> : null}
                    <ActionButton label="Mark delivered" icon="package-variant-closed-check" onPress={() => move('delivered')} loading={act.isPending} />
                  </View>
                )}
                {packing && d.rolls.length === 0 ? <AppText variant="caption" style={{ marginTop: space.sm }}>Scan at least one roll before confirming.</AppText> : null}
              </Section>
            )}
          </>
        )}
      </QueryState>

      <ConfirmDialog visible={confirming} title="Confirm this dispatch?" confirmLabel="Confirm and invoice" loading={act.isPending} onCancel={() => setConfirming(false)} onConfirm={confirm}
        message={d ? `${d.rolls.length} roll${d.rolls.length === 1 ? '' : 's'}, ${meters(d.totals.scanned)} for ${d.order_no}. The invoice is created from exactly these rolls.` : ''} />
      <ConfirmDialog visible={!!removing} title="Remove this roll?" confirmLabel="Remove roll" destructive loading={act.isPending} onCancel={() => setRemoving(null)} onConfirm={remove}
        message={removing ? `${removing.roll_no} goes back to stock as passed. You can scan it again.` : ''} />
      <ScanModal visible={scanning} title="Scan rolls onto the truck" message={last ? { ok: last.kind === 'ok' || last.kind === 'repeat', text: last.kind === 'unconfirmed' ? 'Not confirmed. Check the list.' : last.text } : null} onScan={scan} onClose={() => setScanning(false)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  roll: { flexDirection: 'row', alignItems: 'center', gap: space.md },
});
