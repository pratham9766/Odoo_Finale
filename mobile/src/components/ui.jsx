import React, { useEffect, useRef } from 'react';
import { Animated, KeyboardAvoidingView, Platform, Pressable, RefreshControl, ScrollView, StyleSheet, View, useWindowDimensions } from 'react-native';
import { Text } from 'react-native-paper';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { CONTENT_MAX, SCREEN_PAD, TABLET_MIN_WIDTH, TOUCH, palette, radius, space, type } from '../theme/theme';
import { describeError } from '../services/api/errors';
import { initials, label } from '../utils/format';
import { ActionButton, AppText } from './forms';
import { Banner, Freshness, toneStyle } from './feedback';

export { ActionButton, AppText, ConfirmDialog, Field, SearchBar } from './forms';
export { Banner, ConnectivityBanner, Freshness, ToastProvider, toneStyle, useToast } from './feedback';

/** status → tone: the same groups as the web's <Status> tag. */
const TONE_OF = {
  ok: ['passed', 'delivered', 'material_ready', 'running', 'done', 'active', 'approved', 'posted', 'paid', 'present', 'green', 'ready_to_ship', 'dispatched', 'resolved', 'confirmed'],
  bad: ['breakdown', 'rejected', 'cancelled', 'red', 'disputed', 'absent', 'delayed', 'overdue', 'failed'],
  risk: ['paused', 'rework', 'pending_qc', 'partial', 'waiting_material', 'amber', 'late', 'half_day', 'pending', 'maintenance', 'packing', 'in_transit'],
  muted: ['draft', 'idle', 'planned', 'leave', 'weekly_off', 'holiday', 'open'],
};
export const toneOf = (value) => Object.keys(TONE_OF).find((t) => TONE_OF[t].includes(value)) || 'info';

/** Layout facts for the current window: tablets get capped, centred content and two columns for cards. */
export function useLayout() {
  const { width } = useWindowDimensions();
  const tablet = width >= TABLET_MIN_WIDTH;
  return { width, tablet, columns: tablet ? 2 : 1, contentWidth: Math.min(width, CONTENT_MAX) };
}

/**
 * Status label: a coloured chip with an ICON and the status in words, so it never relies on colour alone, and with enough
 * padding to read at a large font size. `text` overrides the wording.
 */
export function StatusBadge({ value, tone, text, icon }) {
  const t = toneStyle(tone || toneOf(value));
  const words = text ?? label(value ?? 'unknown');
  return (
    <View style={[styles.badge, { backgroundColor: t.bg }]} accessible accessibilityLabel={`Status: ${words}`}>
      <MaterialCommunityIcons name={icon || t.icon} size={14} color={t.fg} />
      <AppText variant="caption" style={{ color: t.fg, fontWeight: '700' }} numberOfLines={2}>{words}</AppText>
    </View>
  );
}
export const Pill = StatusBadge;

/**
 * A scrolling page: pull to refresh, keyboard-safe, safe-area padded, and on a tablet centred with a maximum width.
 * `footer` stays pinned under the scrolling content (a sticky primary action).
 */
export function Screen({ children, onRefresh, refreshing = false, padded = true, contentStyle, footer }) {
  const insets = useSafeAreaInsets();
  const { tablet } = useLayout();
  return (
    <KeyboardAvoidingView style={styles.screen} behavior={Platform.OS === 'ios' ? 'padding' : undefined}>
      <ScrollView
        style={styles.screen}
        contentContainerStyle={[padded && { padding: SCREEN_PAD, paddingBottom: (footer ? space.lg : 40) + insets.bottom }, tablet && { width: '100%', maxWidth: CONTENT_MAX, alignSelf: 'center' }, contentStyle]}
        keyboardShouldPersistTaps="handled"
        keyboardDismissMode="on-drag"
        refreshControl={onRefresh ? <RefreshControl refreshing={refreshing} onRefresh={onRefresh} colors={[palette.forest]} tintColor={palette.forest} /> : undefined}
      >
        {children}
      </ScrollView>
      {footer ? <View style={[styles.footer, { paddingBottom: space.md + insets.bottom }]}><View style={tablet && { width: '100%', maxWidth: CONTENT_MAX, alignSelf: 'center' }}>{footer}</View></View> : null}
    </KeyboardAvoidingView>
  );
}

