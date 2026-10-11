import React from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { LinearGradient } from 'expo-linear-gradient';
import { useRouter } from 'expo-router';
import { useSession } from '../../../src/context/Session';
import { useGet } from '../../../src/lib/hooks';
import { AppText, Banner, Kpi, KpiRow, ListRow, QueryState, Screen, Section, StatusBadge, useLayout } from '../../../src/components/ui';
import { date, money, quantity } from '../../../src/utils/format';
import { palette, radius, serif, space, TOUCH } from '../../../src/theme/theme';

const go = (router, route, id) => router.navigate(id ? `/(app)/${route}/${id}` : `/(app)/(drawer)/${route}`);
const ratio = (a, b) => (Number(b) > 0 ? Number(a) / Number(b) : 0);
const greeting = () => { const h = new Date().getHours(); return h < 12 ? 'Good morning' : h < 17 ? 'Good afternoon' : 'Good evening'; };
const plural = (n, one, many = `${one}s`) => `${n} ${n === 1 ? one : many}`;

// Shortcuts to the jobs a person's role allows, in the order a shift goes. Only those the role includes are shown.
const TASKS = [
  { perm: 'production.log', icon: 'factory', label: 'Log output', hint: 'My machines', route: 'machine-board' },
  { perm: 'qc.inspect', icon: 'check-decagram-outline', label: 'Inspect rolls', hint: 'QC queue', route: 'qc-queue' },
  { perm: 'dispatch.create', icon: 'truck-delivery-outline', label: 'Pack & dispatch', hint: 'Scan rolls onto a truck', route: 'dispatch' },
  { perm: 'qc.view', icon: 'qrcode-scan', label: 'Trace a roll', hint: 'Scan its label', route: 'trace' },
  { perm: 'receipt.create', icon: 'receipt-text-outline', label: 'Receive material', hint: 'Goods receipts', route: 'receipts' },
  { perm: 'attendance.mark', icon: 'calendar-check-outline', label: 'Attendance', hint: 'Mark and correct', route: 'attendance' },
];

