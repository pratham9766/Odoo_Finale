import React, { useMemo, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useSession } from '../../../src/context/Session';
import { useGet } from '../../../src/lib/hooks';
import { Avatar, Chips, Empty, Facts, Kpi, KpiRow, PageTitle, Panel, Pill, Progress, QueryState, Screen, Section } from '../../../src/components/ui';
import { date, label, money, quantity, time, todayISO } from '../../../src/utils/format';
import { palette, space } from '../../../src/theme/theme';

const WAGE_LABEL = { daily: 'per day', hourly: 'per hour', piece: 'per unit produced' };

// permission areas (permissions.domain) → readable names, as on the web
const AREAS = {
  orders: 'Orders', contacts: 'Buyers & suppliers', catalog: 'Items & recipes', inventory: 'Inventory', procurement: 'Purchasing',
  production: 'Production', maintenance: 'Maintenance', quality: 'Quality control', dispatch: 'Dispatch', finance: 'Accounts',
  workforce: 'Workforce', reports: 'Reports', staff: 'Staff & roles', settings: 'Mill settings',
};

/** The last 12 months as YYYY-MM, newest first. */
function lastMonths() {
  const [y, m] = todayISO().split('-').map(Number);
  return Array.from({ length: 12 }, (_, i) => {
    const d = new Date(y, m - 1 - i, 1);
    const value = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`;
    return { value, label: d.toLocaleDateString('en-IN', { month: 'short', year: 'numeric' }) };
  });
}

export default function MyWork() {
  const session = useSession();
  const months = useMemo(lastMonths, []);
  const [month, setMonth] = useState(months[0].value);
  const work = useGet('/me/work', { month }, { refetchInterval: 60000 });
  const d = work.payload;
  const name = session.context.user?.full_name || 'My work';

  return (
    <Screen onRefresh={work.refetch} refreshing={work.isRefetching}>
      <PageTitle eyebrow="EMPLOYEE" title={name} description={`${session.context.mill.name} · ${session.context.role.name}`} />
      <QueryState query={work}>
        {d && (
          <>
            {d.linked && <Chips options={months} value={month} onChange={setMonth} />}
            {d.linked ? <Linked d={d} /> : <StaffCard profile={d.profile} />}
            <Access access={d.access} />
          </>
        )}
      </QueryState>
    </Screen>
  );
}

function StaffCard({ profile }) {
  return (
    <>
      <Panel style={styles.idRow}>
        <Avatar name={profile.full_name || profile.email} size={52} />
        <View style={{ flex: 1 }}>
          <Text style={styles.idName}>{profile.full_name || profile.email}</Text>
          <Text style={styles.idSub}>{profile.role}</Text>
        </View>
      </Panel>
      <Panel>
        <Facts items={[['Email', profile.email], ['Phone', profile.phone || '–'], ['City', profile.city || '–'], ['Member since', date(profile.joined_at)]]} />
      </Panel>
      <Panel>
        <Text style={styles.note}>Attendance, machine output and payslips appear here for staff who are on the mill's worker list. If you are paid through the wage run, ask the owner to link your login under Staff.</Text>
      </Panel>
    </>
  );
}

function Linked({ d }) {
  const { worker, today, summary } = d;
  const outputText = Object.entries(summary.output).map(([uom, qty]) => `${quantity(qty)} ${uom}`).join(' · ') || '0';
  return (
    <>
      <Panel style={styles.idRow}>
        <Avatar name={worker.name} size={52} />
        <View style={{ flex: 1 }}>
          <Text style={styles.idName}>{worker.name}</Text>
          <Text style={styles.idSub}>{worker.emp_code} · {worker.skill || 'Worker'}</Text>
        </View>
      </Panel>
      <Panel>
        <Facts items={[
          ['Department', worker.stage || '–'],
          ['Usual shift', worker.default_shift ? `Shift ${worker.default_shift}` : '–'],
          ['Employment', label(worker.employment_type)],
          ['Pay', `${money(worker.wage_type === 'piece' ? worker.piece_rate : worker.rate)} ${WAGE_LABEL[worker.wage_type]}`],
          Number(worker.ot_rate) > 0 && ['Overtime', `${money(worker.ot_rate)} / hr`],
        ]} />
      </Panel>

      <Section title="Today" note={date(today.date)}>
        {today.assignments.length === 0 && today.attendance.length === 0
          ? <Panel><Empty icon="factory" text="No machine assigned to you today." /></Panel>
          : (
            <>
              {today.assignments.map((a, i) => (
                <Panel key={i}>
                  <View style={styles.between}>
                    <Text style={styles.machine}>{a.machine} <Text style={styles.idSub}>{a.machine_name}</Text></Text>
                    <Pill value={a.machine_status} />
                  </View>
                  <Text style={styles.idSub}>{a.shift} · {a.start_time?.slice(0, 5)}–{a.end_time?.slice(0, 5)}</Text>
                  {a.wo_no ? (
                    <>
                      <Text style={[styles.idSub, { marginTop: space.sm }]}>{a.wo_no} · {a.order_no}</Text>
                      <Progress pct={(a.produced_qty / a.target_qty) * 100} caption={`${quantity(a.produced_qty)} / ${quantity(a.target_qty)} ${a.uom}`} />
                    </>
                  ) : <Text style={[styles.idSub, { marginTop: space.sm }]}>No work order on this machine right now.</Text>}
                  <Text style={styles.mine}>Your output today: <Text style={{ fontWeight: '700' }}>{quantity(a.my_qty)} {a.uom || ''}</Text></Text>
                </Panel>
              ))}
              {today.attendance.map((a, i) => (
                <Panel key={`a${i}`}>
                  <View style={styles.between}><Text style={styles.machine}>Attendance · {a.shift}</Text><Pill value={a.status} /></View>
                  <Text style={styles.idSub}>In {time(a.check_in)} · Out {time(a.check_out)}</Text>
                </Panel>
              ))}
            </>
          )}
      </Section>

      <Section title="This month" note={d.month}>
        <KpiRow>
          <Kpi label="Days worked" value={quantity(summary.days)} sub={`${summary.present} present · ${summary.late} late`} />
          <Kpi label="Absent / leave" value={`${summary.absent} / ${summary.leave}`} tone={summary.absent ? 'bad' : undefined} />
          <Kpi label="Overtime (h)" value={quantity(summary.ot_hours)} sub={summary.ot_pending ? `${quantity(summary.ot_pending)} h pending` : undefined} />
          <Kpi label="Output" value={outputText} />
          <Kpi label="Estimated pay" value={money(summary.estimated_pay)} tone="ok" sub="Before deductions" />
        </KpiRow>
      </Section>

      <Section title="Attendance">
        {d.attendance.length === 0 ? <Panel><Empty icon="calendar-blank" text="No attendance recorded this month." /></Panel> : d.attendance.slice(0, 40).map((a, i) => (
          <Panel key={i} style={styles.compact}>
            <View style={styles.between}>
              <Text style={styles.machine}>{date(a.date)} · {a.shift}</Text>
              <Pill value={a.status} />
            </View>
            <Text style={styles.idSub}>{time(a.check_in)} – {time(a.check_out)} · {quantity(a.worked_hours)} h{Number(a.ot_hours) > 0 ? ` · OT ${quantity(a.ot_hours)} h${a.ot_approved ? '' : ' (pending)'}` : ''}</Text>
          </Panel>
        ))}
      </Section>

      <Section title="Payslips" note="Last 12 months">
        {d.payslips.length === 0 ? <Panel><Empty icon="wallet-outline" text="No payslips yet." /></Panel> : d.payslips.map(p => (
          <Panel key={p.month} style={styles.compact}>
            <View style={styles.between}><Text style={styles.machine}>{p.month}</Text><Pill value={p.status} /></View>
            <Text style={styles.idSub}>{quantity(p.days)} days · gross {money(p.gross)} · deductions {money(p.deductions)}</Text>
            <Text style={styles.net}>Net {money(p.net)}</Text>
          </Panel>
        ))}
      </Section>
    </>
  );
}

function Access({ access }) {
  return (
    <Section title="What you can do" note="From your role. The owner can change it in Roles & permissions.">
      {access.length === 0
        ? <Panel><Empty text="Your role gives access to My work and your profile only." /></Panel>
        : access.map(a => (
          <Panel key={a.domain} style={styles.compact}>
            <Text style={styles.machine}>{AREAS[a.domain] || label(a.domain)}</Text>
            {a.items.map(i => <Text key={i} style={styles.access}>• {i}</Text>)}
          </Panel>
        ))}
    </Section>
  );
}

const styles = StyleSheet.create({
  idRow: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  idName: { fontSize: 18, fontWeight: '700', color: palette.forest },
  idSub: { fontSize: 13, color: palette.textSecondary, marginTop: 2 },
  note: { fontSize: 13, color: palette.textSecondary, lineHeight: 19 },
  between: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', gap: space.sm },
  machine: { fontSize: 15, fontWeight: '700', color: palette.ink, flexShrink: 1 },
  mine: { marginTop: space.sm, fontSize: 13, color: palette.textSecondary },
  net: { marginTop: 4, fontSize: 15, fontWeight: '700', color: palette.ok },
  compact: { paddingVertical: space.md },
  access: { fontSize: 13, color: palette.textSecondary, marginTop: 3, lineHeight: 18 },
});