/** Page title: small-caps eyebrow, serif title, one line of description. The title is a header for screen readers. */
export function PageTitle({ eyebrow, title, description, right }) {
  return (
    <View style={styles.pageTitle}>
      <View style={{ flex: 1 }}>
        {eyebrow ? <AppText variant="eyebrow" style={{ marginBottom: 2 }}>{eyebrow}</AppText> : null}
        <AppText variant="h1" accessibilityRole="header">{title}</AppText>
        {description ? <AppText variant="small" style={{ marginTop: 4 }}>{description}</AppText> : null}
      </View>
      {right}
    </View>
  );
}

/** White card. With onPress the whole card is one button (and says so to a screen reader). */
export function Panel({ children, style, onPress, accessibilityLabel }) {
  const body = <View style={[styles.panel, style]}>{children}</View>;
  return onPress
    ? <Pressable onPress={onPress} accessibilityRole="button" accessibilityLabel={accessibilityLabel} style={({ pressed }) => pressed && styles.pressed}>{body}</Pressable>
    : body;
}

export function Section({ title, note, action, children }) {
  return (
    <View style={styles.section}>
      <View style={styles.sectionHead}>
        <View style={{ flex: 1 }}>
          <AppText variant="h2" accessibilityRole="header">{title}</AppText>
          {note ? <AppText variant="small" style={{ marginTop: 2 }}>{note}</AppText> : null}
        </View>
        {action}
      </View>
      {children}
    </View>
  );
}

/** A headline number with its label and unit. `tone` tints it; `ratio` draws a meter; with onPress it is a button. */
export function Kpi({ label: text, value, tone, sub, ratio, onPress }) {
  const t = tone ? toneStyle(tone) : null;
  return (
    <Pressable
      onPress={onPress} disabled={!onPress}
      accessibilityRole={onPress ? 'button' : 'text'}
      accessibilityLabel={`${text}: ${value}${sub ? `, ${sub}` : ''}`}
      style={({ pressed }) => [styles.kpi, t && { backgroundColor: t.bg, borderColor: t.bg }, pressed && styles.pressed]}
    >
      <AppText variant="small" style={{ fontWeight: '600' }} numberOfLines={2}>{text}</AppText>
      <AppText style={[styles.kpiValue, t && { color: t.fg }]} numberOfLines={1} adjustsFontSizeToFit>{value}</AppText>
      {sub ? <AppText variant="caption" numberOfLines={2}>{sub}</AppText> : null}
      {ratio != null && <View style={styles.meter}><View style={[styles.meterFill, { width: `${Math.min(100, Math.max(0, ratio * 100))}%` }]} /></View>}
    </Pressable>
  );
}

export const KpiRow = ({ children }) => <View style={styles.kpiRow}>{children}</View>;

/** One tappable list row: title and subtitle on the left, a status or value on the right. At least 64 dp tall. */
export function ListRow({ title, subtitle, meta, right, onPress, icon, accessibilityLabel }) {
  return (
    <Panel onPress={onPress} accessibilityLabel={accessibilityLabel ?? [title, subtitle, meta].filter(Boolean).join('. ')} style={styles.listRow}>
      {icon ? <View style={styles.rowIcon}><MaterialCommunityIcons name={icon} size={22} color={palette.forest} /></View> : null}
      <View style={{ flex: 1 }}>
        <AppText variant="h3" numberOfLines={2}>{title}</AppText>
        {subtitle ? <AppText variant="small" numberOfLines={3} style={{ marginTop: 2 }}>{subtitle}</AppText> : null}
        {meta ? <AppText variant="caption" numberOfLines={2} style={{ marginTop: 3 }}>{meta}</AppText> : null}
      </View>
      {right ? <View style={{ alignItems: 'flex-end', marginLeft: space.sm, maxWidth: '40%' }}>{right}</View> : null}
      {onPress ? <MaterialCommunityIcons name="chevron-right" size={22} color={palette.textMuted} /> : null}
    </Panel>
  );
}

/** label / value pairs inside a panel. Values may wrap onto several lines. */
export function Facts({ items }) {
  return (
    <View>
      {items.filter(Boolean).map(([k, v], i) => (
        <View key={k} style={[styles.fact, i > 0 && styles.factBorder]}>
          <AppText variant="small" style={{ flexShrink: 0, maxWidth: '45%' }}>{k}</AppText>
          <AppText variant="bodyStrong" style={{ flex: 1, textAlign: 'right', fontSize: 15 }}>{v ?? '–'}</AppText>
        </View>
      ))}
    </View>
  );
}

