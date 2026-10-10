import React from 'react';
import { ActivityIndicator, Pressable, RefreshControl, ScrollView, StyleSheet, Text as RNText, View } from 'react-native';
import { Button, Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { palette, radius, serif, space } from '../theme/theme';
import { initials, label } from '../utils/format';

/** status → colour pair, the same groups as the web's <Status> tag */
const TONES = {
  ok: { fg: palette.ok, bg: palette.okBg },
  risk: { fg: palette.risk, bg: palette.riskBg },
  bad: { fg: palette.danger, bg: palette.dangerBg },
  info: { fg: palette.info, bg: palette.infoBg },
  muted: { fg: palette.muted, bg: palette.mutedBg },
};
const TONE_OF = {
  ok: ['passed', 'delivered', 'material_ready', 'running', 'done', 'active', 'approved', 'posted', 'paid', 'present', 'green', 'ready_to_ship', 'dispatched', 'resolved'],
  bad: ['breakdown', 'rejected', 'cancelled', 'red', 'disputed', 'absent', 'delayed', 'overdue', 'failed'],
  risk: ['paused', 'rework', 'pending_qc', 'partial', 'waiting_material', 'amber', 'late', 'half_day', 'pending', 'maintenance', 'packing'],
  muted: ['draft', 'idle', 'planned', 'leave', 'weekly_off', 'holiday', 'open'],
};
export const toneOf = value => Object.keys(TONE_OF).find(t => TONE_OF[t].includes(value)) || 'info';

/** Small rounded status label. */
export function Pill({ value, tone, text }) {
  const t = TONES[tone || toneOf(value)];
  return (
    <View style={[styles.pill, { backgroundColor: t.bg }]}>
      <RNText style={[styles.pillText, { color: t.fg }]} numberOfLines={1}>{text ?? label(value ?? 'unknown')}</RNText>
    </View>
  );
}

/** A scrolling page with pull-to-refresh. */
export function Screen({ children, onRefresh, refreshing = false, padded = true, contentStyle }) {
  return (
    <ScrollView
      style={styles.screen}
      contentContainerStyle={[padded && styles.screenContent, contentStyle]}
      keyboardShouldPersistTaps="handled"
      refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[palette.forest]} tintColor={palette.forest} /> : undefined}
    >
      {children}
    </ScrollView>
  );
}

/** Page title, like the web's PageTitle: small caps eyebrow, serif title, one line of description. */
export function PageTitle({ eyebrow, title, description, right }) {
  return (
    <View style={styles.pageTitle}>
      <View style={{ flex: 1 }}>
        {eyebrow ? <RNText style={styles.eyebrow}>{eyebrow}</RNText> : null}
        <RNText style={styles.title}>{title}</RNText>
        {description ? <RNText style={styles.description}>{description}</RNText> : null}
      </View>
      {right}
    </View>
  );
}

/** White card, the web's .panel. */
export function Panel({ children, style, onPress }) {
  const body = <View style={[styles.panel, style]}>{children}</View>;
  return onPress ? <Pressable onPress={onPress} style={({ pressed }) => pressed && { opacity: 0.7 }}>{body}</Pressable> : body;
}

export function Section({ title, note, action, children }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <View style={{ flex: 1 }}>
          <RNText style={styles.sectionTitle}>{title}</RNText>
          {note ? <RNText style={styles.sectionNote}>{note}</RNText> : null}
        </View>
        {action}
      </View>
      {children}
    </View>
  );
}

/** A headline number. `tone` tints it (bad / risk / ok); `ratio` draws a meter. */
export function Kpi({ label: text, value, tone, sub, ratio, onPress }) {
  const t = tone ? TONES[tone] : null;
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={[styles.kpi, t && { backgroundColor: t.bg, borderColor: t.bg }]}>
      <RNText style={styles.kpiLabel} numberOfLines={1}>{text}</RNText>
      <RNText style={[styles.kpiValue, t && { color: t.fg }]} numberOfLines={1} adjustsFontSizeToFit>{value}</RNText>
      {sub ? <RNText style={styles.kpiSub} numberOfLines={1}>{sub}</RNText> : null}
      {ratio != null && (
        <View style={styles.meter}><View style={[styles.meterFill, { width: `${Math.min(100, Math.max(0, ratio * 100))}%` }]} /></View>
      )}
    </Pressable>
  );
}