export default function Dashboard() {
  const router = useRouter();
  const session = useSession();
  const { can } = session;
  const { tablet } = useLayout();
  const q = useGet('/reports/dashboard', {}, { refetchInterval: 60000 });
  const qc = useGet('/qc/summary', {}, { enabled: can('qc.view'), refetchInterval: 60000 });
  const unresolved = useGet('/attendance/unresolved', {}, { enabled: can('attendance.view'), refetchInterval: 120000 });
  const d = q.payload;
  const a = d?.alerts || {};
  const name = String(session.context.user?.full_name || session.context.role.name).split(' ')[0];

  // Exceptions: things that are wrong or waiting right now, each with the place to deal with it
  const waitingQc = qc.payload?.queue?.pending_qc ?? 0;
  const needsFix = unresolved.payload?.length ?? 0;
  const items = [
    a.machines_down?.length > 0 && { tone: 'bad', icon: 'alert-octagon', text: `Machines down: ${a.machines_down.join(', ')}`, route: can('production.view') && 'machine-board' },
    waitingQc > 0 && can('qc.view') && { tone: 'risk', icon: 'check-decagram-outline', text: `${plural(waitingQc, 'roll')} waiting for quality control`, route: 'qc-queue' },
    needsFix > 0 && can('attendance.view') && { tone: 'risk', icon: 'account-clock-outline', text: `${plural(needsFix, 'attendance record')} need a check-out correction. Payroll waits for them.`, route: 'attendance' },
    a.low_stock > 0 && { tone: 'risk', icon: 'package-down', text: `${plural(a.low_stock, 'material')} below reorder level`, route: can('stock.view') && 'stock' },
    a.overdue?.invoices > 0 && { tone: 'bad', icon: 'cash-clock', text: `${plural(a.overdue.invoices, 'overdue invoice')}: ${money(a.overdue.amount)} to collect`, route: null },
    a.unmoved_rolls > 0 && { tone: 'info', icon: 'paper-roll-outline', text: `${plural(a.unmoved_rolls, 'finished roll')} not moved for a week`, route: can('stock.view') && 'stock' },
  ].filter(Boolean);
  const tasks = TASKS.filter((t) => can(t.perm));
  const loaded = !!d;
  const partial = [qc, unresolved].some((x) => x.isError);

  return (
    <Screen onRefresh={() => { q.refetch(); qc.refetch(); unresolved.refetch(); }} refreshing={q.isRefetching}>
      <LinearGradient colors={[palette.forest, palette.forestSoft]} start={{ x: 0, y: 0 }} end={{ x: 1, y: 1 }} style={styles.hero}>
        <AppText variant="eyebrow" style={{ color: palette.goldBright }}>{session.context.mill?.name?.toUpperCase() || 'MILL OPERATIONS'}</AppText>
        <AppText style={styles.heroTitle} accessibilityRole="header">{greeting()}, {name}</AppText>
        <AppText variant="small" style={{ color: 'rgba(255,255,255,0.85)', marginTop: 4 }}>
          {!loaded ? (q.isError ? 'Could not load the latest numbers.' : 'Loading the latest numbers…') : items.length ? `${plural(items.length, 'thing')} need${items.length === 1 ? 's' : ''} attention.` : 'Nothing needs attention right now.'}
        </AppText>
      </LinearGradient>

      <QueryState query={q}>
        {d && (
          <>
            {partial ? <Banner tone="risk" title="Some counts are missing" text="The QC or attendance numbers could not be loaded, so the list below may be incomplete. Pull down to try again." /> : null}

            {items.length > 0 && (
              <Section title="Needs attention" note="Tap one to deal with it.">
                {items.map((x) => (
                  <Pressable key={x.text} disabled={!x.route} onPress={() => go(router, x.route)} accessibilityRole={x.route ? 'button' : 'text'} accessibilityLabel={x.text}
                    style={({ pressed }) => [styles.item, { backgroundColor: x.tone === 'bad' ? palette.dangerBg : x.tone === 'risk' ? palette.riskBg : palette.infoBg }, pressed && { opacity: 0.8 }]}>
                    <MaterialCommunityIcons name={x.icon} size={24} color={x.tone === 'bad' ? palette.danger : x.tone === 'risk' ? palette.risk : palette.info} />
                    <AppText variant="bodyStrong" style={{ flex: 1, fontSize: 15 }}>{x.text}</AppText>
                    {x.route ? <MaterialCommunityIcons name="chevron-right" size={22} color={palette.ink} /> : null}
                  </Pressable>
                ))}
              </Section>
            )}
            {items.length === 0 && !partial && <Banner tone="ok" title="All clear" text="No machine is down, no roll is waiting for QC, and no alert is open." />}

            {tasks.length > 0 && (
              <Section title="Your jobs">
                <View style={styles.tiles}>
                  {tasks.map((t) => (
                    <Pressable key={t.route + t.label} onPress={() => go(router, t.route)} accessibilityRole="button" accessibilityLabel={`${t.label}. ${t.hint}`}
                      style={({ pressed }) => [styles.tile, tablet && { flexBasis: '31%' }, pressed && { opacity: 0.8 }]}>
                      <MaterialCommunityIcons name={t.icon} size={28} color={palette.forest} />
                      <AppText variant="h3" style={{ fontSize: 16 }}>{t.label}</AppText>
                      <AppText variant="caption">{t.hint}</AppText>
                    </Pressable>
                  ))}
                </View>
              </Section>
            )}

            {d.orders && (
              <Section title="Orders" note="Every open order, by how it is tracking against its deadline.">
                <KpiRow>
                  <Kpi label="In progress" value={d.orders.in_progress} sub="orders" onPress={can('orders.view') ? () => go(router, 'orders') : undefined} />
                  <Kpi label="Late" value={d.orders.red} sub="orders" tone={d.orders.red ? 'bad' : undefined} onPress={can('orders.view') ? () => go(router, 'orders') : undefined} />
                  <Kpi label="At risk" value={d.orders.amber} sub="orders" tone={d.orders.amber ? 'risk' : undefined} onPress={can('orders.view') ? () => go(router, 'orders') : undefined} />
                  <Kpi label="On track" value={d.orders.green} sub="orders" tone="ok" onPress={can('orders.view') ? () => go(router, 'orders') : undefined} />
                </KpiRow>
                {d.orders.needs_attention?.length > 0 && (
                  <View style={{ marginTop: space.lg }}>
                    <AppText variant="label" style={{ marginBottom: space.sm }}>Orders to look at</AppText>
                    {d.orders.needs_attention.map((o) => (
                      <ListRow key={o.id} title={o.order_no} subtitle={`Due ${date(o.deadline)} · ${Math.round(o.progress_pct || 0)}% done`} right={<StatusBadge value={o.risk} />} onPress={can('orders.view') ? () => go(router, 'orders', o.id) : undefined} />
                    ))}
                  </View>
                )}
              </Section>
            )}

            {d.production && (
              <Section title="Shop floor" note="Machines right now, and what has been recorded today.">
                <KpiRow>
                  <Kpi label="Running" value={`${d.production.running} of ${d.production.total}`} sub="machines" ratio={ratio(d.production.running, d.production.total)} onPress={can('production.view') ? () => go(router, 'machine-board') : undefined} />
                  <Kpi label="Breakdown" value={d.production.breakdown} sub="machines" tone={d.production.breakdown ? 'bad' : undefined} onPress={can('production.view') ? () => go(router, 'machine-board') : undefined} />
                  <Kpi label="Utilisation" value={`${d.production.utilisation_pct}%`} sub="machines running" />
                  {Object.entries(d.production.today || {}).map(([uom, qty]) => <Kpi key={uom} label="Recorded today" value={`${quantity(qty)} ${uom}`} />)}
                </KpiRow>
              </Section>
            )}

            {d.attendance && (
              <Section title="Attendance today" note="Workers expected on the floor.">
                <KpiRow>
                  <Kpi label="Present" value={`${d.attendance.present} of ${d.attendance.expected}`} sub="workers" ratio={ratio(d.attendance.present, d.attendance.expected)} onPress={can('attendance.view') ? () => go(router, 'attendance') : undefined} />
                  <Kpi label="Absent" value={d.attendance.absent} sub="workers" tone={d.attendance.absent ? 'bad' : undefined} onPress={can('attendance.view') ? () => go(router, 'attendance') : undefined} />
                  <Kpi label="Late" value={d.attendance.late} sub="workers" tone={d.attendance.late ? 'risk' : undefined} />
                  <Kpi label="Overtime" value={`${quantity(d.attendance.ot_hours)} h`} sub="today" />
                </KpiRow>
              </Section>
            )}

            {d.finance && (
              <Section title="This month" note="Revenue and profit so far.">
                <KpiRow>
                  <Kpi label="Revenue" value={money(d.finance.revenue)} />
                  <Kpi label="Net profit" value={money(d.finance.net_profit)} tone={Number(d.finance.net_profit) < 0 ? 'bad' : 'ok'}
                    sub={d.finance.change_pct != null ? `${d.finance.change_pct > 0 ? '+' : ''}${d.finance.change_pct}% vs last month` : undefined} />
                </KpiRow>
              </Section>
            )}

            {!d.orders && !d.production && !d.attendance && !d.finance && tasks.length === 0 && (
              <Banner tone="info" title="Nothing here for your role yet" text='Open "My work" from the menu to see your machine, attendance and pay.' />
            )}
          </>
        )}
      </QueryState>
    </Screen>
  );
}

const styles = StyleSheet.create({
  hero: { borderRadius: radius.lg, padding: space.xl, marginBottom: space.xl },
  heroTitle: { fontSize: 26, lineHeight: 32, fontFamily: serif, fontWeight: '700', color: '#fff', marginTop: 4 },
  item: { flexDirection: 'row', alignItems: 'center', gap: space.md, minHeight: TOUCH + 8, padding: space.md + 2, borderRadius: radius.md, marginBottom: space.sm },
  tiles: { flexDirection: 'row', flexWrap: 'wrap', gap: space.md },
  tile: { flexGrow: 1, flexBasis: '47%', minHeight: 104, gap: 4, padding: space.lg, borderRadius: radius.lg, borderWidth: 1, borderColor: palette.linen, backgroundColor: '#fff' },
});