/** Nothing to show. Say WHY and, where there is one, what to do next. */
export function Empty({ icon = 'tray-remove', text, hint, action }) {
  return (
    <View style={styles.empty} accessible accessibilityLabel={[text, hint].filter(Boolean).join('. ')}>
      <MaterialCommunityIcons name={icon} size={40} color={palette.sage} />
      <AppText variant="body" style={{ textAlign: 'center' }}>{text}</AppText>
      {hint ? <AppText variant="small" style={{ textAlign: 'center' }}>{hint}</AppText> : null}
      {action ? <ActionButton kind="secondary" label={action.label} icon={action.icon} onPress={action.onPress} style={{ marginTop: space.sm }} /> : null}
    </View>
  );
}

/** A request failed: what happened in plain words, whether it can be retried, and a Retry button. Never shown as "0" or an empty list. */
export function ErrorState({ error, onRetry, retrying }) {
  const info = describeError(error);
  const icon = { offline: 'wifi-off', timeout: 'timer-sand', session: 'lock-clock', forbidden: 'lock-outline', config: 'cog-off-outline' }[info.kind] || 'alert-circle-outline';
  return (
    <View style={styles.errorBox} accessibilityRole="alert">
      <MaterialCommunityIcons name={icon} size={40} color={palette.danger} />
      <AppText variant="h3" style={{ textAlign: 'center' }}>{info.title}</AppText>
      <AppText variant="small" style={{ textAlign: 'center' }}>{info.message}</AppText>
      {info.retryable && onRetry ? <ActionButton label="Try again" icon="refresh" kind="secondary" onPress={onRetry} loading={retrying} style={{ marginTop: space.sm }} /> : null}
    </View>
  );
}

/**
 * Loading / error / content for a useGet result.
 *   first load        → placeholder blocks (so the page does not jump)
 *   failed, no data   → an error with Retry (never an empty page or zeros)
 *   failed, has data  → the last data stays visible under a banner that says it is old and offers a refresh
 */
export function QueryState({ query, children }) {
  if (query.isPending && query.fetchStatus !== 'idle') return <Skeleton />;
  if (query.isError && query.data === undefined) return <ErrorState error={query.error} onRetry={() => query.refetch()} retrying={query.isRefetching} />;
  if (query.isError) {
    const when = query.updatedAt ? new Date(query.updatedAt).toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' }) : null;
    return (
      <>
        <Banner tone="risk" title="Could not refresh" text={`${describeError(query.error).message}${when ? ` Showing the data from ${when}.` : ''}`} action={{ label: 'Try again', icon: 'refresh', onPress: () => query.refetch(), loading: query.isRefetching }} />
        {children}
      </>
    );
  }
  return <>{query.updatedAt ? <Freshness updatedAt={query.updatedAt} refreshing={query.isRefetching} onRefresh={() => query.refetch()} /> : null}{children}</>;
}

/** Shown when the role lacks the permission, like the web's "Access restricted". */
export function Restricted() {
  return (
    <View style={styles.center} accessibilityRole="alert">
      <MaterialCommunityIcons name="lock-outline" size={44} color={palette.sage} />
      <AppText variant="h3">Access restricted</AppText>
      <AppText variant="small" style={{ textAlign: 'center', maxWidth: 300 }}>Your role does not include this. Ask the mill owner to update your role in Roles & permissions.</AppText>
    </View>
  );
}

export function Avatar({ name, size = 44 }) {
  return (
    <View style={{ width: size, height: size, borderRadius: size / 2, backgroundColor: palette.forest, alignItems: 'center', justifyContent: 'center' }} accessibilityElementsHidden importantForAccessibility="no">
      <AppText style={{ color: palette.goldBright, fontWeight: '700', fontSize: size * 0.38 }}>{initials(name)}</AppText>
    </View>
  );
}

/** Horizontal selector (status filters, tabs). Each chip is 44 dp tall; the selected one says so to a screen reader. */
export function Chips({ options, value, onChange, selected }) {
  return (
    <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: space.sm, paddingBottom: space.md }} accessibilityRole="tablist">
      {options.map((o) => {
        const active = selected ? selected.includes(o.value) : o.value === value;
        return (
          <Pressable key={String(o.value)} onPress={() => onChange(o.value)} accessibilityRole="tab" accessibilityState={{ selected: !!active }} accessibilityLabel={o.label}
            style={[styles.chip, active && styles.chipActive]}>
            {active ? <MaterialCommunityIcons name="check" size={16} color="#fff" /> : null}
            <AppText variant="label" style={{ color: active ? '#fff' : palette.forest }} numberOfLines={1}>{o.label}</AppText>
          </Pressable>
        );
      })}
    </ScrollView>
  );
}