export const KpiRow = ({ children }) => <View style={styles.kpiRow}>{children}</View>;

/** One tappable list row: title and subtitle on the left, a status or value on the right. */
export function ListRow({ title, subtitle, meta, right, onPress, icon }) {
  return (
    <Panel onPress={onPress} style={styles.listRow}>
      {icon ? <View style={styles.rowIcon}><MaterialCommunityIcons name={icon} size={20} color={palette.forest} /></View> : null}
      <View style={{ flex: 1 }}>
        <RNText style={styles.rowTitle} numberOfLines={1}>{title}</RNText>
        {subtitle ? <RNText style={styles.rowSub} numberOfLines={2}>{subtitle}</RNText> : null}
        {meta ? <RNText style={styles.rowMeta} numberOfLines={1}>{meta}</RNText> : null}
      </View>
      {right ? <View style={{ alignItems: 'flex-end', marginLeft: space.sm }}>{right}</View> : null}
      {onPress ? <MaterialCommunityIcons name="chevron-right" size={20} color={palette.textMuted} /> : null}
    </Panel>
  );
}

/** label / value pairs inside a panel, the web's <dl> */
export function Facts({ items }) {
  return (
    <View>
      {items.filter(Boolean).map(([k, v], i) => (
        <View key={k} style={[styles.fact, i > 0 && styles.factBorder]}>
          <RNText style={styles.factKey}>{k}</RNText>
          <RNText style={styles.factValue}>{v ?? '–'}</RNText>
        </View>
      ))}
    </View>
  );
}

export function Empty({ icon = 'tray-remove', text }) {
  return (
    <View style={styles.empty}>
      <MaterialCommunityIcons name={icon} size={36} color={palette.sage} />
      <RNText style={styles.emptyText}>{text}</RNText>
    </View>
  );
}

/** Loading / error / content for a useGet result, like the web's <QueryState>. */
export function QueryState({ query, children }) {
  if (query.isPending && query.fetchStatus !== 'idle') {
    return <View style={styles.center}><ActivityIndicator size="large" color={palette.forest} /></View>;
  }
  if (query.isError) {
    return (
      <Panel style={{ alignItems: 'center' }}>
        <MaterialCommunityIcons name="alert-circle-outline" size={32} color={palette.danger} />
        <RNText style={styles.errorTitle}>Unable to load this information</RNText>
        <RNText style={styles.emptyText}>{query.error?.message}</RNText>
        <Button mode="contained" onPress={() => query.refetch()} style={{ marginTop: space.md }}>Retry</Button>
      </Panel>
    );
  }
  return children;
}

/** Shown when the role lacks the permission, like the web's "Access restricted". */
export function Restricted() {
  return (
    <View style={styles.center}>
      <MaterialCommunityIcons name="lock-outline" size={40} color={palette.sage} />
      <RNText style={styles.errorTitle}>Access restricted</RNText>
      <RNText style={[styles.emptyText, { maxWidth: 280 }]}>Your role does not include this. Ask the mill owner to update your role in Roles & permissions.</RNText>
    </View>
  );
}

export function Avatar({ name, size = 44 }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: palette.forest, alignItems: 'center', justifyContent: 'center' }}>
      <RNText style={{ color: palette.goldBright, fontWeight: '700', fontSize: size * 0.38 }}>{initials(name)}</RNText>
    </View>
  );
}

