import React, { useState } from 'react';
import { Pressable, StyleSheet, View } from 'react-native';
import Gate from '../../../src/components/Gate';
import { useSession } from '../../../src/context/Session';
import { useAction, useGet } from '../../../src/lib/hooks';
import { describeError } from '../../../src/services/api/errors';
import { ActionButton, AppText, Banner, Chips, ConfirmDialog, Empty, Field, Kpi, KpiRow, PageTitle, Panel, QueryState, Screen, Section, StatusBadge, useToast } from '../../../src/components/ui';
import { buildCorrection, millClock } from '../../../src/utils/attendanceTime';
import { date, quantity, todayISO } from '../../../src/utils/format';
import { palette, space } from '../../../src/theme/theme';

const CYCLE = ['present', 'late', 'half_day', 'absent', 'leave'];

export default function Attendance() {
  return <Gate perms="attendance.view"><Body /></Gate>;
}

function Body() {
  const { can } = useSession();
  const canMark = can('attendance.mark');
  const unresolved = useGet('/attendance/unresolved', {}, { refetchInterval: 120000 });
  const count = unresolved.payload?.length ?? 0;
  const [tab, setTab] = useState(canMark ? 'mark' : 'today');
  const tabs = [
    { value: 'today', label: 'Today' },
    { value: 'fix', label: count ? `Needs correction (${count})` : 'Needs correction' },
    ...(canMark ? [{ value: 'mark', label: 'Mark attendance' }] : []),
  ];
  return (
    <Screen onRefresh={unresolved.refetch} refreshing={unresolved.isRefetching}>
      <PageTitle eyebrow="PEOPLE" title="Attendance"
        description={tab === 'mark' ? 'Everyone starts as present. Tap a worker to change the status, then save once.' : tab === 'fix' ? 'Card check-ins that nobody has closed yet.' : 'Who is on the floor today.'} />
      {count > 0 && tab !== 'fix' ? <Banner tone="risk" title={`${count} attendance record${count === 1 ? ' needs' : 's need'} a correction`} text="Payroll cannot be prepared until these are closed." action={{ label: 'Review them', onPress: () => setTab('fix') }} /> : null}
      <Chips options={tabs} value={tab} onChange={setTab} />
      {tab === 'mark' ? <Mark /> : tab === 'fix' ? <Corrections query={unresolved} canCorrect={canMark} /> : <Today />}
    </Screen>
  );
}

// ---- worker view: who is here today ---------------------------------------------------------------------------------------

function Today() {
  const board = useGet('/attendance/today', {}, { refetchInterval: 30000 });
  const b = board.payload;
  return (
    <QueryState query={board}>
      {b && (
        <>
          <KpiRow>
            <Kpi label="Present" value={`${b.kpis.present} of ${b.kpis.expected}`} sub="workers" tone="ok" ratio={b.kpis.expected ? b.kpis.present / b.kpis.expected : 0} />
            <Kpi label="Absent" value={b.kpis.absent} sub="workers" tone={b.kpis.absent ? 'bad' : undefined} />
            <Kpi label="Late" value={b.kpis.late} sub="workers" tone={b.kpis.late ? 'risk' : undefined} />
            <Kpi label="On leave" value={b.kpis.on_leave} sub="workers" />
            <Kpi label="Overtime" value={`${quantity(b.kpis.ot_hours)} h`} sub="today" />
          </KpiRow>

          <View style={{ height: space.xl }} />
          <Section title="By shift and stage" note={date(b.date)}>
            {b.groups.length === 0 ? <Panel><Empty icon="account-group-outline" text="No workers are expected today." hint="Workers are expected when they have a default shift." /></Panel> : b.groups.map((g) => (
              <Panel key={`${g.shift_id}${g.stage_id}`} style={styles.row} accessibilityLabel={`${g.stage || 'No stage'}, shift ${g.shift || 'none'}: ${g.present} of ${g.expected} present`}>
                <View style={{ flex: 1 }}>
                  <AppText variant="h3">{g.stage || 'No stage'}</AppText>
                  <AppText variant="small">{g.shift ? `Shift ${g.shift}` : 'No shift'}</AppText>
                </View>
                <AppText variant="h2">{g.present}<AppText variant="small"> of {g.expected}</AppText></AppText>
              </Panel>
            ))}
          </Section>

          {b.absent.length > 0 && (
            <Section title={`Absent (${b.absent.length})`}>
              {b.absent.map((a) => (
                <Panel key={a.attendance_id} style={styles.row}>
                  <View style={{ flex: 1 }}>
                    <AppText variant="h3">{a.worker}</AppText>
                    <AppText variant="small">{a.emp_code} · {a.stage} · Shift {a.shift}</AppText>
                  </View>
                  <StatusBadge value="absent" />
                </Panel>
              ))}
            </Section>
          )}
        </>
      )}
    </QueryState>
  );
}

// ---- corrections: a card check-in with no check-out -----------------------------------------------------------------------

