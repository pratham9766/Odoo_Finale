import React, { useState } from 'react';
import { Alert, StyleSheet, Text, View } from 'react-native';
import { Button, TextInput } from 'react-native-paper';
import { useLocalSearchParams } from 'expo-router';
import Gate from '../../../src/components/Gate';
import ScanModal from '../../../src/components/ScanModal';
import { useSession } from '../../../src/context/Session';
import { useAction, useGet } from '../../../src/lib/hooks';
import { Empty, Facts, Kpi, KpiRow, PageTitle, Panel, Pill, QueryState, Screen, Section } from '../../../src/components/ui';
import { date, quantity } from '../../../src/utils/format';
import { palette, space } from '../../../src/theme/theme';

export default function DispatchDetail() {
  return <Gate perms="dispatch.view"><Body /></Gate>;
}

/** Scan or type a roll number: the server refuses a roll that is not passed, belongs to another order or is already on a truck. */
function Body() {
  const { id } = useLocalSearchParams();
  const { can } = useSession();
  const act = useAction();
  const [code, setCode] = useState('');
  const [scanning, setScanning] = useState(false);
  const [last, setLast] = useState(null);       // { ok, text } of the latest scan
  const q = useGet(`/dispatches/${id}`, {}, { refetchInterval: 30000 });
  const d = q.payload;
  const packing = d?.status === 'packing';

  const scan = value => {
    const v = value.trim();
    if (!v) return;
    act.mutate({ path: `/dispatches/${id}/scan`, body: { code: v }, quiet: true }, {
      onSuccess: () => { setCode(''); setLast({ ok: true, text: `Added ${v}` }); },
      onError: e => setLast({ ok: false, text: e.message }),
    });
  };
  const remove = roll => act.mutate({ method: 'DELETE', path: `/dispatches/${id}/rolls/${roll.roll_id}` });
  const confirm = () => Alert.alert(`Confirm ${d.rolls.length} rolls?`, 'This creates the invoice from the scanned rolls.', [
    { text: 'Not yet', style: 'cancel' },
    { text: 'Confirm and invoice', onPress: () => act.mutate({ path: `/dispatches/${id}/confirm` }, { onSuccess: () => Alert.alert('Dispatch confirmed', 'The invoice was created from the scanned rolls.') }) },
  ]);
  const move = status => act.mutate({ path: `/dispatches/${id}/status`, body: { status } });

  return (
    <Screen onRefresh={q.refetch} refreshing={q.isRefetching}>
      <QueryState query={q}>
        {d && (
          <>
            <PageTitle eyebrow="DISPATCH" title={d.dispatch_no} description={`${d.order_no}${d.to_party ? ` · ${d.to_party}` : ''}`} right={<Pill value={d.status} />} />
            <Panel>
              <Facts items={[
                ['Vehicle', d.vehicle_no || '–'],
                ['Driver', [d.driver_name, d.driver_phone].filter(Boolean).join(' · ') || '–'],
                d.confirmed_at && ['Confirmed', date(d.confirmed_at)],
                d.delivered_at && ['Delivered', date(d.delivered_at)],
              ]} />
            </Panel>
            <KpiRow>
              <Kpi label="On this truck" value={`${quantity(d.totals.scanned)} m`} />
              <Kpi label="Still to send" value={`${quantity(d.totals.remaining)} m`} />
            </KpiRow>

            <View style={styles.actions}>
              {packing && can('dispatch.confirm') && <Button mode="contained" onPress={confirm} disabled={d.rolls.length === 0 || act.isPending} style={{ flex: 1 }}>Confirm and invoice</Button>}
              {d.status === 'confirmed' && can('dispatch.confirm') && <Button mode="outlined" onPress={() => move('in_transit')} style={{ flex: 1 }}>Mark in transit</Button>}
              {(d.status === 'confirmed' || d.status === 'in_transit') && can('dispatch.confirm') && <Button mode="contained" onPress={() => move('delivered')} style={{ flex: 1 }}>Mark delivered</Button>}
            </View>

            {packing && can('dispatch.create') && (
              <Section title="Add rolls" note="Scan the QR label or type the roll number.">
                <Button mode="contained-tonal" icon="qrcode-scan" onPress={() => setScanning(true)} contentStyle={{ height: 46 }}>Scan a roll</Button>
                <View style={styles.typeRow}>
                  <TextInput mode="outlined" label="Roll number" value={code} onChangeText={setCode} autoCapitalize="characters" style={{ flex: 1, backgroundColor: '#fff' }}
                    outlineColor={palette.linen} activeOutlineColor={palette.forest} onSubmitEditing={() => scan(code)} />
                  <Button mode="contained" onPress={() => scan(code)} loading={act.isPending} disabled={!code.trim() || act.isPending}>Add</Button>
                </View>
                {last && <Text style={[styles.note, { color: last.ok ? palette.ok : palette.danger }]}>{last.text}</Text>}
              </Section>
            )}

            <Section title={`Rolls on this dispatch (${d.rolls.length})`}>
              {d.rolls.length === 0 ? <Panel><Empty icon="roll-of-paper" text="No rolls scanned yet." /></Panel> : d.rolls.map(r => (
                <Panel key={r.roll_id} style={styles.roll}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.strong}>{r.roll_no}</Text>
                    <Text style={styles.sub}>{r.item}{r.colour ? ` · ${r.colour}` : ''} · {quantity(r.length_m)} m{r.weight_kg ? ` · ${quantity(r.weight_kg)} kg` : ''}</Text>
                  </View>
                  {packing && can('dispatch.create') && <Button compact textColor={palette.danger} onPress={() => remove(r)}>Remove</Button>}
                </Panel>
              ))}
            </Section>
          </>
        )}
      </QueryState>
      <ScanModal visible={scanning} title="Scan rolls onto the truck" message={last} onScan={scan} onClose={() => setScanning(false)} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  actions: { flexDirection: 'row', gap: space.md, marginVertical: space.lg },
  typeRow: { flexDirection: 'row', gap: space.sm, alignItems: 'center', marginTop: space.md },
  note: { marginTop: space.sm, fontSize: 13, fontWeight: '600' },
  roll: { flexDirection: 'row', alignItems: 'center', paddingVertical: space.md },
  strong: { fontSize: 15, fontWeight: '700', color: palette.ink },
  sub: { fontSize: 13, color: palette.textSecondary, marginTop: 2 },
});
