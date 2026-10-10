import { useState } from 'react';
import { Alert, Button, Form, Input, Modal, Popconfirm, Select, Space, Switch, Table, Tabs, Tag, Typography } from 'antd';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { NoData, PageTitle, QueryState } from '@/components/States';
import { RfidCardActions, RfidCardTag, normalizeUid } from '@/components/RfidCard';
import { useSession } from '@/context/Session';
import { todayISO, useAction, useGet } from '@/lib/hooks';

const DEMO_ORDER = ['DEMO-RAVI', 'DEMO-PRIYA', 'DEMO-ARJUN', 'DEMO-MEENA'];
const ATT_COLOR = { present: 'green', late: 'orange', half_day: 'gold', absent: 'red', leave: 'blue' };
const SCAN = {
  accepted: { color: 'green', label: 'Accepted', alert: 'success' },
  duplicate: { color: 'gold', label: 'Duplicate', alert: 'warning' },
  unknown_card: { color: 'red', label: 'Unknown card', alert: 'error' },
  invalid_employee: { color: 'red', label: 'Inactive worker', alert: 'error' },
  rejected: { color: 'volcano', label: 'Rejected', alert: 'error' },
};
const SOURCE_COLOR = { hardware: 'geekblue', simulator: 'purple', manual: 'default' };

