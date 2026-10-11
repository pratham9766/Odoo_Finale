import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Gate from '../../../src/components/Gate';
import { useAction, useGet } from '../../../src/lib/hooks';
import { describeError } from '../../../src/services/api/errors';
import { ActionButton, AppText, Banner, Chips, ConfirmDialog, Facts, Field, PageTitle, Panel, QueryState, Screen, Section, StatusBadge, useToast } from '../../../src/components/ui';
import { date, quantity } from '../../../src/utils/format';
import { palette, radius, space } from '../../../src/theme/theme';

// The server's contract (POST /qc/inspections): result is pass | rework | reject, a rework or reject needs at least one defect.
const RESULTS = [
  { value: 'pass', label: 'Pass', icon: 'check-circle-outline', color: palette.ok, bg: palette.okBg, effect: 'The roll is released to packing and dispatch.' },
  { value: 'rework', label: 'Rework', icon: 'autorenew', color: palette.risk, bg: palette.riskBg, effect: 'A rework work order is created for this roll.' },
  { value: 'reject', label: 'Reject', icon: 'close-octagon-outline', color: palette.danger, bg: palette.dangerBg, effect: 'The roll is rejected and written off as scrap.' },
];

export default function Inspect() {
  return <Gate perms="qc.inspect"><Body /></Gate>;
}