/**
 * Card check-ins nobody has closed. Their hours are unknown, so they are NOT counted as payable time and the month's payroll
 * cannot be prepared or approved while any are open. A supervisor closes each one with the real check-out time and a reason;
 * nothing is guessed from the shift end. The change is recorded with the supervisor's name.
 */
function Corrections({ query, canCorrect }) {
  const rows = query.payload || [];
  const [editing, setEditing] = useState(null);
  return (
    <QueryState query={query}>
      {rows.length === 0 ? (
        <Panel><Empty icon="check-circle-outline" text="Nothing needs correcting." hint="Every card check-in has been closed, so attendance is ready for payroll." /></Panel>
      ) : (
        <>
          <Banner tone="info" title="Why this matters" text={'A card scan records only when someone arrived. Until the check-out is entered, the hours of that day are unknown, and payroll will not be prepared or approved for the month.'} />
          {!canCorrect ? <Banner tone="info" title="View only" text="Your role can see these but not correct them. Ask a supervisor." /> : null}
          {rows.map((r) => (
            <Panel key={r.id} accessibilityLabel={`${r.worker}, ${date(r.date)}, checked in ${millClock(r.check_in)}, no check-out`}>
              <View style={styles.row}>
                <View style={{ flex: 1 }}>
                  <AppText variant="h3">{r.worker}</AppText>
                  <AppText variant="small">{r.emp_code}{r.stage ? ` · ${r.stage}` : ''} · Shift {r.shift}</AppText>
                  <AppText variant="small">{date(r.date)} · checked in {millClock(r.check_in)} · no check-out</AppText>
                </View>
                <StatusBadge tone="risk" text="Incomplete" icon="clock-alert-outline" />
              </View>
              {r.payroll_locked ? (
                <Banner style={{ marginTop: space.md, marginBottom: 0 }} tone="bad" title="Payroll is locked for this month" text="The wage run is already approved or paid, so this record cannot be changed here. Ask the owner to reopen the wage run on the web." />
              ) : canCorrect ? (
                <ActionButton compact kind="secondary" label="Enter check-out" icon="clock-edit-outline" onPress={() => setEditing(r)} style={{ marginTop: space.md }} />
              ) : null}
            </Panel>
          ))}
        </>
      )}
      {editing ? <CorrectionDialog row={editing} onClose={() => setEditing(null)} /> : null}
    </QueryState>
  );
}

function CorrectionDialog({ row, onClose }) {
  const act = useAction();
  const toast = useToast();
  const [checkOut, setCheckOut] = useState('');
  const [checkIn, setCheckIn] = useState('');
  const [editIn, setEditIn] = useState(false);
  const [next, setNext] = useState(false);
  const [reason, setReason] = useState('');
  const [errors, setErrors] = useState({});
  const [serverError, setServerError] = useState(null);
  const [preview, setPreview] = useState(null);

  const review = () => {
    setServerError(null);
    const built = buildCorrection({ date: row.date, checkInText: editIn ? checkIn : '', checkOutText: checkOut, nextDay: next, existingCheckIn: row.check_in });
    const e = {};
    if (built.error) e[built.error.field] = built.error.text;
    if (reason.trim().length < 5) e.reason = 'Say why, in a few words (at least 5 characters).';
    setErrors(e);
    if (!Object.keys(e).length) setPreview(built);
  };

  const send = () => act.mutate({ path: `/attendance/${row.id}/correct`, body: { ...(preview.checkIn ? { check_in: preview.checkIn } : {}), check_out: preview.checkOut, reason: reason.trim() }, quiet: true }, {
    onSuccess: (res) => { toast(`${row.worker}: ${quantity(res.data.worked_hours)} hours recorded.`); onClose(); },
    onError: (e) => {
      const info = describeError(e, { write: true });
      setPreview(null);
      setServerError(info.uncertain ? 'The server did not answer. Close this and refresh the list: if the record is gone from it, the correction was saved.' : e.message);
    },
  });

  return (
    <>
      <ConfirmDialog visible={!preview} title={`Check-out for ${row.worker}`} confirmLabel="Review" onCancel={onClose} onConfirm={review}
        message={`${date(row.date)}, shift ${row.shift}. Checked in at ${millClock(row.check_in)}. Enter when they actually left.`}>
        <Field label="Check-out time" value={checkOut} onChangeText={(t) => { setCheckOut(t); setErrors((x) => ({ ...x, checkOut: undefined })); }} error={errors.checkOut} placeholder="14:00" helper="24-hour time at the mill, for example 14:00" />
        <View style={styles.toggles}>
          <Chips options={[{ value: false, label: 'Same day' }, { value: true, label: 'Next day' }]} value={next} onChange={setNext} />
        </View>
        {editIn ? (
          <Field label="Check-in time (corrected)" value={checkIn} onChangeText={(t) => { setCheckIn(t); setErrors((x) => ({ ...x, checkIn: undefined })); }} error={errors.checkIn} placeholder={millClock(row.check_in)} />
        ) : (
          <Pressable onPress={() => setEditIn(true)} accessibilityRole="button" style={styles.link}><AppText variant="label" style={{ color: palette.forest }}>The check-in time is wrong too</AppText></Pressable>
        )}
        <Field label="Reason" multiline value={reason} onChangeText={(t) => { setReason(t); setErrors((x) => ({ ...x, reason: undefined })); }} error={errors.reason} maxLength={300} helper="Recorded with your name, for example: confirmed with the shift lead" />
        {serverError ? <Banner tone="bad" title="Not saved" text={serverError} /> : null}
      </ConfirmDialog>
      <ConfirmDialog visible={!!preview} title="Save this correction?" confirmLabel="Save correction" loading={act.isPending} onCancel={() => setPreview(null)} onConfirm={send}
        message={preview ? `${row.worker} worked ${preview.hours} on ${date(row.date)}. Hours, overtime and status are worked out from the shift. This is recorded with your name and reason.` : ''} />
    </>
  );
}

