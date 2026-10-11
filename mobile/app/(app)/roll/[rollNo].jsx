import React from 'react';
import { StyleSheet, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useLocalSearchParams } from 'expo-router';
import Gate from '../../../src/components/Gate';
import { useGet } from '../../../src/lib/hooks';
import { AppText, Banner, Empty, Facts, PageTitle, Panel, QueryState, Screen, Section, StatusBadge, toneStyle } from '../../../src/components/ui';
import { dateTime, label, quantity } from '../../../src/utils/format';
import { palette, radius, space } from '../../../src/theme/theme';

// QC verdict by roll status: the words and the icon carry the meaning, the colour only supports it
const VERDICT = {
  passed: { icon: 'check-decagram', tone: 'ok', text: 'Passed quality control' },
  packed: { icon: 'package-variant-closed', tone: 'ok', text: 'Passed quality control and packed for dispatch' },
  dispatched: { icon: 'truck-check-outline', tone: 'ok', text: 'Passed quality control and dispatched' },
  delivered: { icon: 'truck-check-outline', tone: 'ok', text: 'Delivered to the buyer' },
  rework: { icon: 'autorenew', tone: 'risk', text: 'Sent for rework' },
  rejected: { icon: 'close-octagon-outline', tone: 'bad', text: 'Rejected at quality control' },
  pending_qc: { icon: 'clock-outline', tone: 'muted', text: 'Waiting for quality control' },
};
const EVENT_ICON = { woven: 'factory', dyed: 'palette-outline', inspected: 'magnify', packed: 'package-variant-closed', dispatched: 'truck-delivery-outline', delivered: 'check-circle-outline' };

export default function RollJourney() {
  return <Gate perms="qc.view"><Body /></Gate>;
}

/** `rollNo` is whatever was scanned or typed: a roll number or the roll's QR token. The server resolves both. */
function Body() {
  const { rollNo } = useLocalSearchParams();
  const q = useGet(`/rolls/${encodeURIComponent(rollNo)}/trace`);
  const t = q.payload;
  const notFound = q.isError && q.error?.status === 404;
  return (
    <Screen onRefresh={q.refetch} refreshing={q.isRefetching}>
      {notFound ? (
        <Banner tone="bad" title="No roll found" text={`Nothing matches "${rollNo}". Check the label, or type the roll number instead of scanning.`} />
      ) : (
        <QueryState query={q}>{t && <Journey t={t} />}</QueryState>
      )}
    </Screen>
  );
}