/** Inspect one roll: opened from the queue (rollNo) or by scanning its label (qr). Both are looked up first, so the roll is identified BEFORE a decision. */
function Body() {
  const { rollNo, qr } = useLocalSearchParams();
  const lookup = rollNo || qr;
  const router = useRouter();
  const toast = useToast();
  const act = useAction();
  const roll = useGet(`/rolls/${encodeURIComponent(lookup || '-')}`, {}, { enabled: !!lookup });
  const defectTypes = useGet('/defect-types', { limit: 100 });
  const r = roll.payload;

  const [result, setResult] = useState(null);
  const [picked, setPicked] = useState({});             // defect_type_id -> count
  const [remarks, setRemarks] = useState('');
  const [error, setError] = useState(null);
  const [confirming, setConfirming] = useState(false);

  const types = defectTypes.payload || [];
  const toggle = (id) => setPicked((p) => { const n = { ...p }; if (n[id]) delete n[id]; else n[id] = 1; return n; });
  const bump = (id, by) => setPicked((p) => ({ ...p, [id]: Math.max(1, (p[id] || 1) + by) }));
  const chosen = RESULTS.find((o) => o.value === result);
  const needsDefect = result && result !== 'pass';
  const alreadyDone = r && r.status !== 'pending_qc';

  const send = () => {
    const defects = Object.entries(picked).map(([defect_type_id, count]) => ({ defect_type_id, count, severity: types.find((t) => t.id === defect_type_id)?.severity_default ?? 1 }));
    act.mutate({ path: '/qc/inspections', body: { roll_id: r.id, result, defects, ...(remarks.trim() ? { remarks: remarks.trim() } : {}) }, quiet: true }, {
      onSuccess: () => { setConfirming(false); toast(`${r.roll_no}: ${chosen.label.toLowerCase()} saved.`); router.back(); },
      onError: (e) => {
        setConfirming(false);
        const info = describeError(e, { write: true });
        roll.refetch();                                 // find out what really happened to this roll
        setError(info.uncertain
          ? { title: 'Not confirmed', text: 'The server did not answer. Check the roll status below before trying again: the result may already be saved.' }
          : { title: e.status === 409 ? 'This roll cannot be inspected now' : info.title, text: e.message });
      },
    });
  };
  const submit = () => {
    setError(null);
    if (!result) { setError({ title: 'Choose a result', text: 'Pass, rework or reject.' }); return; }
    if (needsDefect && Object.keys(picked).length === 0) { setError({ title: 'Add at least one defect', text: `A ${result} result needs a defect so the cause is on record.` }); return; }
    if (result === 'pass') send(); else setConfirming(true);
  };

  const body = r && (
    <>
      <PageTitle eyebrow="QC STATION" title={r.roll_no} description={`${r.item}${r.colour ? ` · ${r.colour}` : ''}`} right={<StatusBadge value={r.status} />} />
      <Panel>
        <Facts items={[
          ['Order', r.order_no], r.wo_no && ['Work order', r.wo_no], r.machine_code && ['Woven on', r.machine_code],
          ['Length', `${quantity(r.length_m)} m`], r.weight_kg && ['Weight', `${quantity(r.weight_kg)} kg`], r.dye_batch && ['Dye batch', r.dye_batch], ['Made', date(r.created_at)],
        ]} />
      </Panel>

      {alreadyDone ? (
        <Banner tone="info" title={`Already inspected: ${r.status.replaceAll('_', ' ')}`} text="This roll is no longer waiting for QC, so it cannot be inspected again here. If a result needs to change, a QC head can override it on the web." action={{ label: 'Back to the queue', onPress: () => router.back() }} />
      ) : (
        <>
          <Section title="1. Result" note="Tap one. What it does is shown under the buttons.">
            <View style={styles.results} accessibilityRole="radiogroup">
              {RESULTS.map((o) => {
                const on = result === o.value;
                return (
                  <Pressable key={o.value} onPress={() => setResult(o.value)} accessibilityRole="radio" accessibilityState={{ checked: on }} accessibilityLabel={`${o.label}. ${o.effect}`}
                    style={[styles.result, { borderColor: o.color }, on && { backgroundColor: o.color }]}>
                    <MaterialCommunityIcons name={on ? 'check-circle' : o.icon} size={26} color={on ? '#fff' : o.color} />
                    <AppText variant="h3" style={{ color: on ? '#fff' : o.color }}>{o.label}</AppText>
                  </Pressable>
                );
              })}
            </View>
            {chosen ? <AppText variant="small" style={{ marginTop: space.sm }}>{chosen.effect}</AppText> : null}
          </Section>

          <Section title="2. Defects found" note={needsDefect ? 'Choose at least one. Tap again to remove.' : 'Optional for a pass.'}>
            <QueryState query={defectTypes}>
              <Chips options={types.map((t) => ({ value: t.id, label: t.name }))} onChange={toggle} selected={Object.keys(picked)} />
              {Object.keys(picked).map((id) => (
                <Panel key={id} style={styles.defect}>
                  <AppText variant="h3" style={{ flex: 1 }}>{types.find((t) => t.id === id)?.name}</AppText>
                  <View style={styles.stepper}>
                    <Pressable onPress={() => bump(id, -1)} accessibilityRole="button" accessibilityLabel="One fewer" style={styles.step}><MaterialCommunityIcons name="minus" size={24} color={palette.forest} /></Pressable>
                    <AppText variant="h2" style={styles.count} accessibilityLabel={`Count ${picked[id]}`}>{picked[id]}</AppText>
                    <Pressable onPress={() => bump(id, 1)} accessibilityRole="button" accessibilityLabel="One more" style={styles.step}><MaterialCommunityIcons name="plus" size={24} color={palette.forest} /></Pressable>
                  </View>
                </Panel>
              ))}
            </QueryState>
          </Section>

          <Section title="3. Remarks">
            <Field label="Remarks" optional multiline value={remarks} onChangeText={setRemarks} maxLength={500} helper="Anything the next person should know. Up to 500 characters." />
          </Section>
          {error ? <Banner tone="bad" title={error.title} text={error.text} /> : null}
        </>
      )}
    </>
  );

  return (
    <Screen footer={r && !alreadyDone ? <ActionButton label={result ? `Save: ${chosen.label}` : 'Save inspection'} icon="content-save-outline" onPress={submit} loading={act.isPending} /> : null}>
      {lookup ? <QueryState query={roll}>{body}</QueryState> : <Banner tone="bad" title="No roll selected" text="Open a roll from the QC queue or scan its label." />}
      <ConfirmDialog visible={confirming} destructive={result === 'reject'} title={`${chosen?.label} ${r?.roll_no}?`} confirmLabel={`${chosen?.label} this roll`} loading={act.isPending}
        message={`${chosen?.effect} This is recorded against your name. Only a QC head can change it afterwards.`} onCancel={() => setConfirming(false)} onConfirm={send} />
    </Screen>
  );
}

const styles = StyleSheet.create({
  results: { flexDirection: 'row', gap: space.sm },
  result: { flex: 1, minHeight: 76, paddingVertical: 12, borderRadius: radius.md, borderWidth: 2, alignItems: 'center', justifyContent: 'center', gap: 4, backgroundColor: '#fff' },
  defect: { flexDirection: 'row', alignItems: 'center', gap: space.md, paddingVertical: space.sm },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: space.sm },
  step: { width: 48, height: 48, borderRadius: radius.md, borderWidth: 1.5, borderColor: palette.forest, alignItems: 'center', justifyContent: 'center' },
  count: { minWidth: 32, textAlign: 'center' },
});
