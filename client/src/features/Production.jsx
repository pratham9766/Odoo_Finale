import { useState } from 'react';
import { Button, Form, Input, Modal, Progress, Select, Space, Table, Tag } from 'antd';
import { Link } from 'react-router-dom';
import { RemoteSelect } from '@/components/CrudPage';
import WorkOrderActions from '@/components/WorkOrderActions';
import { NoData, PageTitle, QueryState, Status } from '@/components/States';
import { useSession } from '@/context/Session';
import { todayISO, useAction, useGet } from '@/lib/hooks';
import { date, quantity } from '@/lib/format';

/** report a breakdown on a machine: it stops the machine and opens a maintenance ticket */
function BreakdownButton({ machine }) {
  const act = useAction({ success: 'Breakdown reported' });
  const [open, setOpen] = useState(false);
  const [form] = Form.useForm();
  return (
    <>
      <Button size="small" danger onClick={() => { form.resetFields(); setOpen(true); }}>Breakdown</Button>
      <Modal title={`Report breakdown: ${machine.code}`} open={open} onCancel={() => setOpen(false)} onOk={() => form.submit()} confirmLoading={act.isPending} destroyOnClose>
        <Form form={form} layout="vertical" requiredMark={false} initialValues={{ priority: 'high' }}
          onFinish={(v) => act.mutate({ path: `/machines/${machine.machine_id}/breakdown`, body: v }, { onSuccess: () => setOpen(false) })}>
          <Form.Item name="reason" label="What went wrong?" rules={[{ required: true, message: 'Describe the problem' }]}><Input.TextArea rows={2} autoFocus /></Form.Item>
          <Form.Item name="priority" label="Priority"><Select options={['low', 'normal', 'high', 'urgent'].map((v) => ({ value: v, label: v }))} /></Form.Item>
        </Form>
      </Modal>
    </>
  );
}

/** every machine as a card; `mine` shows only the machines the logged-in operator is assigned to today */
export function MachineBoard({ mine = false, floor = false }) {
  const session = useSession();
  const board = useGet('/production/board', { mine: mine ? 'true' : undefined }, { refetchInterval: 20000 });
  const machines = board.payload?.machines || [];
  const kpis = board.payload?.kpis;
  return (
    <>
      <PageTitle eyebrow={floor ? 'MY SHIFT' : 'PRODUCTION'} title={mine ? 'My machines' : 'Machine board'}
        description={mine ? 'The machines you are assigned to this shift. Log your output here.' : 'Live status of every machine, and today’s output.'}
        action={<Button onClick={() => board.refetch()} loading={board.isFetching}>Refresh</Button>} />
      {kpis && !mine && (
        <div className="kpi-row">
          {[['Running', kpis.running, 'green'], ['Idle', kpis.idle], ['Breakdown', kpis.breakdown, 'red'], ['Maintenance', kpis.maintenance], ['Utilisation', `${kpis.utilisation_pct}%`]]
            .map(([label, value, color]) => <div className="kpi" key={label}><span>{label}</span><strong style={color ? { color } : undefined}>{value}</strong></div>)}
          {Object.entries(kpis.today || {}).map(([uom, qty]) => <div className="kpi" key={uom}><span>Output today</span><strong>{quantity(qty)} {uom}</strong></div>)}
        </div>
      )}
      <section className="panel">
        <QueryState query={board}>
          {machines.length === 0 ? <NoData description={mine ? 'You have no machine assigned in the current shift.' : 'No machines configured yet.'} /> : (
            <div className="machine-grid">
              {machines.map((m) => (
                <article className="machine-card" key={m.machine_id}>
                  <div className="machine-card-head"><h2>{m.code}</h2><Status value={m.status} /></div>
                  <p>{m.stage}</p>
                  <dl><dt>Order</dt><dd>{m.order_no || 'No work order'}</dd><dt>Operator</dt><dd>{m.operator || 'Unassigned'}</dd></dl>
                  {m.work_order_id && <Progress percent={Number(m.pct) || 0} size="small" status={m.status === 'breakdown' ? 'exception' : 'active'} />}
                  <div className="output"><strong>{quantity(m.today_qty)}</strong> {m.uom || ''}<span>Recorded today</span></div>
                  <Space wrap size={4} style={{ marginTop: 8 }}>
                    {m.work_order_id && <WorkOrderActions compact id={m.work_order_id} uom={m.uom} status={m.status === 'running' ? 'running' : m.status === 'idle' ? 'paused' : undefined} />}
                    {session.can('breakdown.report') && m.status !== 'breakdown' && <BreakdownButton machine={m} />}
                  </Space>
                </article>
              ))}
            </div>
          )}
        </QueryState>
      </section>
    </>
  );
}