/** Thin progress bar with a caption. The number is always in words too. */
export function Progress({ pct, caption }) {
  const p = Math.min(100, Math.max(0, Number(pct) || 0));
  return (
    <View style={{ marginTop: space.sm }} accessible accessibilityLabel={`${Math.round(p)} percent${caption ? `, ${caption}` : ''}`} accessibilityRole="progressbar">
      <View style={styles.meter}><View style={[styles.meterFill, { width: `${p}%` }]} /></View>
      {caption ? <AppText variant="caption" style={{ marginTop: 3 }}>{caption}</AppText> : null}
    </View>
  );
}

/** Pulsing placeholder blocks shown while a screen loads, so the layout does not jump. */
export function Skeleton({ rows = 4 }) {
  const pulse = useRef(new Animated.Value(0.45)).current;
  useEffect(() => {
    const loop = Animated.loop(Animated.sequence([
      Animated.timing(pulse, { toValue: 1, duration: 800, useNativeDriver: true }),
      Animated.timing(pulse, { toValue: 0.45, duration: 800, useNativeDriver: true }),
    ]));
    loop.start();
    return () => loop.stop();
  }, [pulse]);
  return (
    <Animated.View style={{ opacity: pulse }} accessible accessibilityLabel="Loading" accessibilityRole="progressbar">
      <View style={styles.kpiRow}>
        <View style={[styles.skel, { flexBasis: '45%', flexGrow: 1, height: 84 }]} />
        <View style={[styles.skel, { flexBasis: '45%', flexGrow: 1, height: 84 }]} />
      </View>
      {Array.from({ length: rows }, (_, i) => <View key={i} style={[styles.skel, { height: 64, marginTop: space.md }]} />)}
    </Animated.View>
  );
}

export function LoadingScreen() {
  return <View style={styles.center}><Skeleton rows={2} /></View>;
}

export { Text };

const styles = StyleSheet.create({
  screen: { flex: 1, backgroundColor: palette.bg },
  footer: { backgroundColor: palette.surface, borderTopWidth: 1, borderTopColor: palette.linen, paddingHorizontal: SCREEN_PAD, paddingTop: space.md },
  center: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: space.xl, gap: space.sm },
  pressed: { opacity: 0.75, transform: [{ scale: 0.985 }] },
  skel: { backgroundColor: palette.linen, borderRadius: radius.md },
  badge: { flexDirection: 'row', alignItems: 'center', gap: 4, paddingHorizontal: 10, paddingVertical: 4, borderRadius: radius.pill, alignSelf: 'flex-start', maxWidth: '100%' },
  pageTitle: { flexDirection: 'row', alignItems: 'flex-start', marginBottom: space.xl, gap: space.md },
  panel: { backgroundColor: palette.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: palette.linen, padding: space.lg, marginBottom: space.md, shadowColor: palette.forest, shadowOpacity: 0.06, shadowRadius: 8, shadowOffset: { width: 0, height: 2 }, elevation: 1 },
  section: { marginBottom: space.xl },
  sectionHead: { flexDirection: 'row', alignItems: 'center', marginBottom: space.md },
  kpiRow: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  kpi: { flexGrow: 1, flexBasis: '45%', minHeight: 88, backgroundColor: palette.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: palette.linen, padding: space.md + 2 },
  kpiValue: { ...type.h1, fontFamily: undefined, fontSize: 26, marginTop: 4 },
  meter: { height: 8, borderRadius: 4, backgroundColor: palette.cream, marginTop: space.sm, overflow: 'hidden' },
  meterFill: { height: 8, borderRadius: 4, backgroundColor: palette.forestSoft },
  listRow: { flexDirection: 'row', alignItems: 'center', paddingVertical: space.md, minHeight: 64, gap: 0 },
  rowIcon: { width: 40, height: 40, borderRadius: radius.sm, backgroundColor: palette.cream, alignItems: 'center', justifyContent: 'center', marginRight: space.md },
  fact: { flexDirection: 'row', justifyContent: 'space-between', paddingVertical: 10, gap: space.md },
  factBorder: { borderTopWidth: 1, borderTopColor: palette.cream },
  empty: { alignItems: 'center', padding: space.xl, gap: space.sm },
  errorBox: { alignItems: 'center', padding: space.xl, gap: space.sm, backgroundColor: palette.surface, borderRadius: radius.lg, borderWidth: 1, borderColor: palette.linen },
  chip: { minHeight: 44, paddingHorizontal: 16, flexDirection: 'row', alignItems: 'center', gap: 6, borderRadius: radius.pill, backgroundColor: palette.surface, borderWidth: 1.5, borderColor: palette.linen },
  chipActive: { backgroundColor: palette.forest, borderColor: palette.forest },
});

export { TOUCH };