// ---- supervisor grid -------------------------------------------------------------------------------------------------------

/** pick the shift, everyone starts as present, change the exceptions, save once */
function Mark() {
  const act = useAction();
  const toast = useToast();
  const day = todayISO();
  const [shift, setShift] = useState();
  const [picks, setPicks] = useState({});
  const [error, setError] = useState(null);
  const shifts = useGet('/shifts');
  const workers = useGet('/workers', { limit: 200, active: 'true', shift_id: shift }, { enabled: !!shift });
  const saved = useGet('/attendance', { date: day, shift_id: shift }, { enabled: !!shift });
  const existing = Object.fromEntries((saved.payload || []).map((a) => [a.worker_id, a]));
  const list = workers.payload || [];
  const statusOf = (w) => picks[w.id] ?? existing[w.id]?.status ?? 'present';
  const next = (w) => setPicks((p) => ({ ...p, [w.id]: CYCLE[(CYCLE.indexOf(statusOf(w)) + 1) % CYCLE.length] }));
  const open = list.filter((w) => existing[w.id]?.needs_correction).length;

  const save = () => {
    setError(null);
    act.mutate({ path: '/attendance/bulk', body: { date: day, shift_id: shift, entries: list.map((w) => ({ worker_id: w.id, status: statusOf(w) })) }, quiet: true }, {
      onSuccess: () => { setPicks({}); toast('Attendance saved.'); },
      onError: (e) => { const i = describeError(e, { write: true }); setError(i.uncertain ? 'Not confirmed: the server did not answer. Refresh to see whether it was saved before saving again. Saving twice is harmless.' : e.message); },
    });
  };

  return (
    <>
      <Chips options={(shifts.payload || []).map((s) => ({ value: s.id, label: `${s.name} (${s.start_time?.slice(0, 5)}–${s.end_time?.slice(0, 5)})` }))} value={shift} onChange={(v) => { setShift(v); setPicks({}); }} />
      {!shift ? <Panel><Empty icon="calendar-clock" text="Choose a shift to mark attendance." /></Panel> : (
        <QueryState query={workers}>
          {list.length === 0 ? <Panel><Empty text="No workers have this shift as their default shift." hint="A worker's default shift is set on the web app." /></Panel> : (
            <>
              {open > 0 ? <Banner tone="info" title={`${open} card check-in${open === 1 ? '' : 's'} still open`} text='Saving here keeps the card time but does not close the day. Use "Needs correction" to enter the check-out.' /> : null}
              <View style={styles.bar}>
                <ActionButton compact kind="secondary" label="Mark everyone present" onPress={() => setPicks(Object.fromEntries(list.map((w) => [w.id, 'present'])))} />
                <AppText variant="small">{list.filter((w) => statusOf(w) !== 'present').length} exception(s)</AppText>
              </View>
              {list.map((w) => (
                <Pressable key={w.id} onPress={() => next(w)} accessibilityRole="button" accessibilityLabel={`${w.name}, ${statusOf(w).replace('_', ' ')}. Tap to change.`}>
                  <Panel style={styles.row}>
                    <View style={{ flex: 1 }}>
                      <AppText variant="h3">{w.name}</AppText>
                      <AppText variant="small">{w.emp_code}{w.stage ? ` · ${w.stage}` : ''}{existing[w.id]?.source && existing[w.id].source !== 'manual' ? ` · card ${millClock(existing[w.id].check_in)}` : ''}</AppText>
                    </View>
                    <StatusBadge value={statusOf(w)} />
                  </Panel>
                </Pressable>
              ))}
              {error ? <Banner tone="bad" title="Not saved" text={error} /> : null}
              <ActionButton label="Save attendance" icon="content-save-outline" onPress={save} loading={act.isPending} />
            </>
          )}
        </QueryState>
      )}
    </>
  );
}

const styles = StyleSheet.create({
  row: { flexDirection: 'row', alignItems: 'center', gap: space.md },
  bar: { flexDirection: 'row', justifyContent: 'space-between', alignItems: 'center', marginBottom: space.md, gap: space.md },
  toggles: { marginBottom: space.sm },
  link: { minHeight: 48, justifyContent: 'center', marginBottom: space.sm },
});