function Journey({ t }) {
  const { roll } = t;
  const v = VERDICT[roll.status] || VERDICT.pending_qc;
  const tone = toneStyle(v.tone);
  const last = t.inspections[t.inspections.length - 1];
  const warnings = [['Machine', t.peers?.machine, t.peers?.machine?.code], ['Dye batch', t.peers?.dye_batch, t.peers?.dye_batch?.batch]].filter(([, s]) => s?.rejected > 0);

  return (
    <>
      <PageTitle eyebrow="ROLL JOURNEY" title={roll.roll_no} description={`${roll.item}${roll.colour ? ` · ${roll.colour}` : ''}`} />

      <View style={[styles.verdict, { backgroundColor: tone.bg }]} accessible accessibilityLabel={`Quality result: ${v.text}`}>
        <MaterialCommunityIcons name={v.icon} size={32} color={tone.fg} />
        <View style={{ flex: 1 }}>
          <AppText variant="h3" style={{ color: tone.fg }}>{v.text}</AppText>
          {last ? <AppText variant="small" style={{ color: palette.ink }}>{dateTime(last.inspected_at)}{last.inspector ? ` · ${last.inspector}` : ''}</AppText> : <AppText variant="small" style={{ color: palette.ink }}>No inspection recorded yet.</AppText>}
        </View>
      </View>

      <Section title="This roll">
        <Panel>
          <Facts items={[
            ['Order', roll.order_no],
            roll.wo_no && ['Work order', roll.wo_no],
            ['Made on', roll.machine_code || 'Not recorded'],
            ['Length', `${quantity(roll.length_m)} m`],
            ['Weight', roll.weight_kg ? `${quantity(roll.weight_kg)} kg` : 'Not recorded'],
            ['Dye batch', roll.dye_batch || 'Not recorded'],
          ]} />
        </Panel>
        {warnings.map(([kind, s, name]) => (
          <Banner key={kind} tone="risk" title="Worth knowing" text={`${kind} ${name}: ${s.rejected} of ${s.total} rolls were rejected in the last 30 days.`} />
        ))}
      </Section>

      <Section title="Journey" note="Oldest first. Only what was recorded appears here.">
        {t.timeline.length === 0 ? <Panel><Empty icon="timeline-clock-outline" text="No history was recorded for this roll." /></Panel> : (
          <Panel>
            {t.timeline.map((e, i) => {
              const where = [e.stage, e.machine, e.shift && `shift ${e.shift}`, e.worker].filter(Boolean).join(' · ');
              const isLast = i === t.timeline.length - 1;
              return (
                <View key={`${e.event}-${e.at}-${i}`} style={styles.step}>
                  <View style={styles.rail}>
                    <View style={styles.dot}><MaterialCommunityIcons name={EVENT_ICON[e.event] || 'circle-small'} size={16} color="#fff" /></View>
                    {!isLast && <View style={styles.line} />}
                  </View>
                  <View style={[styles.stepBody, isLast && { paddingBottom: 0 }]}>
                    <AppText variant="h3">{label(e.event)}</AppText>
                    {where ? <AppText variant="small">{where}</AppText> : null}
                    <AppText variant="caption">{dateTime(e.at)}</AppText>
                  </View>
                </View>
              );
            })}
          </Panel>
        )}
      </Section>

      <Section title="Raw material" note="The yarn and dye lots that went into this roll.">
        {t.raw_material_lots.length === 0 ? <Panel><Empty icon="texture" text="No material lots were recorded for this roll." hint="So its yarn supplier cannot be traced." /></Panel> : (
          <Panel><Facts items={t.raw_material_lots.map((l) => [`${l.item} · lot ${l.lot_no}`, l.supplier || 'Supplier not recorded'])} /></Panel>
        )}
      </Section>

      <Section title="Quality checks" note="Every inspection this roll has had.">
        {t.inspections.length === 0 ? <Panel><Empty icon="magnify-close" text="Not inspected yet." /></Panel> : t.inspections.map((i) => (
          <Panel key={i.id}>
            <View style={styles.inspHead}>
              <StatusBadge value={{ pass: 'passed', rework: 'rework', reject: 'rejected' }[i.result] || i.result} />
              {i.is_override ? <StatusBadge tone="info" text="Changed by QC head" icon="account-edit-outline" /> : null}
            </View>
            <AppText variant="caption" style={{ marginTop: space.sm }}>{dateTime(i.inspected_at)}{i.inspector ? ` · ${i.inspector}` : ''}</AppText>
            {i.defects?.length > 0
              ? i.defects.map((d) => <AppText key={d.defect} variant="body" style={{ marginTop: 2 }}>• {d.defect} × {d.count}{d.severity > 1 ? ` (severity ${d.severity})` : ''}</AppText>)
              : <AppText variant="small" style={{ marginTop: space.sm }}>No defects recorded.</AppText>}
            {(i.remarks || i.override_reason) ? <AppText variant="small" style={{ fontStyle: 'italic', marginTop: space.sm }}>“{i.remarks || i.override_reason}”</AppText> : null}
          </Panel>
        ))}
      </Section>

      <Section title="Dispatch">
        {t.dispatch ? (
          <Panel><Facts items={[['Dispatch', t.dispatch.dispatch_no], ['To', t.dispatch.to_party || 'Not recorded'], ['Vehicle', t.dispatch.vehicle_no || 'Not recorded'], ['Status', label(t.dispatch.status)], t.dispatch.delivered_at ? ['Delivered', dateTime(t.dispatch.delivered_at)] : null]} /></Panel>
        ) : <Panel><Empty icon="truck-outline" text="Not dispatched yet." /></Panel>}
      </Section>
    </>
  );
}

const styles = StyleSheet.create({
  verdict: { flexDirection: 'row', alignItems: 'center', gap: space.md, padding: space.lg, borderRadius: radius.lg, marginBottom: space.xl },
  step: { flexDirection: 'row' },
  rail: { alignItems: 'center', width: 28, marginRight: space.md },
  dot: { width: 28, height: 28, borderRadius: 14, backgroundColor: palette.forest, alignItems: 'center', justifyContent: 'center' },
  line: { flex: 1, width: 2, backgroundColor: palette.linen, marginVertical: 2 },
  stepBody: { flex: 1, paddingBottom: space.lg },
  inspHead: { flexDirection: 'row', alignItems: 'center', gap: space.sm, flexWrap: 'wrap' },
});
