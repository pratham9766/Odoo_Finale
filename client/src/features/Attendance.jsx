import { useState } from 'react';
import { Button, Input, Popconfirm, Select, Space, Table, Tabs, Tag } from 'antd';
import { NoData, PageTitle, QueryState } from '@/components/States';
import { useSession } from '@/context/Session';
import { monthISO, todayISO, useAction, useGet } from '@/lib/hooks';

const STATUSES = [
  { value: 'present', label: 'Present' }, { value: 'late', label: 'Late' }, { value: 'half_day', label: 'Half day' }, { value: 'absent', label: 'Absent' },
  { value: 'leave', label: 'On leave' }, { value: 'weekly_off', label: 'Weekly off' }, { value: 'holiday', label: 'Holiday' },
];
const COLOR = { present: 'green', late: 'orange', half_day: 'gold', absent: 'red', leave: 'blue', weekly_off: 'default', holiday: 'default' };

function useShifts() {
  const shifts = useGet('/shifts');
  return { shifts, options: (shifts.payload || []).map((s) => ({ value: s.id, label: `${s.name} (${s.start_time?.slice(0, 5)}–${s.end_time?.slice(0, 5)})` })) };
}

/** how many are in today, per shift and stage, and who is absent */
function Today() {
  const session = useSession();
  const act = useAction({ success: 'Overtime approved' });
  const [day, setDay] = useState(todayISO());
  const [shift, setShift] = useState();
  const { options } = useShifts();
  const board = useGet('/attendance/today', { date: day, shift_id: shift }, { refetchInterval: 30000 });
  const rows = useGet('/attendance', { date: day, shift_id: shift });
  const k = board.payload?.kpis;
  const overtime = (rows.payload || []).filter((r) => Number(r.ot_hours) > 0);
  return (
    <>
      <Space wrap style={{ marginBottom: 12 }}>
        <Input type="date" value={day} onChange={(e) => setDay(e.target.value)} style={{ width: 160 }} />
        <Select allowClear placeholder="All shifts" value={shift} onChange={setShift} options={options} style={{ width: 220 }} />
      </Space>
      <QueryState query={board}>
        {k && (
          <div className="kpi-row">
            {[['Expected', k.expected], ['Present', k.present, 'green'], ['Late', k.late, 'orange'], ['Absent', k.absent, 'red'], ['On leave', k.on_leave], ['Overtime hours', k.ot_hours]]
              .map(([label, value, color]) => <div className="kpi" key={label}><span>{label}</span><strong style={color ? { color } : undefined}>{value}</strong></div>)}
          </div>
        )}
        <Table rowKey={(r) => `${r.shift_id}-${r.stage_id}`} size="small" pagination={false} dataSource={board.payload?.groups || []} locale={{ emptyText: <NoData description="Nothing recorded for this day." /> }}
          columns={[{ title: 'Shift', dataIndex: 'shift' }, { title: 'Stage', dataIndex: 'stage' }, { title: 'Expected', dataIndex: 'expected', align: 'right' }, { title: 'Present', dataIndex: 'present', align: 'right' }, { title: 'Late', dataIndex: 'late', align: 'right' }, { title: 'Absent', dataIndex: 'absent', align: 'right' }, { title: 'On leave', dataIndex: 'on_leave', align: 'right' }]} />
        {(board.payload?.absent || []).length > 0 && (
          <>
            <h3 style={{ marginTop: 16 }}>Absent</h3>
            <Space wrap>{board.payload.absent.map((a) => <Tag color="red" key={a.attendance_id}>{a.worker} · {a.shift}</Tag>)}</Space>
          </>
        )}
        {overtime.length > 0 && (
          <>
            <h3 style={{ marginTop: 16 }}>Overtime</h3>
            <Table rowKey="id" size="small" pagination={false} dataSource={overtime}
              columns={[{ title: 'Worker', dataIndex: 'worker' }, { title: 'Shift', dataIndex: 'shift' }, { title: 'OT hours', dataIndex: 'ot_hours', align: 'right' },
                { title: '', key: 'a', render: (_, r) => (r.ot_approved ? <Tag color="green">approved</Tag> : session.can('attendance.approve') && <Popconfirm title="Approve this overtime so wages pay it?" onConfirm={() => act.mutate({ path: `/attendance/${r.id}/ot-approve` })}><Button size="small">Approve</Button></Popconfirm>) }]} />
          </>
        )}
      </QueryState>
    </>
  );
}