const time = (v) => (v ? new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date(v)) : '—');
const dateTime = (v) => (v ? new Intl.DateTimeFormat('en-IN', { timeZone: 'Asia/Kolkata', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit', second: '2-digit' }).format(new Date(v)) : '—');
const addDaysISO = (d, n) => new Date(Date.parse(`${d}T00:00:00Z`) + n * 86_400_000).toISOString().slice(0, 10);

const ScanTag = ({ status }) => <Tag color={SCAN[status]?.color}>{SCAN[status]?.label ?? status}</Tag>;
const SourceTag = ({ source }) => (source ? <Tag color={SOURCE_COLOR[source]}>{source}</Tag> : '—');
const AttTag = ({ status }) => (status ? <Tag color={ATT_COLOR[status]}>{status.replace('_', ' ')}</Tag> : <Tag>not checked in</Tag>);

function randomUid() {
  const bytes = new Uint8Array(4);
  crypto.getRandomValues(bytes);
  return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('').toUpperCase();
}

// ---- virtual scanner ------------------------------------------------------------------------------------------------

/** Buttons that send scans through the server's real pipeline (POST /rfid/simulate), never local state. */
function VirtualScanner({ demo }) {
  const session = useSession();
  const cache = useQueryClient();
  const [log, setLog] = useState([]);
  const [custom, setCustom] = useState('');
  const refresh = () => cache.invalidateQueries({ queryKey: [session.userId] });

  const scan = useMutation({
    mutationFn: ({ body }) => session.api('/rfid/simulate', { method: 'POST', body }),
    onSuccess: (res, vars) => { setLog((l) => [{ key: res.data.event_id, label: vars.label, ...res.data }, ...l].slice(0, 6)); refresh(); },
    onError: (err, vars) => setLog((l) => [{ key: `${Date.now()}`, label: vars.label, status: 'error', message: err.message }, ...l].slice(0, 6)),
  });
  const reset = useMutation({
    mutationFn: () => session.api('/rfid/demo/reset', { method: 'POST' }),
    onSuccess: (res) => { setLog([{ key: `reset-${Date.now()}`, status: 'reset', message: `Demo reset: ${res.data.scans_deleted} simulator scans and ${res.data.attendance_deleted} simulator check-ins removed` }]); refresh(); },
    onError: (err) => setLog((l) => [{ key: `${Date.now()}`, status: 'error', message: err.message }, ...l]),
  });

  const cards = DEMO_ORDER.map((code) => demo.find((d) => d.emp_code === code)).filter(Boolean);
  const busy = scan.isPending || reset.isPending;

  return (
    <section className="panel rfid-scanner">
      <div className="rfid-scanner-head">
        <div>
          <h3 style={{ margin: 0 }}>Virtual RFID scanner</h3>
          <Typography.Text type="secondary">Demo / development only. Each button sends a real scan to the server, recorded as source “simulator”.</Typography.Text>
        </div>
        {session.can('rfid.manage') && (
          <Popconfirm title="Reset demo attendance?" description="Deletes only simulator scans and the check-ins they created. Card reader and manual records are kept."
            okText="Reset" okButtonProps={{ danger: true }} onConfirm={() => reset.mutate()}>
            <Button danger loading={reset.isPending}>Reset demo attendance</Button>
          </Popconfirm>
        )}
      </div>
      <div className="rfid-scan-buttons">
        {cards.map((c, i) => (
          <Button key={c.worker_id} size="large" disabled={busy || !c.card_uid}
            onClick={() => scan.mutate({ body: { worker_id: c.worker_id }, label: `Card ${i + 1} — ${c.name}` })}>
            <span className="rfid-btn-title">Simulate Card {i + 1} — {c.name}</span>
            <span className="rfid-btn-uid">{c.card_uid ?? 'no card'}</span>
          </Button>
        ))}
        <Button size="large" danger disabled={busy} onClick={() => { const uid = randomUid(); scan.mutate({ body: { card_uid: uid }, label: `Unknown card ${uid}` }); }}>
          <span className="rfid-btn-title">Simulate Unknown Card</span>
          <span className="rfid-btn-uid">random UID</span>
        </Button>
      </div>
      {cards.length < DEMO_ORDER.length && (
        <Alert type="info" showIcon style={{ marginTop: 12 }} message="Some demo workers are missing. Run “npm run seed:rfid” in server/ to create the four demo cards." />
      )}
      <Space.Compact style={{ marginTop: 12, maxWidth: 360, width: '100%' }}>
        <Input placeholder="Any card UID, e.g. A1B2C3D4" value={custom} onChange={(e) => setCustom(normalizeUid(e.target.value))} style={{ fontFamily: 'monospace' }} maxLength={40}
          onPressEnter={() => custom && scan.mutate({ body: { card_uid: custom }, label: `UID ${custom}` })} />
        <Button disabled={busy || !custom} onClick={() => scan.mutate({ body: { card_uid: custom }, label: `UID ${custom}` })}>Scan</Button>
      </Space.Compact>
      <div className="rfid-feedback" aria-live="polite">
        {scan.isPending && <Alert type="info" message="Sending scan…" />}
        {log.map((r) => (
          <Alert key={r.key} showIcon
            type={r.status === 'error' ? 'error' : r.status === 'reset' ? 'info' : SCAN[r.status]?.alert ?? 'info'}
            message={<>{r.label && <strong>{r.label}: </strong>}{r.status === 'error' ? 'Request failed' : r.status === 'reset' ? 'Done' : SCAN[r.status]?.label}{r.worker ? ` · ${r.worker.name}` : ''}{r.scanned_at ? ` · ${time(r.scanned_at)}` : ''}</>}
            description={<>{r.message}{r.shift ? ` (shift ${r.shift}${r.late_min ? `, ${r.late_min} min late` : ''})` : ''}</>} />
        ))}
      </div>
    </section>
  );
}

// ---- live board -----------------------------------------------------------------------------------------------------

function LiveBoard({ config }) {
  const session = useSession();
  const [date, setDate] = useState();                  // undefined = the running shift's date (server decides)
  const board = useGet('/rfid/dashboard', { date }, { refetchInterval: 2000 });
  const demo = useGet('/rfid/cards', { status: 'assigned', q: 'DEMO-' }, { enabled: session.can('rfid.simulate') && config?.simulator_enabled });
  const d = board.payload;
  const k = d?.kpis;

  return (
    <>
      {session.can('rfid.simulate') && config?.simulator_enabled && <VirtualScanner demo={demo.payload || []} />}
      <section className="panel">
        <Space wrap style={{ marginBottom: 12 }} align="center">
          <Input type="date" value={date ?? d?.date ?? ''} max={todayISO()} onChange={(e) => setDate(e.target.value || undefined)} style={{ width: 160 }} />
          {date && <Button onClick={() => setDate(undefined)}>Current shift</Button>}
          <Typography.Text type="secondary">Attendance date {d?.date ?? '…'} · refreshes every 2 s{board.isFetching ? ' · updating' : ''}</Typography.Text>
        </Space>
        <QueryState query={board}>
          {k && (
            <div className="kpi-row">
              {[['Employees with cards', k.enrolled], ['Present', k.present, 'var(--ok)'], ['Not checked in', k.not_checked_in, 'var(--danger)'], ['Late arrivals', k.late, 'var(--risk)']]
                .map(([label, value, color]) => <div className="kpi" key={label}><span>{label}</span><strong style={color ? { color } : undefined}>{value}</strong></div>)}
            </div>
          )}
          <p className="rfid-note">Late is judged only for workers with a default shift (start + grace). Workers without one are checked into the running shift. Counts include manual attendance; {k?.workers_total ?? '—'} active workers in total.</p>
          <Table rowKey="worker_id" size="small" pagination={false} dataSource={d?.people || []} scroll={{ x: 'max-content' }}
            locale={{ emptyText: <NoData description="Nobody has an RFID card yet. Assign cards on the Cards tab or the Workers screen." /> }}
            columns={[
              { title: 'Employee', key: 'n', render: (_, p) => <><strong>{p.name}</strong> <span className="muted">{p.emp_code}</span></> },
              { title: 'Role', dataIndex: 'role' }, { title: 'Department', dataIndex: 'department' }, { title: 'Machine / area', dataIndex: 'area' },
              { title: 'Status', key: 's', render: (_, p) => <Space size={4}><AttTag status={p.attendance_status} />{p.late_min > 0 && <span className="muted">{p.late_min} min</span>}</Space> },
              { title: 'Check-in', dataIndex: 'check_in', render: time }, { title: 'Shift', dataIndex: 'shift' },
              { title: 'Last scan', dataIndex: 'last_scan_at', render: time },
              { title: 'Scanner', key: 'src', render: (_, p) => (p.last_scan_source ? <Space size={4}><SourceTag source={p.last_scan_source} /><span className="muted">{p.last_scan_device}</span></Space> : '—') },
              { title: 'Card', key: 'c', render: (_, p) => <RfidCardTag uid={p.card_uid} placeholder={p.is_placeholder} /> },
            ]} />
          <h3 style={{ marginTop: 20 }}>Recent RFID activity</h3>
          <EventsTable rows={d?.recent || []} />
        </QueryState>
      </section>
    </>
  );
}

function EventsTable({ rows, pagination = false }) {
  return (
    <Table rowKey="id" size="small" pagination={pagination} dataSource={rows} scroll={{ x: 'max-content' }}
      locale={{ emptyText: <NoData description="No scans yet." /> }}
      columns={[
        { title: 'Time', dataIndex: 'scanned_at', render: dateTime },
        { title: 'Employee', key: 'w', render: (_, e) => (e.worker ? <>{e.worker} <span className="muted">{e.emp_code}</span></> : <span className="muted">—</span>) },
        { title: 'Role', dataIndex: 'role', render: (v) => v ?? '—' },
        { title: 'Card', dataIndex: 'card_uid', render: (v) => <code>{v}</code> },
        { title: 'Result', dataIndex: 'status', render: (v) => <ScanTag status={v} /> },
        { title: 'Check-in', key: 'a', render: (_, e) => e.attendance_action?.replaceAll('_', ' ') ?? '—' },
        { title: 'Shift', key: 'sh', render: (_, e) => (e.shift ? `${e.shift} · ${e.shift_date}` : '—') },
        { title: 'Source', dataIndex: 'source', render: (v) => <SourceTag source={v} /> },
        { title: 'Device', dataIndex: 'device' },
      ]} />
  );
}

// ---- cards ----------------------------------------------------------------------------------------------------------

function Cards() {
  const [q, setQ] = useState();
  const [status, setStatus] = useState();
  const cards = useGet('/rfid/cards', { q, status });
  return (
    <section className="panel">
      <Space wrap style={{ marginBottom: 12 }}>
        <Input.Search allowClear placeholder="Name, code or card UID" onSearch={(v) => setQ(v || undefined)} style={{ width: 260 }} />
        <Select allowClear placeholder="All workers" value={status} onChange={setStatus} style={{ width: 200 }}
          options={[{ value: 'assigned', label: 'With a card' }, { value: 'unassigned', label: 'Without a card' }, { value: 'placeholder', label: 'Awaiting physical card' }]} />
      </Space>
      <QueryState query={cards}>
        <Table rowKey="worker_id" size="small" dataSource={cards.payload || []} pagination={{ pageSize: 25, hideOnSinglePage: true }} scroll={{ x: 'max-content' }}
          locale={{ emptyText: <NoData description="No workers match." /> }}
          columns={[
            { title: 'Code', dataIndex: 'emp_code', width: 110 }, { title: 'Name', dataIndex: 'name', render: (v) => <strong>{v}</strong> },
            { title: 'Role', dataIndex: 'role' }, { title: 'Department', dataIndex: 'department' }, { title: 'Area', dataIndex: 'work_area' },
            { title: 'RFID card', key: 'c', render: (_, w) => <RfidCardTag uid={w.card_uid} placeholder={w.is_placeholder} /> },
            { title: '', key: 'x', render: (_, w) => <RfidCardActions worker={w} /> },
          ]} />
      </QueryState>
    </section>
  );
}

// ---- scanner devices ------------------------------------------------------------------------------------------------

function Scanners() {
  const session = useSession();
  const devices = useGet('/rfid/devices');
  const act = useAction();
  const [adding, setAdding] = useState(false);
  const [issued, setIssued] = useState(null);       // { code, device_key } shown once
  const [form] = Form.useForm();
  const manage = session.can('rfid.manage');

  const show = (res) => setIssued({ code: res.data.code, key: res.data.device_key });
  const create = (v) => act.mutate({ path: '/rfid/devices', body: { code: v.code, name: v.name || undefined } },
    { onSuccess: (res) => { setAdding(false); form.resetFields(); show(res); } });

  return (
    <section className="panel">
      {manage && <Button type="primary" onClick={() => setAdding(true)} style={{ marginBottom: 12 }}>Register a scanner</Button>}
      <QueryState query={devices}>
        <Table rowKey="id" size="small" pagination={false} dataSource={devices.payload || []} scroll={{ x: 'max-content' }}
          columns={[
            { title: 'Device ID', dataIndex: 'code', render: (v) => <code>{v}</code> }, { title: 'Name', dataIndex: 'name' },
            { title: 'Kind', dataIndex: 'kind', render: (v) => <Tag color={v === 'hardware' ? 'geekblue' : 'purple'}>{v}</Tag> },
            { title: 'Last seen', dataIndex: 'last_seen_at', render: dateTime },
            { title: 'Active', key: 'a', render: (_, d) => (manage ? <Switch size="small" checked={d.active} onChange={(active) => act.mutate({ method: 'PATCH', path: `/rfid/devices/${d.id}`, body: { active } })} /> : d.active ? 'Yes' : 'No') },
            { title: '', key: 'r', render: (_, d) => manage && d.kind === 'hardware' && (
              <Popconfirm title={`Issue a new key for ${d.code}?`} description="The old key stops working; update config.h on the ESP32." onConfirm={() => act.mutate({ path: `/rfid/devices/${d.id}/rotate-key` }, { onSuccess: show })}>
                <Button size="small">Rotate key</Button>
              </Popconfirm>
            ) },
          ]} />
      </QueryState>
      <Modal open={adding} title="Register an RFID scanner" okText="Register" confirmLoading={act.isPending} onCancel={() => setAdding(false)} onOk={() => form.submit()} destroyOnHidden>
        <Form form={form} layout="vertical" onFinish={create} preserve={false}>
          <Form.Item name="code" label="Device ID" rules={[{ required: true }, { pattern: /^[A-Za-z0-9_-]{2,40}$/, message: 'Letters, digits, _ or -' }]}
            normalize={(v) => v?.toUpperCase()} extra="Must match DEVICE_ID in the ESP32 config.h, e.g. GATE_01">
            <Input placeholder="GATE_01" maxLength={40} />
          </Form.Item>
          <Form.Item name="name" label="Name"><Input placeholder="Main gate" maxLength={80} /></Form.Item>
        </Form>
      </Modal>
      <Modal open={Boolean(issued)} title={`Device key for ${issued?.code}`} onCancel={() => setIssued(null)} onOk={() => setIssued(null)} okText="I have copied it" cancelButtonProps={{ style: { display: 'none' } }}>
        <Alert type="warning" showIcon message="Shown only once" description="Copy it into DEVICE_KEY in the ESP32 config.h. The server stores only a hash; if it is lost, rotate the key." style={{ marginBottom: 12 }} />
        <Typography.Paragraph copyable={{ text: issued?.key }} style={{ fontFamily: 'monospace', wordBreak: 'break-all' }}>{issued?.key}</Typography.Paragraph>
      </Modal>
    </section>
  );
}

// ---- history --------------------------------------------------------------------------------------------------------

function History() {
  const [to, setTo] = useState(todayISO());
  const [from, setFrom] = useState(addDaysISO(todayISO(), -6));
  const [source, setSource] = useState();
  const [page, setPage] = useState(1);
  const rows = useGet('/rfid/history', { from, to, source });
  const events = useGet('/rfid/events', { from, to, source: source === 'manual' ? undefined : source, page, limit: 25 });
  return (
    <section className="panel">
      <Space wrap style={{ marginBottom: 12 }}>
        <Input type="date" value={from} max={to} onChange={(e) => e.target.value && setFrom(e.target.value)} style={{ width: 160 }} />
        <Input type="date" value={to} min={from} onChange={(e) => e.target.value && setTo(e.target.value)} style={{ width: 160 }} />
        <Select allowClear placeholder="All sources" value={source} onChange={(v) => { setSource(v); setPage(1); }} style={{ width: 180 }}
          options={[{ value: 'hardware', label: 'Card reader' }, { value: 'simulator', label: 'Simulator' }, { value: 'manual', label: 'Manual' }]} />
      </Space>
      <h3>Attendance records</h3>
      <QueryState query={rows}>
        <Table rowKey="id" size="small" dataSource={rows.payload || []} pagination={{ pageSize: 25, hideOnSinglePage: true }} scroll={{ x: 'max-content' }}
          locale={{ emptyText: <NoData description="No attendance in this period." /> }}
          columns={[
            { title: 'Date', dataIndex: 'date' }, { title: 'Employee', key: 'w', render: (_, a) => <>{a.worker} <span className="muted">{a.emp_code}</span></> },
            { title: 'Check-in', dataIndex: 'check_in', render: dateTime }, { title: 'Shift', dataIndex: 'shift' },
            { title: 'Status', dataIndex: 'status', render: (v) => <AttTag status={v} /> },
            { title: 'Source', dataIndex: 'source', render: (v) => <SourceTag source={v} /> },
            { title: 'Device', dataIndex: 'device', render: (v) => v ?? '—' },
            { title: 'Scan result', dataIndex: 'scan_result', render: (v) => (v ? <ScanTag status={v} /> : '—') },
            { title: 'Review', dataIndex: 'needs_correction', render: (v) => (v ? <Tag color="orange">no check-out yet</Tag> : '') },
          ]} />
      </QueryState>
      {source !== 'manual' && (
        <>
          <h3 style={{ marginTop: 20 }}>Scan log</h3>
          <QueryState query={events}>
            <EventsTable rows={events.payload || []} pagination={{ current: page, pageSize: 25, total: events.meta?.total, onChange: setPage, hideOnSinglePage: true }} />
          </QueryState>
        </>
      )}
    </section>
  );
}

/** The live board with the virtual scanner, for embedding in the Attendance page. */
export function RfidLive() {
  const config = useGet('/rfid/config');
  return <LiveBoard config={config.payload} />;
}

export default function Rfid() {
  const config = useGet('/rfid/config');
  return (
    <>
      <PageTitle eyebrow="WORKFORCE" title="RFID attendance"
        description="Card scans check workers in through the same attendance records wages use. Later scans are logged but never check anyone out automatically." />
      <Tabs items={[
        { key: 'live', label: 'Live board', children: <LiveBoard config={config.payload} /> },
        { key: 'cards', label: 'Cards', children: <Cards /> },
        { key: 'scanners', label: 'Scanners', children: <Scanners /> },
        { key: 'history', label: 'History', children: <History /> },
      ]} />
    </>
  );
}
