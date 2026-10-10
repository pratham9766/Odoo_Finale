import React from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { MaterialCommunityIcons } from '@expo/vector-icons';
import { useRouter } from 'expo-router';
import { useSession } from '../../../src/context/Session';
import { useGet } from '../../../src/lib/hooks';
import { Kpi, KpiRow, ListRow, PageTitle, Panel, Pill, QueryState, Screen, Section } from '../../../src/components/ui';
import { date, money, quantity } from '../../../src/utils/format';
import { palette, radius, space } from '../../../src/theme/theme';

const go = (router, route, id) => router.navigate(id ? `/(app)/${route}/${id}` : `/(app)/(drawer)/${route}`);
const ratio = (a, b) => (Number(b) > 0 ? Number(a) / Number(b) : 0);

/** A tappable alert strip, the web's .dash-alert */
function Alert({ tone, text, onPress }) {
  const colors = { warning: [palette.riskBg, palette.risk], error: [palette.dangerBg, palette.danger], info: [palette.infoBg, palette.info], success: [palette.okBg, palette.ok] }[tone];
  return (
    <Pressable onPress={onPress} disabled={!onPress} style={[styles.alert, { backgroundColor: colors[0] }]}>
      <Text style={[styles.alertText, { color: colors[1] }]}>{text}</Text>
      {onPress ? <MaterialCommunityIcons name="chevron-right" size={20} color={colors[1]} /> : null}
    </Pressable>
  );
}

/** last 7 days of output, one bar per day; every stage has its own scale because the units differ */
function Last7({ rows }) {
  const stages = [...new Set(rows.map(r => r.stage))];
  return stages.map(stage => {
    const mine = rows.filter(r => r.stage === stage);
    const max = Math.max(...mine.map(r => Number(r.qty)), 1);
    return (
      <Panel key={stage}>
        <Text style={styles.stage}>{stage} <Text style={styles.uom}>{mine[0].uom}</Text></Text>
        <View style={styles.bars}>
          {mine.map(r => (
            <View key={String(r.day)} style={styles.barCol}>
              <View style={[styles.bar, { height: `${Math.max(4, (Number(r.qty) / max) * 100)}%` }]} />
              <Text style={styles.barLabel}>{String(r.day).slice(8, 10)}</Text>
            </View>
          ))}
        </View>
      </Panel>
    );
  });
}

