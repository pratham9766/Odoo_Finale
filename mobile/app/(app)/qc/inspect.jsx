import React, { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Button, TextInput } from 'react-native-paper';
import { useLocalSearchParams, useRouter } from 'expo-router';
import Gate from '../../../src/components/Gate';
import { useAction, useGet } from '../../../src/lib/hooks';
import { Chips, Facts, PageTitle, Panel, QueryState, Screen, Section } from '../../../src/components/ui';
import { quantity } from '../../../src/utils/format';
import { palette, radius, space } from '../../../src/theme/theme';

const RESULTS = [
  { value: 'pass', label: 'Pass', color: palette.ok },
  { value: 'rework', label: 'Rework', color: palette.risk },
  { value: 'reject', label: 'Reject', color: palette.danger },
];

export default function Inspect() {
  return <Gate perms="qc.inspect"><Body /></Gate>;
}

/** Inspect one roll: opened from the queue (rollNo) or by scanning its label (qr). Pass / rework / reject, with the defects found. */
function Body() {
  const { rollNo, qr } = useLocalSearchParams();
  const router = useRouter();
  const act = useAction();
  const roll = useGet(`/rolls/${encodeURIComponent(rollNo || '-')}`, {}, { enabled: !!rollNo });
  const defectTypes = useGet('/defect-types', { limit: 100 });
  const r = roll.payload;

  const [result, setResult] = useState('pass');
  const [picked, setPicked] = useState({});       // defect_type_id -> count
  const [remarks, setRemarks] = useState('');

  const types = defectTypes.payload || [];
  const toggle = id => setPicked(p => { const n = { ...p }; if (n[id]) delete n[id]; else n[id] = 1; return n; });
  const bump = (id, by) => setPicked(p => ({ ...p, [id]: Math.max(1, (p[id] || 1) + by) }));

  const submit = () => {
    const defects = Object.entries(picked).map(([defect_type_id, count]) => ({ defect_type_id, count, severity: types.find(t => t.id === defect_type_id)?.severity_default ?? 1 }));
    if (result !== 'pass' && defects.length === 0) { Alert.alert('Add a defect', `A ${result} result needs at least one defect so the cause is on record.`); return; }
    const body = { ...(r ? { roll_id: r.id } : { qr_token: qr }), result, defects, ...(remarks.trim() ? { remarks: remarks.trim() } : {}) };
    act.mutate({ path: '/qc/inspections', body }, {
      onSuccess: () => Alert.alert('Inspection saved', `Result: ${result}`, [{ text: 'OK', onPress: () => router.back() }]),
    });
  };

  const body = (
    <>
      <PageTitle eyebrow="QC STATION" title={r ? r.roll_no : 'Scanned roll'} description={r ? `${r.item}${r.colour ? ` · ${r.colour}` : ''}` : 'Scanned from the roll label'} />
      {r && (
        <Panel>
          <Facts items={[['Order', r.order_no], ['Length', `${quantity(r.length_m)} m`], r.weight_kg && ['Weight', `${quantity(r.weight_kg)} kg`], r.machine_code && ['Woven on', r.machine_code], r.dye_batch && ['Dye batch', r.dye_batch]]} />
        </Panel>
      )}

      <Section title="Result">
        <View style={styles.results}>
          {RESULTS.map(o => {
            const on = result === o.value;
            return (
              <Pressable key={o.value} onPress={() => setResult(o.value)} style={[styles.result, { borderColor: o.color }, on && { backgroundColor: o.color }]}>
                <Text style={[styles.resultText, { color: on ? '#fff' : o.color }]}>{o.label}</Text>
              </Pressable>
            );
          })}
        </View>
      </Section>

      <Section title="Defects found" note={result === 'pass' ? 'Optional for a pass.' : 'Choose at least one.'}>
        <QueryState query={defectTypes}>
          <Chips options={types.map(t => ({ value: t.id, label: t.name }))} onChange={toggle} selected={Object.keys(picked)} />
          {Object.keys(picked).map(id => (
            <Panel key={id} style={styles.defect}>
              <Text style={styles.defectName}>{types.find(t => t.id === id)?.name}</Text>
              <View style={styles.stepper}>
                <Button compact mode="outlined" onPress={() => bump(id, -1)}>−</Button>
                <Text style={styles.count}>{picked[id]}</Text>
                <Button compact mode="outlined" onPress={() => bump(id, 1)}>+</Button>
                <Button compact textColor={palette.danger} onPress={() => toggle(id)}>Remove</Button>
              </View>
            </Panel>
          ))}
        </QueryState>
      </Section>

      <TextInput label="Remarks (optional)" mode="outlined" value={remarks} onChangeText={setRemarks} multiline style={{ backgroundColor: '#fff', marginBottom: space.lg }}
        outlineColor={palette.linen} activeOutlineColor={palette.forest} />
      <Button mode="contained" onPress={submit} loading={act.isPending} disabled={act.isPending} contentStyle={{ height: 50 }}>Save inspection</Button>
    </>
  );

  return <Screen>{rollNo ? <QueryState query={roll}>{r ? body : null}</QueryState> : body}</Screen>;
}

const styles = StyleSheet.create({
  results: { flexDirection: 'row', gap: space.sm },
  result: { flex: 1, paddingVertical: 14, borderRadius: radius.md, borderWidth: 2, alignItems: 'center', backgroundColor: '#fff' },
  resultText: { fontSize: 16, fontWeight: '700' },
  defect: { paddingVertical: space.md },
  defectName: { fontSize: 15, fontWeight: '700', color: palette.ink },
  stepper: { flexDirection: 'row', alignItems: 'center', gap: space.sm, marginTop: space.sm },
  count: { minWidth: 28, textAlign: 'center', fontSize: 17, fontWeight: '700', color: palette.forest },
});
