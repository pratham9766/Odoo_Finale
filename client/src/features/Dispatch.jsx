import { useRef, useState } from 'react';
import { Alert, Button, Descriptions, Form, Input, Modal, Popconfirm, Select, Space, Table } from 'antd';
import { Link, useNavigate, useParams } from 'react-router-dom';
import { RemoteSelect } from '@/components/CrudPage';
import { NoData, PageTitle, QueryState, Status } from '@/components/States';
import { useSession } from '@/context/Session';
import { useAction, useGet } from '@/lib/hooks';
import { date, quantity } from '@/lib/format';

const STATUS_COLOR = { packing: 'draft', confirmed: 'confirmed', in_transit: 'in_production', delivered: 'delivered', cancelled: 'cancelled' };

export function Dispatches({ floor = false }) {
  const session = useSession();
  const [status, setStatus] = useState();
  const list = useGet('/dispatches', { limit: 100, status });
  const base = floor ? '/floor/dispatch' : '/app/dispatch';
  return (
    <>
      <PageTitle title="Dispatch" description="Load finished rolls onto a truck. Each roll can go out only once, and the invoice is made from the rolls you scan."
        action={session.can('dispatch.create') && <Link to={`${base}/new`}><Button type="primary">New dispatch</Button></Link>} />
      <section className="panel">
        <Select allowClear placeholder="All statuses" value={status} onChange={setStatus} style={{ width: 180, marginBottom: 12 }} options={['packing', 'confirmed', 'in_transit', 'delivered', 'cancelled'].map((v) => ({ value: v, label: v.replace('_', ' ') }))} />
        <QueryState query={list}>
          <Table rowKey="id" size="middle" dataSource={list.payload || []} scroll={{ x: 'max-content' }} pagination={{ pageSize: 20, hideOnSinglePage: true }} locale={{ emptyText: <NoData description="No dispatches yet." /> }}
            columns={[
              { title: 'Dispatch', dataIndex: 'dispatch_no', render: (v, r) => <Link to={`${base}/${r.id}`}><strong>{v}</strong></Link> },
              { title: 'Order', dataIndex: 'order_no' }, { title: 'Buyer', dataIndex: 'to_party' }, { title: 'Vehicle', dataIndex: 'vehicle_no' },
              { title: 'Rolls', dataIndex: 'roll_count', align: 'right' }, { title: 'Metres', dataIndex: 'total_m', align: 'right', render: quantity },
              { title: 'Status', dataIndex: 'status', render: (v) => <Status value={STATUS_COLOR[v] || v} /> }, { title: 'Date', dataIndex: 'created_at', render: date },
            ]} />
        </QueryState>
      </section>
    </>
  );
}

export function NewDispatch({ floor = false }) {
  const act = useAction({ success: 'Dispatch created' });
  const navigate = useNavigate();
  const base = floor ? '/floor/dispatch' : '/app/dispatch';
  const orders = useGet('/orders', { limit: 100, status: 'ready_to_ship,partially_dispatched,in_production,in_qc' });
  return (
    <>
      <PageTitle title="New dispatch" description="Pick the order that is going out. You will scan the rolls on the next screen." />
      <section className="panel form-panel">
        <Form layout="vertical" requiredMark={false} onFinish={(v) => act.mutate({ path: '/dispatches', body: Object.fromEntries(Object.entries(v).filter(([, x]) => x)) }, { onSuccess: (res) => navigate(`${base}/${res.data.id}`) })}>
          <div className="form-grid">
            <Form.Item name="order_id" label="Order" rules={[{ required: true, message: 'Choose the order' }]}>
              <Select showSearch optionFilterProp="label" loading={orders.isLoading} options={(orders.payload || []).map((o) => ({ value: o.id, label: `${o.order_no} · ${o.buyer_name || ''} · ${o.status.replaceAll('_', ' ')}` }))} />
            </Form.Item>
            <Form.Item name="vehicle_no" label="Vehicle number"><Input /></Form.Item>
            <Form.Item name="driver_name" label="Driver name"><Input /></Form.Item>
            <Form.Item name="driver_phone" label="Driver phone"><Input /></Form.Item>
          </div>
          <Space><Button type="primary" htmlType="submit" size="large" loading={act.isPending}>Create dispatch</Button><Link to={base}>Cancel</Link></Space>
        </Form>
      </section>
    </>
  );
}