export function WorkOrders() {
  const session = useSession();
  const act = useAction({ success: 'Saved' });
  const [status, setStatus] = useState();
  const list = useGet('/work-orders', { limit: 100, status });
  const assign = (id, machine_id) => act.mutate({ method: 'PATCH', path: `/work-orders/${id}`, body: { machine_id } });
  return (
    <>
      <PageTitle eyebrow="PRODUCTION" title="Work orders" description="One work order per stage of an order. Put planned work on a machine, then start it." />
      <section className="panel">
        <Select allowClear placeholder="All statuses" value={status} onChange={setStatus} style={{ width: 180, marginBottom: 12 }} options={['planned', 'running', 'paused', 'done', 'cancelled'].map((v) => ({ value: v, label: v }))} />
        <QueryState query={list}>
          <Table rowKey="id" size="middle" dataSource={list.payload || []} scroll={{ x: 'max-content' }} pagination={{ pageSize: 20, hideOnSinglePage: true }}
            locale={{ emptyText: <NoData description="No work orders yet. Confirm an order and plan it from the order page." /> }}
            columns={[
              { title: 'Work order', dataIndex: 'wo_no', render: (v, r) => <>{<strong>{v}</strong>} {r.is_rework && <Tag color="orange">rework</Tag>}</> },
              { title: 'Order', dataIndex: 'order_no', render: (v, r) => <Link to={`/app/orders/${r.order_id}`}>{v}</Link> },
              { title: 'Item', dataIndex: 'item' }, { title: 'Stage', dataIndex: 'stage' },
              { title: 'Machine', dataIndex: 'machine_code', render: (v, r) => (r.status === 'planned' && session.can('production.plan')
                ? <RemoteSelect from={{ path: '/machines', params: { active: 'true' }, label: 'code' }} value={r.machine_id} onChange={(id) => assign(r.id, id ?? null)} style={{ width: 130 }} />
                : v || '–') },
              { title: 'Progress', render: (_, r) => <><Progress percent={Math.min(100, Number(r.pct) || 0)} size="small" style={{ width: 120 }} /><div style={{ fontSize: 12 }}>{quantity(r.produced_qty)} / {quantity(r.target_qty)} {r.uom}</div></> },
              { title: 'Status', dataIndex: 'status', render: (v) => <Status value={v === 'done' ? 'delivered' : v === 'planned' ? 'draft' : v} /> },
              { title: '', key: 'a', render: (_, r) => (r.machine_id ? <WorkOrderActions compact id={r.id} uom={r.uom} status={r.status} /> : r.status === 'planned' ? <span style={{ color: '#8C948E' }}>Choose a machine</span> : null) },
            ]} />
        </QueryState>
      </section>
    </>
  );
}

/** who works on which machine in a shift: one grid per date and shift */
export function Assignments({ embedded = false }) {
  const session = useSession();
  const act = useAction({ success: 'Assignments saved' });
  const [day, setDay] = useState(todayISO());
  const [shift, setShift] = useState();
  const [picks, setPicks] = useState({});      // worker_id -> machine_id the supervisor has chosen
  const shifts = useGet('/shifts');
  const workers = useGet('/workers', { limit: 200, active: 'true' });
  const machines = useGet('/machines', { limit: 200, active: 'true' });
  const current = useGet('/assignments', { date: day, shift_id: shift, limit: 200 }, { enabled: !!shift });
  const existing = Object.fromEntries((current.payload || []).map((a) => [a.worker_id, a.machine_id]));
  const value = (w) => (w.id in picks ? picks[w.id] : existing[w.id]);
  const canSave = session.can('assignment.create');

  function save() {
    const entries = Object.entries({ ...existing, ...picks }).filter(([, m]) => m).map(([worker_id, machine_id]) => ({ worker_id, machine_id }));
    act.mutate({ path: '/assignments', body: { date: day, shift_id: shift, entries } }, { onSuccess: () => setPicks({}) });
  }

  const body = (
    <section className="panel">
      <Space wrap style={{ marginBottom: 12 }}>
        <Input type="date" value={day} onChange={(e) => { setDay(e.target.value); setPicks({}); }} style={{ width: 160 }} />
        <Select placeholder="Choose a shift" value={shift} onChange={(v) => { setShift(v); setPicks({}); }} style={{ width: 200 }} options={(shifts.payload || []).map((s) => ({ value: s.id, label: `${s.name} (${s.start_time?.slice(0, 5)}–${s.end_time?.slice(0, 5)})` }))} />
        {canSave && <Button type="primary" disabled={!shift || Object.keys(picks).length === 0} loading={act.isPending} onClick={save}>Save assignments</Button>}
      </Space>
      {!shift ? <NoData description="Choose a shift to see and set who runs which machine." /> : (
        <QueryState query={workers}>
          <Table rowKey="id" size="small" pagination={false} dataSource={workers.payload || []} scroll={{ y: 460 }}
            columns={[
              { title: 'Code', dataIndex: 'emp_code', width: 90 }, { title: 'Worker', dataIndex: 'name' }, { title: 'Stage', dataIndex: 'stage' },
              { title: 'Machine', key: 'm', width: 200, render: (_, w) => (
                <Select allowClear showSearch optionFilterProp="label" disabled={!canSave} value={value(w)} style={{ width: 170 }} placeholder="Not assigned"
                  options={(machines.payload || []).map((m) => ({ value: m.id, label: `${m.code} · ${m.stage}` }))}
                  onChange={(m) => setPicks((p) => ({ ...p, [w.id]: m ?? null }))} />) },
            ]} />
        </QueryState>
      )}
    </section>
  );
  return embedded ? body : <><PageTitle eyebrow="PRODUCTION" title="Assignments" description="Put workers on machines for a shift." />{body}</>;
}