/** Horizontal selector (status filters, tabs). */
export function Chips({ options, value, onChange, selected }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm, paddingBottom: space.md }}>
      {options.map(o => {
        const active = selected ? selected.includes(o.value) : o.value === value;
        return (
          <Pressable key={String(o.value)} onPress={() => onChange(o.value)} style={[styles.chip, active && styles.chipActive]}>
            <RNText style={[styles.chipText, active && { color: '#fff' }]}>{o.label}</RNText>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/** Thin progress bar with a caption. */
export function Progress({ pct, caption }) {
  const p = Math.min(100, Math.max(0, Number(pct) || 0));
  return (
    <View style={{ marginTop: space.sm }}>
      <View style={styles.meter}><View style={[styles.meterFill, { width: `${p}%` }]} /></View>
      {caption ? <RNText style={styles.rowMeta}>{caption}</RNText> : null}
    </View>
  );
}

export function LoadingScreen() {
  return <View style={styles.center}><ActivityIndicator size="large" color={palette.forest} /></View>;
}

export { Text };

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.bg },
  screenContent: { padding: space.lg, paddingBottom: 40 },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xl, gap: space.sm },
  pill: { paddingHorizontal: 10, paddingVertical: 3, borderRadius: radius.pill, alignSelf: 'flex-start' },
  pillText: { fontSize: 12, fontWeight: '700' },
  pageTitle: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: space.lg },
  eyebrow: { fontSize: 11, letterSpacing: 1.2, fontWeight: '700', color: palette.gold, marginBottom: 2 },
  title: { fontSize: 26, fontFamily: serif, fontWeight: '700', color: palette.forest, letterSpacing: -0.3 },
  description: { fontSize: 14, color: palette.textSecondary, marginTop: 2, lineHeight: 20 },
  panel: { backgroundColor: palette.surface, borderRadius: radius.md, borderWidth: 1, borderColor: palette.linen, padding: space.lg, marginBottom: space.md },
  section: { marginBottom: space.lg },
  sectionHead: { flexDirection: 'row', alignItems: 'center', marginBottom: space.md },
  sectionTitle: { fontSize: 17, fontWeight: '700', color: palette.forest },
  sectionNote: { fontSize: 13, color: palette.textSecondary, marginTop: 1 },
  kpiRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  kpi: { flexGrow: 1, flexBasis: '45%', backgroundColor: palette.surface, borderRadius: radius.md, borderWidth: 1, borderColor: palette.linen, padding: space.md + 2 },
  kpiLabel: { fontSize: 12, color: palette.textSecondary, fontWeight: '600' },
  kpiValue: { fontSize: 24, fontWeight: '700', color: palette.forest, marginTop: 4 },
  kpiSub: { fontSize: 12, color: palette.textMuted, marginTop: 2 },
  meter: { height: 6, borderRadius: 3, backgroundColor: palette.cream, marginTop: space.sm, overflow: 'hidden' },
  meterFill: { height: 6, borderRadius: 3, backgroundColor: palette.gold },
  listRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: space.md },
  rowIcon: { width: 38, height: 38, borderRadius: radius.sm, backgroundColor: palette.cream, alignItems: 'center', justifyContent: 'center', marginRight: space.md },
  rowTitle: { fontSize: 16, fontWeight: '700', color: palette.ink },
  rowSub: { fontSize: 13, color: palette.textSecondary, marginTop: 2 },
  rowMeta: { fontSize: 12, color: palette.textMuted, marginTop: 3 },
  fact: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 9, gap: space.md },
  factBorder: { borderTopWidth: 1, borderTopColor: palette.cream },
  factKey: { fontSize: 13, color: palette.textSecondary },
  factValue: { fontSize: 14, fontWeight: '600', color: palette.ink, flexShrink: 1, textAlign: 'right' },
  empty: { alignItems: 'center', padding: space.xl, gap: space.sm },
  emptyText: { fontSize: 14, color: palette.textSecondary, textAlign: 'center' },
  errorTitle: { fontSize: 16, fontWeight: '700', color: palette.ink, marginTop: space.sm },
  chip: { paddingHorizontal: 14, paddingVertical: 8, borderRadius: radius.pill, backgroundColor: palette.surface, borderWidth: 1, borderColor: palette.linen },
  chipActive: { backgroundColor: palette.forest, borderColor: palette.forest },
  chipText: { fontSize: 13, fontWeight: '600', color: palette.forest },
});