export default function Dashboard() {
  const router = useRouter();
  const session = useSession();
  const q = useGet('/reports/dashboard', {}, { refetchInterval: 60000 });
  const d = q.payload;
  const a = d?.alerts || {};
  const name = session.context.user?.full_name || session.context.role.name;

  const alerts = [
    a.low_stock > 0 && { tone: 'warning', text: `${a.low_stock} material${a.low_stock > 1 ? 's' : ''} below reorder level`, route: 'stock' },
    a.machines_down?.length > 0 && { tone: 'error', text: `Machines down: ${a.machines_down.join(', ')}`, route: 'machine-board' },
    a.overdue?.invoices > 0 && { tone: 'error', text: `${a.overdue.invoices} overdue invoice${a.overdue.invoices > 1 ? 's' : ''}: ${money(a.overdue.amount)} to collect` },
    a.unmoved_rolls > 0 && { tone: 'info', text: `${a.unmoved_rolls} finished roll${a.unmoved_rolls > 1 ? 's' : ''} have not moved for a week`, route: 'stock' },
  ].filter(Boolean);

  return (
    <Screen onRefresh={q.refetch} refreshing={q.isRefetching}>
      <PageTitle eyebrow="MILL OPERATIONS" title="Dashboard" description={`Welcome, ${name}. Here is the mill right now.`} />
      <QueryState query={q}>
        {d && (
          <>
            <View style={{ gap: space.sm, marginBottom: space.lg }}>
              {alerts.map(x => <Alert key={x.text} tone={x.tone} text={x.text} onPress={x.route && session.can(x.route === 'stock' ? 'stock.view' : 'production.view') ? () => go(router, x.route) : undefined} />)}
              {alerts.length === 0 && <Alert tone="success" text="Nothing needs attention right now" />}
            </View>

            {d.orders && (
              <Section title="Order health" note="Current order status and progress.">
                <KpiRow>
                  <Kpi label="In progress" value={d.orders.in_progress} onPress={() => go(router, 'orders')} />
                  <Kpi label="Late (red)" value={d.orders.red} tone={d.orders.red ? 'bad' : undefined} onPress={() => go(router, 'orders')} />
                  <Kpi label="At risk (amber)" value={d.orders.amber} tone={d.orders.amber ? 'risk' : undefined} onPress={() => go(router, 'orders')} />
                  <Kpi label="On track" value={d.orders.green} tone="ok" onPress={() => go(router, 'orders')} />
                </KpiRow>
                {d.orders.needs_attention?.length > 0 && (
                  <View style={{ marginTop: space.md }}>
                    <Text style={styles.sub}>Needs attention</Text>
                    {d.orders.needs_attention.map(o => (
                      <ListRow key={o.id} title={o.order_no} subtitle={`Due ${date(o.deadline)} · ${Math.round(o.progress_pct || 0)}% done`}
                        right={<Pill value={o.risk} />} onPress={() => go(router, 'orders', o.id)} />
                    ))}
                  </View>
                )}
              </Section>
            )}

            {d.production && (
              <Section title="Shop floor" note="Live machine status and today's output.">
                <KpiRow>
                  <Kpi label="Machines running" value={`${d.production.running} / ${d.production.total}`} ratio={ratio(d.production.running, d.production.total)} onPress={() => go(router, 'machine-board')} />
                  <Kpi label="Breakdown" value={d.production.breakdown} tone={d.production.breakdown ? 'bad' : undefined} onPress={() => go(router, 'machine-board')} />
                  <Kpi label="Utilisation" value={`${d.production.utilisation_pct}%`} />
                  {Object.entries(d.production.today || {}).map(([uom, qty]) => <Kpi key={uom} label="Output today" value={`${quantity(qty)} ${uom}`} />)}
                </KpiRow>
                {d.production.last_7_days?.length > 0 && <View style={{ marginTop: space.md }}><Text style={styles.sub}>Last 7 days</Text><Last7 rows={d.production.last_7_days} /></View>}
              </Section>
            )}

            {d.attendance && (
              <Section title="Attendance today" note="Workers on the floor.">
                <KpiRow>
                  <Kpi label="Present" value={`${d.attendance.present} / ${d.attendance.expected}`} ratio={ratio(d.attendance.present, d.attendance.expected)} onPress={() => go(router, 'attendance')} />
                  <Kpi label="Absent" value={d.attendance.absent} tone={d.attendance.absent ? 'bad' : undefined} onPress={() => go(router, 'attendance')} />
                  <Kpi label="Late" value={d.attendance.late} tone={d.attendance.late ? 'risk' : undefined} />
                  <Kpi label="Overtime (h)" value={quantity(d.attendance.ot_hours)} />
                </KpiRow>
              </Section>
            )}

            {d.finance && (
              <Section title="This month" note="Profit against last month.">
                <KpiRow>
                  <Kpi label="Revenue" value={money(d.finance.revenue)} />
                  <Kpi label="Net profit" value={money(d.finance.net_profit)} tone={Number(d.finance.net_profit) < 0 ? 'bad' : 'ok'}
                    sub={d.finance.change_pct != null ? `${d.finance.change_pct > 0 ? '+' : ''}${d.finance.change_pct}% vs last month` : undefined} />
                </KpiRow>
              </Section>
            )}

            {!d.orders && !d.production && !d.attendance && !d.finance && (
              <Panel><Text style={styles.sub}>Open “My work” from the menu to see your machine, attendance and pay.</Text></Panel>
            )}
          </>
        )}
      </QueryState>
    </Screen>
  );
}

const styles = StyleSheet.create({
  alert: { flexDirection: 'row', alignItems: 'center', padding: space.md + 2, borderRadius: radius.md },
  alertText: { flex: 1, fontSize: 14, fontWeight: '600' },
  sub: { fontSize: 13, fontWeight: '700', color: palette.textSecondary, marginBottom: space.sm },
  stage: { fontSize: 15, fontWeight: '700', color: palette.forest },
  uom: { fontSize: 12, fontWeight: '400', color: palette.textMuted },
  bars: { flexDirection: 'row', alignItems: 'flex-end', height: 90, gap: 6, marginTop: space.md },
  barCol: { flex: 1, height: '100%', justifyContent: 'flex-end', alignItems: 'center' },
  bar: { width: '100%', backgroundColor: palette.gold, borderRadius: 4 },
  barLabel: { fontSize: 10, color: palette.textMuted, marginTop: 3 },
});