/** scan or type a roll number: the server refuses a roll that is not passed, belongs to another order or is already on a truck */
export function DispatchDetail({ floor = false }) {
  const { id } = useParams();
  const session = useSession();
  const act = useAction();
  const [code, setCode] = useState('');
  const [problem, setProblem] = useState(null);
  const input = useRef(null);
  const q = useGet(`/dispatches/${id}`, {}, { refetchInterval: 15000 });
  const d = q.payload;
  const packing = d?.status === 'packing';
  const base = floor ? '/floor/dispatch' : '/app/dispatch';

  function scan() {
    const value = code.trim();
    if (!value) return;
    setProblem(null);
    act.mutate({ path: `/dispatches/${id}/scan`, body: { code: value } }, {
      onSuccess: () => { setCode(''); input.current?.focus(); },
      onError: (e) => { setProblem(e.message); setCode(''); input.current?.focus(); },
    });
  }

  const confirm = () => act.mutate({ path: `/dispatches/${id}/confirm` }, { onSuccess: (res) => Modal.success({ title: 'Dispatch confirmed', content: 'The invoice was created from the scanned rolls.' }) });
  const move = (status) => act.mutate({ path: `/dispatches/${id}/status`, body: { status } });

  return (
    <>
      <Link to={base}>← All dispatches</Link>
      <PageTitle title={d?.dispatch_no || 'Dispatch'} description={d ? `${d.order_no} · ${d.to_party}` : ''}
        action={d && (
          <Space wrap>
            <Button onClick={() => session.download(`/dispatches/${id}/packing-list.pdf`, `packing-list-${d.dispatch_no}.pdf`).catch(() => {})}>Packing list (PDF)</Button>
            {packing && session.can('dispatch.confirm') && <Popconfirm title={`Confirm ${d.rolls.length} rolls and create the invoice?`} disabled={d.rolls.length === 0} onConfirm={confirm}><Button type="primary" disabled={d.rolls.length === 0} loading={act.isPending}>Confirm and invoice</Button></Popconfirm>}
            {d.status === 'confirmed' && session.can('dispatch.confirm') && <Button onClick={() => move('in_transit')}>Mark in transit</Button>}
            {(d.status === 'confirmed' || d.status === 'in_transit') && session.can('dispatch.confirm') && <Button type="primary" onClick={() => move('delivered')}>Mark delivered</Button>}
          </Space>)} />
      <QueryState query={q}>
        {d && (
          <>
            <section className="panel">
              <Descriptions column={{ xs: 1, sm: 2, md: 4 }} items={[
                { key: 's', label: 'Status', children: <Status value={STATUS_COLOR[d.status] || d.status} /> }, { key: 'v', label: 'Vehicle', children: d.vehicle_no || '–' }, { key: 'dr', label: 'Driver', children: [d.driver_name, d.driver_phone].filter(Boolean).join(' · ') || '–' },
                { key: 'c', label: 'Confirmed', children: date(d.confirmed_at) },
                { key: 'o', label: 'Ordered', children: `${quantity(d.totals.ordered)} m` }, { key: 'e', label: 'Sent earlier', children: `${quantity(d.totals.earlier)} m` },
                { key: 'sc', label: 'On this truck', children: `${quantity(d.totals.scanned)} m` }, { key: 'r', label: 'Still to send', children: `${quantity(d.totals.remaining)} m` },
              ]} />
            </section>
            {packing && session.can('dispatch.create') && (
              <section className="panel">
                <h3>Scan a roll</h3>
                <Space.Compact style={{ width: '100%', maxWidth: 520 }}>
                  <Input ref={input} autoFocus size="large" value={code} onChange={(e) => setCode(e.target.value)} onPressEnter={scan} placeholder="Scan the barcode or type the roll number" />
                  <Button type="primary" size="large" onClick={scan} loading={act.isPending}>Add roll</Button>
                </Space.Compact>
                {problem && <Alert style={{ marginTop: 12 }} type="error" showIcon message={problem} closable onClose={() => setProblem(null)} />}
              </section>
            )}
            <section className="panel">
              <h3>Rolls on this dispatch ({d.rolls.length})</h3>
              <Table rowKey="roll_id" size="small" pagination={false} dataSource={d.rolls} locale={{ emptyText: <NoData description="No rolls scanned yet." /> }}
                columns={[
                  { title: 'Roll', dataIndex: 'roll_no', render: (v) => <strong>{v}</strong> }, { title: 'Fabric', dataIndex: 'item' }, { title: 'Colour', dataIndex: 'colour' },
                  { title: 'Length (m)', dataIndex: 'length_m', align: 'right', render: quantity }, { title: 'Weight (kg)', dataIndex: 'weight_kg', align: 'right', render: quantity },
                  { title: '', key: 'a', render: (_, r) => packing && session.can('dispatch.create') && <Popconfirm title="Remove this roll?" onConfirm={() => act.mutate({ method: 'DELETE', path: `/dispatches/${id}/rolls/${r.roll_id}` })}><Button size="small" danger>Remove</Button></Popconfirm> },
                ]} />
            </section>
          </>
        )}
      </QueryState>
    </>
  );
}