export function Maintenance() {
  const session = useSession();
  const act = useAction();
  const [status, setStatus] = useState();
  const [ticket, setTicket] = useState(null);
  const [form] = Form.useForm();
  const list = useGet('/maintenance/tickets', { limit: 100, status });
  const canFix = session.can('maintenance.fix') || session.can('breakdown.close');
  return (
    <>
      <PageTitle eyebrow="PRODUCTION" title="Maintenance" description="Breakdown tickets. Starting a fix marks the machine under maintenance; resolving it puts the machine back to idle." />
      <section className="panel">
        <Select allowClear placeholder="All tickets" value={status} onChange={setStatus} style={{ width: 180, marginBottom: 12 }} options={['open', 'in_progress', 'resolved'].map((v) => ({ value: v, label: v.replace('_', ' ') }))} />
        <QueryState query={list}>
          <Table rowKey="id" size="middle" dataSource={list.payload || []} scroll={{ x: 'max-content' }} locale={{ emptyText: <NoData description="No breakdown tickets." /> }}
            columns={[
              { title: 'Ticket', dataIndex: 'ticket_no', render: (v) => <strong>{v}</strong> }, { title: 'Machine', dataIndex: 'machine_code' }, { title: 'Stage', dataIndex: 'stage' },
              { title: 'Problem', dataIndex: 'reason' }, { title: 'Priority', dataIndex: 'priority', render: (v) => <Tag color={v === 'urgent' ? 'red' : v === 'high' ? 'orange' : 'default'}>{v}</Tag> },
              { title: 'Status', dataIndex: 'status', render: (v) => <Tag color={v === 'resolved' ? 'green' : v === 'in_progress' ? 'blue' : 'red'}>{v.replace('_', ' ')}</Tag> },
              { title: 'Opened', dataIndex: 'opened_at', render: date },
              { title: '', key: 'a', render: (_, r) => canFix && r.status !== 'resolved' && (
                <Space>
                  {r.status === 'open' && <Button size="small" onClick={() => act.mutate({ path: `/maintenance/tickets/${r.id}/start` })}>Start fix</Button>}
                  <Button size="small" type="primary" onClick={() => { form.resetFields(); setTicket(r); }}>Resolve</Button>
                </Space>) },
            ]} />
        </QueryState>
      </section>
      <Modal title={`Resolve ${ticket?.ticket_no ?? ''}`} open={!!ticket} onCancel={() => setTicket(null)} onOk={() => form.submit()} confirmLoading={act.isPending} destroyOnClose>
        <Form form={form} layout="vertical" requiredMark={false} onFinish={(v) => act.mutate({ path: `/maintenance/tickets/${ticket.id}/resolve`, body: { resolution: v.resolution, ...(v.parts_used ? { parts_used: v.parts_used } : {}) } }, { onSuccess: () => setTicket(null) })}>
          <Form.Item name="resolution" label="What was done?" rules={[{ required: true, message: 'Describe the fix' }]}><Input.TextArea rows={2} /></Form.Item>
          <Form.Item name="parts_used" label="Parts used (optional)"><Input /></Form.Item>
        </Form>
      </Modal>
    </>
  );
}
