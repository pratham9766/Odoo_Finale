import React, { useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, View } from 'react-native';
import { Button } from 'react-native-paper';
import Gate from '../../../src/components/Gate';
import { useSession } from '../../../src/context/Session';
import { useAction, useGet } from '../../../src/lib/hooks';
import { Chips, Empty, Kpi, KpiRow, PageTitle, Panel, Pill, QueryState, Screen, Section } from '../../../src/components/ui';
import { date, quantity, todayISO } from '../../../src/utils/format';
import { palette, space } from '../../../src/theme/theme';

const CYCLE = ['present', 'late', 'half_day', 'absent', 'leave'];

export default function Attendance() {
  return <Gate perms="attendance.view"><Body /></Gate>;
}

function Body() {
  const { can } = useSession();
  const canMark = can('attendance.mark');
  const [tab, setTab] = useState(canMark ? 'mark' : 'today');
  const tabs = [{ value: 'today', label: 'Today' }, ...(canMark ? [{ value: 'mark', label: 'Mark attendance' }] : [])];
  return (
    <Screen>
      <PageTitle eyebrow="PEOPLE" title="Attendance" description={tab === 'mark' ? 'Everyone starts as present. Tap a worker to change the status, then save once.' : 'Who is on the floor today.'} />
      {tabs.length > 1 && <Chips options={tabs} value={tab} onChange={setTab} />}
      {tab === 'mark' ? <Mark /> : <Today />}
    </Screen>
  );
}

function Today() {
  const board = useGet('/attendance/today', {}, { refetchInterval: 30000 });
  const b = board.payload;
  return (
    <QueryState query={board}>
      {b && (
        <>
          <KpiRow>
            <Kpi label="Present" value={`${b.kpis.present} / ${b.kpis.expected}`} tone="ok" ratio={b.kpis.expected ? b.kpis.present / b.kpis.expected : 0} />
            <Kpi label="Absent" value={b.kpis.absent} tone={b.kpis.absent ? 'bad' : undefined} />
            <Kpi label="Late" value={b.kpis.late} tone={b.kpis.late ? 'risk' : undefined} />
            <Kpi label="On leave" value={b.kpis.on_leave} />
            <Kpi label="Overtime (h)" value={quantity(b.kpis.ot_hours)} />
          </KpiRow>

          <Section title="By shift and stage" note={date(b.date)}>
            {b.groups.length === 0 ? <Panel><Empty text="No workers expected today." /></Panel> : b.groups.map(g => (
              <Panel key={`${g.shift_id}${g.stage_id}`} style={styles.group}>
                <View style={{ flex: 1 }}>
                  <Text style={styles.strong}>{g.stage || 'No stage'}</Text>
                  <Text style={styles.sub}>{g.shift ? `Shift ${g.shift}` : 'No shift'}</Text>
                </View>
                <Text style={styles.count}>{g.present}<Text style={styles.sub}> / {g.expected}</Text></Text>
              </Panel>
            ))}
          </Section>

          {b.absent.length > 0 && (
            <Section title="Absent">
              {b.absent.map(a => (
                <Panel key={a.attendance_id} style={styles.group}>
                  <View style={{ flex: 1 }}>
                    <Text style={styles.strong}>{a.worker}</Text>
                    <Text style={styles.sub}>{a.emp_code} · {a.stage} · Shift {a.shift}</Text>
                  </View>
                  <Pill value="absent" />
                </Panel>
              ))}
            </Section>
          )}
        </>
      )}
    </QueryState>
  );
}

/** the supervisor's grid: pick the shift, everyone starts as present, change the exceptions, save once */
function Mark() {
  const act = useAction();
  const day = todayISO();
  const [shift, setShift] = useState();
  const [picks, setPicks] = useState({});
  const shifts = useGet('/shifts');
  const workers = useGet('/workers', { limit: 200, active: 'true', shift_id: shift }, { enabled: !!shift });
  const saved = useGet('/attendance', { date: day, shift_id: shift }, { enabled: !!shift });
  const existing = Object.fromEntries((saved.payload || []).map(a => [a.worker_id, a.status]));
  const list = workers.payload || [];
  const statusOf = w => picks[w.id] ?? existing[w.id] ?? 'present';
  const next = w => setPicks(p => ({ ...p, [w.id]: CYCLE[(CYCLE.indexOf(statusOf(w)) + 1) % CYCLE.length] }));

  const save = () => act.mutate(
    { path: '/attendance/bulk', body: { date: day, shift_id: shift, entries: list.map(w => ({ worker_id: w.id, status: statusOf(w) })) } },
    { onSuccess: () => { setPicks({}); Alert.alert('Attendance saved'); } },
  );

  return (
    <>
      <Chips
        options={(shifts.payload || []).map(s => ({ value: s.id, label: `${s.name} (${s.start_time?.slice(0, 5)}–${s.end_time?.slice(0, 5)})` }))}
        value={shift}
        onChange={v => { setShift(v); setPicks({}); }}
      />
      {!shift ? <Panel><Empty icon="calendar-clock" text="Choose a shift to mark attendance." /></Panel> : (
        <QueryState query={workers}>
          {list.length === 0 ? <Panel><Empty text="No workers have this shift as their default shift." /></Panel> : (
            <>
              <View style={styles.bar}>
                <Button compact onPress={() => setPicks(Object.fromEntries(list.map(w => [w.id, 'present'])))}>Mark everyone present</Button>
                <Text style={styles.sub}>{list.filter(w => statusOf(w) !== 'present').length} exception(s)</Text>
              </View>
              {list.map(w => (
                <Pressable key={w.id} onPress={() => next(w)}>
                  <Panel style={styles.group}>
                    <View style={{ flex: 1 }}>
                      <Text style={styles.strong}>{w.name}</Text>
                      <Text style={styles.sub}>{w.emp_code}{w.stage ? ` · ${w.stage}` : ''}</Text>
                    </View>
                    <Pill value={statusOf(w)} />
                  </Panel>
                </Pressable>
              ))}
              <Button mode="contained" onPress={save} loading={act.isPending} disabled={act.isPending} contentStyle={{ height: 50 }} style={{ marginTop: space.md }}>Save attendance</Button>
            </>
          )}
        </QueryState>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  group: { flexDirection: 'row', alignItems: 'center', paddingVertical: space.md },
  strong: { fontSize: 15, fontWeight: '700', color: palette.ink },
  sub: { fontSize: 13, color: palette.textSecondary, marginTop: 2 },
  count: { fontSize: 20, fontWeight: '700', color: palette.forest },
  bar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: space.sm },
});