/** the supervisor's grid: everyone starts as present, change the exceptions, save once */
function Mark() {
  const act = useAction({ success: 'Attendance saved' });
  const [day, setDay] = useState(todayISO());
  const [shift, setShift] = useState();
  const [picks, setPicks] = useState({});
  const { options } = useShifts();
  const workers = useGet('/workers', { limit: 200, active: 'true', shift_id: shift }, { enabled: !!shift });
  const saved = useGet('/attendance', { date: day, shift_id: shift }, { enabled: !!shift });
  const existing = Object.fromEntries((saved.payload || []).map((a) => [a.worker_id, a.status]));
  const statusOf = (w) => picks[w.id] ?? existing[w.id] ?? 'present';

  const save = () => act.mutate({
    path: '/attendance/bulk',
    body: { date: day, shift_id: shift, entries: (workers.payload || []).map((w) => ({ worker_id: w.id, status: statusOf(w) })) },
  }, { onSuccess: () => setPicks({}) });

  return (
    <>
      <Space wrap style={{ marginBottom: 12 }}>
        <Input type="date" value={day} max={todayISO()} onChange={(e) => { setDay(e.target.value); setPicks({}); }} style={{ width: 160 }} />
        <Select placeholder="Choose a shift" value={shift} onChange={(v) => { setShift(v); setPicks({}); }} options={options} style={{ width: 220 }} />
        <Button onClick={() => setPicks(Object.fromEntries((workers.payload || []).map((w) => [w.id, 'present'])))} disabled={!shift}>Mark everyone present</Button>
        <Button type="primary" disabled={!shift || !(workers.payload || []).length} loading={act.isPending} onClick={save}>Save attendance</Button>
      </Space>
      {!shift ? <NoData description="Choose a shift to mark attendance." /> : (
        <QueryState query={workers}>
          <Table rowKey="id" size="small" pagination={false} dataSource={workers.payload || []} scroll={{ y: 480 }} locale={{ emptyText: <NoData description="No workers have this shift as their default shift." /> }}
            columns={[{ title: 'Code', dataIndex: 'emp_code', width: 90 }, { title: 'Worker', dataIndex: 'name' }, { title: 'Stage', dataIndex: 'stage' },
              { title: 'Status', key: 's', width: 180, render: (_, w) => <Select value={statusOf(w)} options={STATUSES} style={{ width: 150 }} onChange={(v) => setPicks((p) => ({ ...p, [w.id]: v }))} /> }]} />
        </QueryState>
      )}
    </>
  );
}

/** one month, every worker, a letter per day */
function Register() {
  const [month, setMonth] = useState(monthISO());
  const [shift, setShift] = useState();
  const { options } = useShifts();
  const reg = useGet('/attendance/register', { month, shift_id: shift });
  const days = reg.payload?.days || [];
  return (
    <>
      <Space wrap style={{ marginBottom: 12 }}>
        <Input type="month" value={month} onChange={(e) => e.target.value && setMonth(e.target.value)} style={{ width: 160 }} />
        <Select allowClear placeholder="All shifts" value={shift} onChange={setShift} options={options} style={{ width: 220 }} />
      </Space>
      <QueryState query={reg}>
        <Table rowKey="worker_id" size="small" pagination={false} dataSource={reg.payload?.rows || []} scroll={{ x: 'max-content', y: 480 }}
          columns={[
            { title: 'Worker', key: 'w', fixed: 'left', width: 170, render: (_, r) => <>{r.name} <span style={{ color: 'var(--text-muted)' }}>{r.emp_code}</span></> },
            ...days.map((d) => ({ title: d.slice(8), key: d, width: 42, align: 'center', render: (_, r) => { const c = r.cells[d]; return c ? <span style={{ color: c.startsWith('A') ? 'var(--danger)' : c.startsWith('P') ? 'var(--ok)' : undefined, fontWeight: 600 }}>{c.replace('+OT', '*')}</span> : ''; } })),
            { title: 'Days', key: 'days', fixed: 'right', width: 70, align: 'right', render: (_, r) => r.totals.days_worked },
            { title: 'OT h', key: 'ot', fixed: 'right', width: 60, align: 'right', render: (_, r) => r.totals.ot_hours },
          ]} />
        <p style={{ marginTop: 8, color: 'var(--text-muted)', fontSize: 12 }}>P present · L late · H half day · A absent · V leave · W weekly off · O holiday · * overtime</p>
      </QueryState>
    </>
  );
}

export default function Attendance({ floor = false }) {
  const session = useSession();
  return (
    <>
      <PageTitle eyebrow={floor ? 'SUPERVISOR' : 'WORKFORCE'} title="Attendance" description="Mark who is in, see who is absent, and keep the monthly register that wages are worked out from." />
      <section className="panel">
        <Tabs items={[
          { key: 'today', label: 'Today', children: <Today /> },
          ...(session.can('attendance.mark') ? [{ key: 'mark', label: 'Mark attendance', children: <Mark /> }] : []),
          { key: 'register', label: 'Monthly register', children: <Register /> },
        ]} />
      </section>
    </>
  );
}
